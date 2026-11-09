// dsh-pocket 自重启：重新拉起启动本宿主的确切 dsh 调用（detached 交接），
// 让更新后的插件代码生效——用户无需离开界面手动重启。
//
// 方案借鉴 dshmarket 的 self-restart（lib/restart.js，MIT）：不直接拉起新
// 进程，而是先拉一个 detached 的 node 辅助进程，等旧进程退出、端口释放
// 后再拉起新 dsh，并把新进程输出写入临时日志——避免端口竞争
// （EADDRINUSE）导致新进程静默崩溃。
//
// 与 dshmarket 的差异：不赌固定 1.5s 延时，而是轮询探测端口真正释放
// （ECONNREFUSED）再拉起，旧进程退出慢也不会撞端口。
//
// 注意：新进程 detached，不挂终端——停止方式：lsof -ti :3080 | xargs kill -9。

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 从启动参数里解析 dsh web 端口（--port/-p，含 --port=3080 形式），默认 3080。 */
export function dshPortFromArgs(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port' || a === '-p') {
      const n = Number(args[i + 1]);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    } else if (a.startsWith('--port=')) {
      const n = Number(a.slice('--port='.length));
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  return 3080;
}

/** 重建启动调用（与当前宿主相同的命令，含 node 运行参数）。 */
export function restartLaunch() {
  return {
    file: process.argv[0], // node
    args: [...process.execArgv, process.argv[1], ...process.argv.slice(2)], // [flags] <bin.js> + web [flags]
    cwd: process.cwd(),
  };
}

/** 辅助进程代码：等 dsh 端口真正释放（最多 20s）→ 拉起新 dsh → 输出写日志。 */
function helperCode(launch, logOut, logErr, port) {
  const spawn = "const { spawn } = require('node:child_process')";
  const fs = "const fs = require('node:fs')";
  const net = "const net = require('node:net')";
  const file = `const file = ${JSON.stringify(launch.file)}`;
  const args = `const args = ${JSON.stringify(launch.args)}`;
  const cwd = `const cwd = ${JSON.stringify(launch.cwd)}`;
  const o = `const logOut = ${JSON.stringify(logOut)}`;
  const e = `const logErr = ${JSON.stringify(logErr)}`;
  const body = [
    'function portFree(p, cb) {',
    '  const s = net.connect(p, "127.0.0.1")',
    '  s.once("connect", () => { s.destroy(); cb(false) })', // 还能连上 = 端口仍被占用
    '  s.once("error", () => cb(true))',                      // 连接被拒 = 已释放
    '}',
    'function waitPort(p, tries, cb) {',
    '  portFree(p, (free) => {',
    '    if (free || tries <= 0) cb(free)',
    '    else setTimeout(() => waitPort(p, tries - 1, cb), 200)',
    '  })',
    '}',
    `waitPort(${port}, 100, (free) => {`, // 最多 100×200ms = 20s；超时也照常拉起（宁可试拉、日志留痕，也不让 dsh 起不来）
    '  setTimeout(() => {',
    '    try {',
    '      const out = fs.openSync(logOut, "a")',
    '      const err = fs.openSync(logErr, "a")',
    '      const child = spawn(file, args, { cwd, detached: true, stdio: ["ignore", out, err], env: process.env })',
    '      child.unref()',
    '    } catch (ex) {',
    '      try { fs.appendFileSync(logErr, "restart helper failed: " + (ex && ex.message) + "\\n") } catch {}',
    '    }',
    '  }, 300)',
    '})',
  ].join('\n');
  return [spawn, fs, net, file, args, cwd, o, e, body].join('\n');
}

/**
 * 拉起替代宿主（detached 辅助进程交接），随后结束当前进程。
 * @param {object} opts
 * @param {number} [opts.handoffMs] 保留参数（兼容旧调用；现由端口探测接管）
 * @param {object} [opts.internals] 测试注入：spawn / kill
 * @returns {{helperPid:number|null, logOut:string, logErr:string}}
 */
export function restartHost({ handoffMs = 1500, internals = {} } = {}) {
  const spawnFn = internals.spawn ?? spawn;
  const killFn = internals.kill ?? ((pid) => process.kill(pid, 'SIGTERM'));
  // Electron 桌面宿主里 pocket 跑在 Electron 的 node 上下文：杀 process.pid 会杀掉宿主，
  // 并由 detached 孤儿进程抢宿主端口（19387）→ EADDRINUSE 崩溃循环（issue #177 / #167）。
  // 桌面端应由 DSH Desktop 自己管理重启，这里直接拒绝，交还控制权。
  if (Boolean(process.versions.electron) && internals.spawn === undefined) {
    return { helperPid: null, logOut: '', logErr: '', error: 'desktop-host-restart-not-supported' };
  }
  const launch = restartLaunch();
  const port = dshPortFromArgs(launch.args);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logOut = join(tmpdir(), `dsh-pocket-restart-${stamp}.out.log`);
  const logErr = join(tmpdir(), `dsh-pocket-restart-${stamp}.err.log`);

  let helperPid = null;
  try {
    const helper = spawnFn(process.execPath, ['-e', helperCode(launch, logOut, logErr, port)], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    helper.unref?.();
    helper.on?.('error', () => {}); // 参数异常等异步错误兜底，别让旧进程先崩
    helperPid = helper.pid ?? null;
    // 短暂等待后结束当前进程（释放端口）；由辅助进程探测到端口释放后拉起新宿主
    setTimeout(() => { try { killFn(process.pid); } catch { /* 忽略 */ } }, 500);
  } catch (err) {
    return { helperPid: null, logOut, logErr, error: err?.message ?? String(err) };
  }
  return { helperPid, logOut, logErr };
}
