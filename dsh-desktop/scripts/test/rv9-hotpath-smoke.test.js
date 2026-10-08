'use strict';
// ---------------------------------------------------------------------------
// rv9 冒烟：今日新增常驻/高频面的生命周期与频率上限（静态形态锚点 + 纯逻辑
// 复测）。零网络、零内核依赖；node scripts/test/rv9-hotpath-smoke.test.js
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..', '..');
const DSH_TAURI = path.join(ROOT, '..', 'dsh-tauri');

let pass = 0, fail = 0;
// failures 记录 FAIL 名（+可选 detail），供文件尾 test() 断言把具体名字冒到
// node --test 的 failing-tests 块里 —— 此前 process.exit 让整份聚合塌成
// 一句 "test failed"，谁红了都要靠肉眼扫 stdout。
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else {
    fail++;
    failures.push(`${name}${detail ? ' :: ' + detail : ''}`);
    console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
}
function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

// ---- 1. session_notify：代数守卫 / 退出收割 / 行上限 / stdin 保活 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/session_notify.rs'));
  check('watcher 代数守卫（重入幂等）', src.includes('static WATCHER_GEN') && src.includes('WATCHER_GEN.fetch_add'));
  check('watcher 退出收割（kill+wait，无僵尸）', /fn shutdown_watcher[\s\S]*?let _ = c\.kill\(\);[\s\S]*?let _ = c\.wait\(\);/.test(src));
  check('watcher 行协议上限（8KB capped）', src.includes('WATCHER_LINE_CAP: usize = 8 * 1024'));
  check('超长行流式丢弃（不驻留）', src.includes('line.clear();') && src.includes('shrink_to_fit'));
  check('stdin 保活管道（Rust 退出防 JS 孤儿）', src.includes('slot.stdin = None;'));
  check('崩溃退避封顶 60s（无重启风暴）', src.includes('BACKOFF_CAP_MS: u64 = 60_000'));
  check('健康周期归零（立刻退形态不 1s 风暴）', src.includes('WATCHER_HEALTHY_ALIVE'));
  check('stderr 转发线程（防管道写满阻塞子进程）', src.includes('fn forward_stderr'));
  check('通知限流 30s/会话 + 15s 全局', src.includes('SESSION_THROTTLE_MS: u128 = 30_000') && src.includes('GLOBAL_THROTTLE_MS: u128 = 15_000'));
  check('跳转事件定向主窗（不广播浮窗）', src.includes('emit_to') && src.includes('EventTarget::labeled("main")'));
  check('PENDING_JUMP 取出即清（take）', src.includes('PENDING_JUMP.lock().unwrap_or_else(|p| p.into_inner()).take()'));
}

// ---- 2. balance：壳侧轮询环已随 Electron 余额遗留线整体退役（反向守卫）----
// 原本节锁 commands/balance.rs 的「轮询代数守卫 / 30s 节流 / in-flight 去重 /
// 不可见暂停」四条热路径不变量；该模块与 sidecar `balance-fetch` 已整体拆除
//（contracts/ipc-commands.md §2.4），本节点名改为反向守卫：源文件不得存在、
// 生产侧不得再有轮询环/事件派发。全量裁撤面对账见 unit-balance-legacy-retire。
{
  check(
    '壳侧余额模块已删除',
    !fs.existsSync(path.join(DSH_TAURI, 'src-tauri/src/app/src/commands/balance.rs')),
  );
  const lib = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/lib.rs'));
  check('lib.rs 不再起余额轮询环', !lib.includes('start_balance_loop') && !lib.includes('balance-changed'));
  const notify = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/session_notify.rs'));
  check('turn-end 不再挂余额触发（C2 退役）', !notify.includes('trigger_fetch'));
}

// ---- 3. updater：client 复用 / 进度事件 / 启动一次性 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/commands/updater_client.rs'));
  check('meta/dl client OnceLock 复用（每启动仅建一次）', src.includes('static CLIENT: OnceLock<reqwest::Client>') && (src.match(/OnceLock<reqwest::Client>/g) || []).length === 2);
  const lib = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/lib.rs'));
  // v0.6.3 起 dsh-tauri lib.rs 把「启动一次性查一次」升级为「有界周期重检」
  //（见 lib.rs:500 注释：常年挂机用户当天也要被新版本敲门）。rv9 冒烟守的是「热路径
  // 无重启/紧循环风暴」这一不变量，判据随之升级：loop 存在合法，但必须
  //   (a) 保留 loop 前的 15s 首查延迟（避免启动打点即出网），
  //   (b) loop 内 check_latest 之后有 thread::sleep 分隔（若日后误改成裸紧循环，
  //       (b) 直接失配、本项重新变红）。
  const hasInitialDelay = /std::thread::sleep\(std::time::Duration::from_secs\(15\)\)[\s\S]{0,400}?loop \{/.test(lib);
  const loopSleepsBetweenChecks = /loop \{[\s\S]{0,2000}?check_latest[\s\S]{0,1500}?std::thread::sleep\(std::time::Duration::from_secs\(\d+\)\)/.test(lib);
  check('启动 15s 首查 + v0.6.3 有界周期重检（loop 内 sleep 分隔、非紧循环风暴）',
    hasInitialDelay && loopSleepsBetweenChecks,
    `hasInitialDelay=${hasInitialDelay}, loopSleepsBetweenChecks=${loopSleepsBetweenChecks}`);
  const menu = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/commands/menu.rs'));
  check('进度事件经 download 回调发出（无独立轮询线程）', menu.includes('"client-update-progress"') && menu.includes('download_to_temp(&asset, move |received'));
}

// ---- 4. 浮窗看门狗 FW1：单发 setTimeout（非常驻 interval）+ reload 一次封顶 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/windows.rs'));
  check('FW1 是单发 setTimeout(3000)（无常驻 interval）', /setTimeout\(function\(\)\{[\s\S]*?\}, 3000\)/.test(src) && !/setInterval/.test(src.slice(src.indexOf('FLOAT_WATCHDOG_SCRIPT'), src.indexOf('FLOAT_WATCHDOG_SCRIPT') + 3000)));
  check('FW1 reload 每窗最多一次（sessionStorage 旗标）', src.includes("__dsh_float_watchdog_reloaded__"));
  check('FW1 活跃即清旗标（正常页不累计状态）', /if \(alive\(\)\) \{ setFlag\(false\); return; \}/.test(src));
}

// ---- 5. 加载页：10 行上限 + 防抖清理 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/pages.rs'));
  check('addLine 10 行滚动上限', src.includes('while (el.children.length > 10) el.removeChild(el.firstChild);'));
  check('新尝试取消防抖定时器', src.includes('clearTimeout(failTimer)'));
}

// ---- 6. 垫片：信封解包 / 心跳 5s / currentSession 变化才发 ----
//（原第 6 节还锁「拖放悬停提示层幂等」（单一 DOM id，enter 创建 / leave+drop 移除）：
//  那是已退役 dsh-file-drop 的壳侧半边，`__dsh_drop_hint__` 整块监听已随插件与
//  file_drop.rs 一并拆除，垫片不再有任何 dragover/drop 面，故该项下线而非改锚；
//  防复活锚点见 shim.rs::retired_plugin_surfaces_absent 的 drop_hint / DROP_HINT_ID。）
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/crates/bridge/dist/bridge-shim.js'));
  // F3（2026-08）起新契约：心跳载荷携带页面自报可见性 { hidden: document.hidden }
  //（壳侧 stall_exempt 豁免链依赖）；单监听形态 = 命名 heartbeat 函数 +
  // 恰好一个 setInterval(heartbeat, 5000) + visibilitychange 复报。
  check('心跳 5s interval（单监听）+ 载荷带 hidden（F3 契约）', (src.match(/setInterval\(heartbeat, 5000\)/g) || []).length === 1 && /send\('renderer_heartbeat', \{ hidden/.test(src));
  check('心跳 visibilitychange 补报（复用同一 heartbeat，不另起监听）', /document\.addEventListener\('visibilitychange', function \(\) \{\s*if \(!document\.hidden\) heartbeat\(\);/.test(src));
  check('拖放悬停提示层已随 dsh-file-drop 退役（无复活面）', !src.includes('drop_hint') && !src.includes('DROP_HINT_ID') && !/addEventListener\(\s*['"]dragover/.test(src));
  check('currentSession 3s 轮询变化才发（不发常驻流量）', /var id = parsed[\s\S]*?if \(id && id !== last\)/.test(src));
}

// ---- 7. W2：better-sidebar visibilitychange 随 chunk 循环空清 ----
{
  for (const f of ['dsh-better-sidebar/lib/client.js', 'dsh-better-sidebar/lib/client-registry.js']) {
    const src = read(path.join(ROOT, 'assets/plugins', f));
    check(`${f}: visibilitychange 挂/摘对称（retryLoops 空即 removeEventListener）`,
      src.includes('dropVisibilityPokeIfIdle') && src.includes('removeEventListener("visibilitychange"'));
  }
}

// ---- 8. subagent-lens：1.2s 轮询仅展开态 + 卸载清理 ----
{
  const src = read(path.join(ROOT, 'assets/plugins/dsh-subagent-lens/lib/client.js'));
  const m = src.match(/useEffect\(\(\) => \{\s*if \(!expanded \|\| !childRunning\) return undefined;\s*const timer = setInterval[\s\S]*?}, 1200\);\s*return \(\) => clearInterval\(timer\);/);
  check('轮询仅 expanded && childRunning，卸载 clearInterval', !!m);
  check('轮询体仅 setTick（无每 tick IO/网络）', /setInterval\(\(\) => \{ try \{ setTick\(\(n\) => n \+ 1\); \} catch[\s\S]*?}, 1200\)/.test(src));
}

// （原 9 节「file-drop 双报去重窗」随 dsh-file-drop 退役下线：它 vm 装载
//   assets/plugins/dsh-file-drop/lib/client.js 取 core.dedupeEntries 做纯逻辑复测，
//   源目录已删、去重窗只存在于那份产物里，故整节删除而非改锚；后续小节顺次上移。）
// ---- 9. synapse：ResizeObserver 300ms 窗口后必 disconnect ----
{
  const src = read(path.join(ROOT, 'assets/plugins/dsh-synapse/app.js'));
  check('pin 窗口常量 300ms', src.includes('DETAIL_SCROLL_PIN_WINDOW = 300'));
  const stop = src.match(/function stopDetailScrollPin\(\)\s?\{[\s\S]*?\n\s?\}/);
  check('stopDetailScrollPin：observer.disconnect + timer 清', !!stop && /disconnect\(\)/.test(stop[0]) && /clearTimeout/.test(stop[0]));
  check('300ms 定时器到达即停', src.includes('detailScrollTimer = window.setTimeout(stopDetailScrollPin, DETAIL_SCROLL_PIN_WINDOW)'));
}

// ---- 10. 补丁链：readFileCached size+mtime 缓存（纯逻辑复测）----
{
  const { readFileCached } = require(path.join(ROOT, 'scripts/lib/patch-io.js'));
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv9-patch-io-'));
  const f = path.join(tmp, 'candidate.js');
  fs.writeFileSync(f, 'x'.repeat(4096), 'utf8');
  const a = readFileCached(f);
  const b = readFileCached(f);
  check('readFileCached 缓存命中（同引用）', a === b && a !== null);
  fs.writeFileSync(f, 'y'.repeat(8192), 'utf8');
  const c = readFileCached(f);
  check('写入后（size+mtime 变）缓存失效重读', c !== a && c.length === 8192);
  fs.rmSync(tmp, { recursive: true, force: true });
  check('缺失文件返回 null 不抛', readFileCached(path.join(tmp, 'gone.js')) === null);
}

console.log(`\nrv9 冒烟：${pass} ok, ${fail} FAIL`);
// 把 fail 计数收进一个真正的 node:test 用例：让 `node --test` 在 failing-tests
// 块里点名每一条 FAIL（此前 process.exit 让整份聚合塌成一句 "test failed"，
// 谁红了都得靠肉眼扫 stdout）。直接 node 运行时该 test 也会执行并决定退出码。
test(`rv9 冒烟汇总：${pass} ok / ${fail} FAIL`, () => {
  assert.equal(fail, 0, failures.length
    ? `以下 ${failures.length} 项 FAIL：\n  ${failures.join('\n  ')}`
    : '无失败项');
});
