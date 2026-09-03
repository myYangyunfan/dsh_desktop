'use strict';
// ---------------------------------------------------------------------------
// rv9 冒烟：今日新增常驻/高频面的生命周期与频率上限（静态形态锚点 + 纯逻辑
// 复测）。零网络、零内核依赖；node scripts/test/rv9-hotpath-smoke.test.js
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const DSH_TAURI = path.join(ROOT, '..', 'dsh-tauri');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
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

// ---- 2. balance：轮询代数守卫 / 30s 节流 / in-flight 去重 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/commands/balance.rs'));
  check('轮询环代数守卫（心跳环同款）', src.includes('static BALANCE_LOOP_GEN') && src.includes('BALANCE_LOOP_GEN.load(Ordering::Relaxed) != gen'));
  check('turn-end 节流 30s（不逐回合起子进程）', src.includes('Duration::from_secs(30)') && src.includes('trigger_fetch_throttled'));
  check('in-flight 去重（fetching 旗标）', src.includes('fetching.swap(true, Ordering::AcqRel)'));
  check('不可见暂停轮询（5s tick 不空刷）', src.includes('BALANCE_TICK_MS: u64 = 5_000') && src.includes('if !visible'));
}

// ---- 3. updater：client 复用 / 进度事件 / 启动一次性 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/commands/updater_client.rs'));
  check('meta/dl client OnceLock 复用（每启动仅建一次）', src.includes('static CLIENT: OnceLock<reqwest::Client>') && (src.match(/OnceLock<reqwest::Client>/g) || []).length === 2);
  const lib = read(path.join(DSH_TAURI, 'src-tauri/src/app/src/lib.rs'));
  check('启动检查一次性（15s 后单次，无循环）', /std::thread::sleep\(std::time::Duration::from_secs\(15\)\)[\s\S]{0,600}?check_latest/.test(lib) && !/loop \{[\s\S]{0,400}?check_latest/.test(lib));
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

// ---- 6. 垫片：信封解包 / 心跳 5s / 拖放悬停层幂等 ----
{
  const src = read(path.join(DSH_TAURI, 'src-tauri/crates/bridge/dist/bridge-shim.js'));
  // F3（2026-08）起新契约：心跳载荷携带页面自报可见性 { hidden: document.hidden }
  //（壳侧 stall_exempt 豁免链依赖）；单监听形态 = 命名 heartbeat 函数 +
  // 恰好一个 setInterval(heartbeat, 5000) + visibilitychange 复报。
  check('心跳 5s interval（单监听）+ 载荷带 hidden（F3 契约）', (src.match(/setInterval\(heartbeat, 5000\)/g) || []).length === 1 && /send\('renderer_heartbeat', \{ hidden/.test(src));
  check('心跳 visibilitychange 补报（复用同一 heartbeat，不另起监听）', /document\.addEventListener\('visibilitychange', function \(\) \{\s*if \(!document\.hidden\) heartbeat\(\);/.test(src));
  check('悬停层幂等（单一 DOM id，enter 创建/leave+drop 移除）', src.includes("var DROP_HINT_ID = '__dsh_drop_hint__'") && src.includes('getElementById(DROP_HINT_ID)'));
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

// ---- 9. file-drop：双报去重窗（纯逻辑复测） ----
{
  // client.js 是浏览器模块（顶层 window.__ModuleLoader__.load 注册）——
  // 与 unit-dsh-file-drop-attach.test.js 同款 vm 手法取纯逻辑 core。
  const vm = require('node:vm');
  const file = path.join(ROOT, 'assets/plugins/dsh-file-drop/lib/client.js');
  let captured = null;
  const sandbox = { window: { __ModuleLoader__: { load: (reg) => { captured = reg; } } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  const core = captured && captured.factory(() => ({})).core;
  check('file-drop core 可加载', !!core && typeof core.dedupeEntries === 'function');
  if (core) {
    const seen = new Map();
    const e1 = [{ path: 'C:/a.png', name: 'a.png', size: 10 }];
    const t = 1_000_000;
    const r1 = core.dedupeEntries(e1, seen, t, 1500);
    // 双报：同名+大小（无路径形态）在窗口内被吞。
    const e2 = [{ name: 'a.png', size: 10 }];
    const r2 = core.dedupeEntries(e2, seen, t + 200, 1500);
    check('双报去重：窗口内 名+大小 命中 path 键被吞', r1.length === 1 && r2.length === 0);
    const r3 = core.dedupeEntries(e2, new Map(), t + 200, 1500);
    check('窗口外/新 seen 放行', r3.length === 1);
    // 1500ms 后同键可再入。
    seen.clear(); seen.set('C:/a.png', t);
    const r4 = core.dedupeEntries(e1, seen, t + 1600, 1500);
    check('超窗后同路径再次放行', r4.length === 1);
  }
}

// ---- 10. synapse：ResizeObserver 300ms 窗口后必 disconnect ----
{
  const src = read(path.join(ROOT, 'assets/plugins/dsh-synapse/app.js'));
  check('pin 窗口常量 300ms', src.includes('DETAIL_SCROLL_PIN_WINDOW = 300'));
  const stop = src.match(/function stopDetailScrollPin\(\)\s?\{[\s\S]*?\n\s?\}/);
  check('stopDetailScrollPin：observer.disconnect + timer 清', !!stop && /disconnect\(\)/.test(stop[0]) && /clearTimeout/.test(stop[0]));
  check('300ms 定时器到达即停', src.includes('detailScrollTimer = window.setTimeout(stopDetailScrollPin, DETAIL_SCROLL_PIN_WINDOW)'));
}

// ---- 11. plugin-manager 健康卡：进入一次性检测 + busy 防重入 ----
{
  const src = read(path.join(ROOT, 'assets/plugins/dsh-plugin-manager/lib/client.js'));
  check('健康卡进入分区自动检测一次（useEffect []）', /useEffect\(\(\) => \{\s*detect\(\);[\s\S]*?\}, \[\]\);/.test(src));
  check('busy 防重入（无并发检测风暴）', src.includes('if (busy) return;'));
  check('检测是单次 list() 调用 + 本地 Map 判定（非逐服务探测）', src.includes('byId') && src.includes('CRITICAL_RUNTIME'));
  // issue #175 防线：健康卡条目必须与静态关键服务清单同源。旧键 api-gateway /
  // @deepseek-ai/dsh-host-apiproxy 是重构前命名，拿它查 live 注册表永远缺席 →
  // 网关永久误报红条（实际挂载键见 dsh-base/cordis.patch.yml 的 typert-gateway 行）。
  const { criticalServices } = require(path.join(ROOT, 'scripts/integration/composition-integrity.js'));
  const runtimeRows = [...src.matchAll(/\{ id: "([a-z0-9_.-]+)", module: "([^"]+)"/g)]
    .map((m) => ({ id: m[1], module: m[2] }));
  const runtimeIds = new Set(runtimeRows.map((r) => r.id));
  check('健康卡 15 项关键服务全解析', runtimeIds.size === 15);
  check('健康卡不再用旧网关 loader 键 api-gateway', !runtimeIds.has('api-gateway'));
  check('健康卡按实际挂载键监控网关', runtimeIds.has('typert-gateway')
    && runtimeRows.some((r) => r.id === 'typert-gateway' && r.module === '@deepseek-ai/dsh-api-gateway'));
  // base-bundle（dsh-base 容器）运行期无独立 loader 条目，故不入健康卡
  const staticIds = criticalServices().map((s) => s.rowId).filter((id) => id !== 'base-bundle');
  check('健康卡与 composition-integrity 关键清单同集（防两表漂移）',
    staticIds.every((id) => runtimeIds.has(id)) && [...runtimeIds].every((id) => staticIds.includes(id)));
}

// ---- 12. 补丁链：readFileCached size+mtime 缓存（纯逻辑复测）----
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
process.exit(fail ? 1 : 0);
