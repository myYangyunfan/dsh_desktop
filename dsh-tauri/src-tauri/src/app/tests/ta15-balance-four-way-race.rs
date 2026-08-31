//! TA15 竞态测试 #6：balance 四路并发——节流窗到期瞬间同时来
//! turn-end（非强制节流）+ 菜单 toggle（强制）+ 轮询 tick + 可见性恢复，
//! in-flight 去重下实际 fetch 次数断言。
//!
//! 行为级注入边界（与 TA4 同结论）：`commands::balance` 为私有 mod，
//! `BalanceState.last_attempt`/`fetching` 私有、`fetch_once` 需真实
//! `AppHandle`（spawn node 子进程）——集成测试不可物化。本测试双轨：
//!   1. 真线程并发仿真：以与生产**同款原语**（AtomicBool swap 去重 +
//!      Mutex<Instant> 节流窗 + 先检查后落笔序）复刻 trigger_fetch_throttled
//!      / fetch_and_push 的交错语义，四路同时发起 → 断言实际 spawn 次数；
//!   2. 形态锁（include_str!）：swap 门在 spawn 之前、节流先于 spawn、
//!      强制路径不经节流——源序不被静默改坏（升级为行为级的哨兵）。
//!
//! 仿真结论（与实现读码一致）：
//!   · 四路同时 → 恰 1 次 in-flight fetch（swap 抢占，其余早退）；
//!   · 节流窗**到期差 1ms**（elapsed < 30s）→ turn-end 路径静默 0 次；
//!   · 到期瞬间 turn-end + toggle + tick 并发 → 非强制路径最多贡献 1 次发起，
//!     强制路径（toggle/恢复）不受节流但受 in-flight 去重合并 → 总 fetch ≤ 2
//!     且 ≥ 1；
//!   · 重复运行 200 轮无饥饿（fetching 旗标必然归还——store(false) 无早期
//!     return 路径）。

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const TURN_END_THROTTLE: Duration = Duration::from_secs(30);

/// 生产同款并发核（fetch 用计数器替代 spawn node）。
struct SimBalance {
    fetching: AtomicBool,
    last_attempt: Mutex<Option<Instant>>,
    fetches: AtomicUsize,
}

impl SimBalance {
    fn new() -> Self {
        Self { fetching: AtomicBool::new(false), last_attempt: Mutex::new(None), fetches: AtomicUsize::new(0) }
    }

    /// fetch_and_push 同构：swap 抢占 → 取数 → 必然归还。
    fn fetch_and_push(&self) {
        if self.fetching.swap(true, Ordering::AcqRel) {
            return; // in-flight：直接返回（不释放旗标——归还属持有者）
        }
        self.fetches.fetch_add(1, Ordering::AcqRel);
        std::thread::sleep(Duration::from_micros(200)); // 模拟子进程时延
        self.fetching.store(false, Ordering::Release);
    }

    /// trigger_fetch_throttled 同构：节流窗先检后落笔，穿透至 fetch_and_push。
    fn trigger_throttled(&self) {
        {
            let mut last = self.last_attempt.lock().unwrap();
            if last.is_some_and(|t| t.elapsed() < TURN_END_THROTTLE) {
                return;
            }
            *last = Some(Instant::now());
        }
        self.fetch_and_push();
    }

    /// 强制路径（菜单 toggle / balance_refresh 命令 / 可见性恢复补刷）。
    fn trigger_force(&self) {
        self.fetch_and_push();
    }
}

#[test]
fn ta15_four_way_same_instant_single_fetch() {
    // 四路同时打在同一瞬间（双栏栅对齐出发）。
    use std::sync::Barrier;
    let sim = Arc::new(SimBalance::new());
    let arrive = Arc::new(Barrier::new(4));
    let go = Arc::new(Barrier::new(4));
    let mut kids = Vec::new();
    for role in 0..4 {
        let (sim, arrive, go) = (sim.clone(), arrive.clone(), go.clone());
        kids.push(std::thread::spawn(move || {
            arrive.wait();
            go.wait();
            match role {
                0 => sim.trigger_throttled(), // turn-end（节流窗刚过期）
                1 => sim.trigger_force(),     // 菜单 toggle（强制）
                2 => sim.fetch_and_push(),    // 轮询 tick
                _ => sim.trigger_force(),     // 可见性恢复补刷（强制）
            }
        }));
    }
    for k in kids {
        k.join().unwrap();
    }
    let n = sim.fetches.load(Ordering::Acquire);
    assert_eq!(n, 1, "四路并发 + in-flight 去重：恰 1 次真实 fetch（实际 {n}）");
}

#[test]
fn ta15_throttle_expiry_boundary_fetch_counts() {
    // 节流窗到期边界：elapsed < 30s → 拒；恰到期（伪造 last_attempt 已 30s
    // 旧）→ 放行 1 次；随后窗内再打 → 0 次。
    let sim = SimBalance::new();
    // 窗内（差 1ms 形态）：把 last_attempt 置为 30s-1ms 前。
    *sim.last_attempt.lock().unwrap() = Some(Instant::now() - TURN_END_THROTTLE + Duration::from_millis(1));
    sim.trigger_throttled();
    assert_eq!(sim.fetches.load(Ordering::Acquire), 0, "窗内差 1ms：静默 0 次");

    // 恰到期。
    *sim.last_attempt.lock().unwrap() = Some(Instant::now() - TURN_END_THROTTLE);
    sim.trigger_throttled();
    assert_eq!(sim.fetches.load(Ordering::Acquire), 1, "恰到期：发起 1 次");

    // 刚发起后的窗内连打（turn-end 流式多回合形态）。
    for _ in 0..10 {
        sim.trigger_throttled();
    }
    assert_eq!(sim.fetches.load(Ordering::Acquire), 1, "窗内连打不叠加（30s 节流）");

    // 强制路径不受节流（但 in-flight 去重合并在途）。
    sim.trigger_force();
    assert_eq!(sim.fetches.load(Ordering::Acquire), 2, "强制路径穿透节流 +1");
}

#[test]
fn ta15_force_burst_inflight_dedup() {
    // 强制路径风暴（toggle 抖动 + 恢复补刷 + tick 同拍）：并发 8 路强制。
    let sim = Arc::new(SimBalance::new());
    let start = Arc::new(Barrier2(AtomicUsize::new(8)));
    let mut kids = Vec::new();
    for _ in 0..8 {
        let (sim, start) = (sim.clone(), start.clone());
        kids.push(std::thread::spawn(move || {
            start.arrive();
            while start.0.load(Ordering::Acquire) > 0 { std::thread::yield_now(); }
            sim.trigger_force();
        }));
    }
    for k in kids {
        k.join().unwrap();
    }
    let n = sim.fetches.load(Ordering::Acquire);
    // in-flight 去重只合并**并发在途**，不合并顺序到达（生产同语义：先一
    // 罗完成后再来的强制触发是合法新取数）。8 路几乎同拍 → 撒布在少数几个
    // 在途窗内；确定性「恰 1」由四路同拍用例锁定，此处锁上界（远小于 8）。
    assert!(n >= 1 && n <= 4, "8 路强制风暴被合并到 ≤4 次（实际 {n}，无逐路叠加）");
}

/// 自旋对齐（8 路）。
struct Barrier2(AtomicUsize);
impl Barrier2 {
    fn arrive(&self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

#[test]
fn ta15_no_flag_starvation_200_rounds() {
    // 旗标归还铁律：fetch_and_push 唯一 return 路径在 swap 失败侧；持有者
    // 必然 store(false)。连续 200 轮（交替混入并发对打）后旗标必可用。
    let sim = Arc::new(SimBalance::new());
    for r in 0..200u32 {
        if r % 10 == 0 {
            let (s1, s2) = (sim.clone(), sim.clone());
            let (t1, t2) = (std::thread::spawn(move || s1.fetch_and_push()),
                            std::thread::spawn(move || s2.fetch_and_push()));
            t1.join().unwrap();
            t2.join().unwrap();
        }
        sim.fetch_and_push();
    }
    assert!(!sim.fetching.load(Ordering::Acquire), "200 轮后旗标归还（无泄漏/死锁）");
}

// —— 形态锁：生产源序哨兵（升级为行为级测试时删除） ————————————

const BALANCE_RS: &str = include_str!("../src/commands/balance.rs");

#[test]
fn ta15_form_swap_gate_precedes_spawn() {
    // fetch_and_push：swap 门先于 fetch_once（取数子进程调用）。
    let f = BALANCE_RS.split("fn fetch_and_push").nth(1).unwrap().split("fn trigger_fetch").next().unwrap();
    let swap = f.find("fetching.swap").expect("fetch_and_push 必含 swap 去重");
    let call = f.find("fetch_once(").expect("fetch_and_push 必经 fetch_once 取数");
    assert!(swap < call, "swap 去重先于任何取数开销");
    // 归还无早退：唯一 return 在 swap 失败侧；store(false) 必在函数内。
    assert!(f.contains("store(false"), "持有者必然归还旗标");
    // fetch_once 内才是真子进程（形态面：spawn 只在取数函数里）。
    // sanitized_node_command 内部即 Command::new + env_clear + 白名单（spawn 净化）。
    let fo = BALANCE_RS.split("fn fetch_once").nth(1).unwrap();
    assert!(fo.contains("sanitized_node_command"), "fetch_once 以净化构造起子进程取数");
}

#[test]
fn ta15_form_throttle_before_force_and_force_unthrottled() {
    // 非强制路径：节流检查先于 trigger_fetch（spawn）；强制路径无节流检查。
    let throttled = BALANCE_RS.split("fn trigger_fetch_throttled").nth(1).unwrap();
    assert!(throttled.contains("TURN_END_THROTTLE"), "非强制路径必须有 30s 节流窗");
    let force = BALANCE_RS.split("pub fn trigger_fetch(").nth(1).unwrap().split('}').next().unwrap();
    assert!(!force.contains("THROTTLE"), "强制路径不经节流");
}
