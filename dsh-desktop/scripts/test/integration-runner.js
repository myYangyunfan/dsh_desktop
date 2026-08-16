'use strict';

// ============================================================================
// DSH Desktop — Issue #9 集成测试 harness
//
// 在真实 Electron 环境下验证「渲染进程崩溃/挂起自恢复」：
//   · 每个场景独立目录：DSH_HOME / userData / 控制通道全部隔离，
//     绝不触碰用户真实 ~/.dsh 与 %APPDATA%\DSH Desktop
//   · 通过 DSH_DESKTOP_TEST 控制通道（文件轮询）向主进程下达命令，
//     renderer 崩溃时通道依然可用
//   · 断言依据：desktop.log 关键事件 + test-status.json 状态 + 退出码
//     + run-state.json + 进程树清理
//
// 用法：
//   node scripts/test/integration-runner.js <scenario>   单个场景
//   node scripts/test/integration-runner.js --all         全部场景
//   node scripts/test/integration-runner.js --list        列出场景
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const mainJs = path.join(repoRoot, 'main.js');
const electronPath = (() => {
  try { return require('electron'); } catch { return path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'); }
})();

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cmdSeq = 0;

// URL 归一化比较：webUrl 无尾斜杠，页面实际 URL 通常带 '/'。
const normUrl = (u) => String(u || '').replace(/\/+$/, '');
const sameUrl = (a, b) => normUrl(a) === normUrl(b);

function tasklistPids(image) {
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      const m = /"([^"]+)","(\d+)"/.exec(line.trim());
      if (m) pids.add(Number(m[2]));
    }
    return pids;
  } catch {
    return new Set();
  }
}

class ScenarioContext {
  constructor(name) {
    this.name = name;
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `dsh-desk-test-${name}-`));
    this.userData = path.join(this.dir, 'userdata');
    this.dshHome = path.join(this.dir, 'dsh-home');
    this.stdoutFile = path.join(this.dir, 'stdout.log');
    this.desktopLog = path.join(this.userData, 'logs', 'desktop.log');
    this.runState = path.join(this.userData, 'run-state.json');
    this.controlFile = path.join(this.dir, 'test-control.json');
    this.statusFile = path.join(this.dir, 'test-status.json');
    fs.mkdirSync(this.dshHome, { recursive: true });
    this.outFd = fs.openSync(this.stdoutFile, 'w');
    this.logTail = {}; // file -> bytes 已扫描
    this.proc = null;
    this.exited = null;
  }

  spawn() {
    const env = {
      ...process.env,
      DSH_HOME: this.dshHome,
      DSH_DESKTOP_USERDATA: this.userData,
      DSH_DESKTOP_SKIP_AUTO_UPDATE: '1',
      DSH_DESKTOP_SKIP_CLIENT_UPDATE: '1',
      DSH_DESKTOP_TEST: '1',
      DSH_DESKTOP_TEST_DIR: this.dir,
      DSH_DESKTOP_TEST_STABILITY_MS: '3000',
      DSH_DESKTOP_DEBUG: '1',
      NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY || 'https://registry.npmmirror.com',
      ...(SCENARIO_ENV[this.name] || {}),
    };
    // 必须「删除」而非置空：Electron 43 只要检测到 ELECTRON_RUN_AS_NODE
    // 变量存在（哪怕是空串）就切换 Node 模式并原生断言崩溃。
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;
    this.proc = spawn(electronPath, [mainJs], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', this.outFd, this.outFd],
      windowsHide: true,
    });
    this.proc.on('exit', (code, signal) => {
      this.exited = { code, signal, at: Date.now() };
    });
    this._log(`已启动 Electron pid=${this.proc.pid} 场景=${this.name} dir=${this.dir}`);
    return this.proc;
  }

  _log(msg) {
    process.stdout.write(`[${this.name}] ${msg}\n`);
  }

  // 读取某个文件自上次扫描之后的新增内容
  readNew(file) {
    let buf = '';
    try { buf = fs.readFileSync(file, 'utf8'); } catch { return ''; }
    const prev = this.logTail[file] || 0;
    if (buf.length <= prev) { this.logTail[file] = buf.length; return ''; }
    const fresh = buf.slice(prev);
    this.logTail[file] = buf.length;
    return fresh;
  }

  // 等待任一来源出现匹配内容（desktop.log / stdout / 状态文件），返回匹配文本
  async waitFor(pattern, timeoutMs, label) {
    const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      for (const f of [this.desktopLog, this.stdoutFile, this.statusFile]) {
        const fresh = this.readNew(f);
        const m = rx.exec(fresh);
        if (m) return m[0];
      }
      await sleep(250);
    }
    throw new Error(`等待超时(${(timeoutMs / 1000).toFixed(0)}s): ${label} / ${pattern}`);
  }

  // 全文件检索（不受增量消费影响，用于紧跟 readNew 轮询之后的断言）
  grepLog(pattern) {
    const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    for (const f of [this.desktopLog, this.stdoutFile]) {
      try {
        if (rx.test(fs.readFileSync(f, 'utf8'))) return true;
      } catch {}
    }
    return false;
  }

  // 读取一次状态文件全文
  readStatusFile() {
    try { return JSON.parse(fs.readFileSync(this.statusFile, 'utf8')); } catch { return null; }
  }

  // 通过控制文件发送命令并等待状态回执
  async send(cmd, args, timeoutMs = 30000) {
    const id = `${cmd}-${++cmdSeq}-${Date.now()}`;
    fs.writeFileSync(this.controlFile, JSON.stringify({ id, cmd, args }));
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const st = this.readStatusFile();
      if (st && st.id === id) return st;
      await sleep(150);
    }
    throw new Error(`命令 ${cmd} 未在 ${timeoutMs}ms 内回执`);
  }

  async state(timeoutMs = 30000) {
    const st = await this.send('state', undefined, timeoutMs);
    if (!st.ok) throw new Error('state 命令失败: ' + JSON.stringify(st));
    return st.detail;
  }

  async quitAndCheck(timeoutMs = 20000) {
    try { await this.send('quit'); } catch { /* 主进程可能已退出 */ }
    const start = Date.now();
    while (!this.exited && Date.now() - start < timeoutMs) await sleep(200);
    if (!this.exited) {
      this._log('应用未在限定时间内退出，强制终止进程树');
      try { execFileSync('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], { windowsHide: true }); } catch {}
      this.exited = { code: 'force-killed', signal: null, at: Date.now() };
    }
    await sleep(1500); // 等待 killTree 的异步收尾
    // run-state 清理标记
    let cleanExit = null;
    try { cleanExit = JSON.parse(fs.readFileSync(this.runState, 'utf8')).cleanExit; } catch {}
    return { exit: this.exited, cleanExit };
  }

  close() {
    try { fs.closeSync(this.outFd); } catch {}
    if (this.proc && !this.exited) {
      try { execFileSync('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], { windowsHide: true }); } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

// 场景级环境变量（应用启动参数）。
const SCENARIO_ENV = {
  'unsafe-port': { DSH_DESKTOP_TEST_FORCE_UNSAFE: '1' },
};

const SCENARIOS = {};

SCENARIOS['boot-healthy'] = async (t) => {
  await t.waitFor('test-channel-ready', 60000, '测试通道就绪');
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), `主窗应加载 Web UI，实际=${st.url}`);
  t.assert(st.recovery && st.recovery.expectingWeb === true, '应处于 Web 监控态');
  t.assert(st.recovery && st.recovery.gaveUp === false && st.recovery.failures === 0, '健康状态计数为 0');
  const run = JSON.parse(fs.readFileSync(t.runState, 'utf8'));
  t.assert(run.renderer && run.renderer.state === 'healthy', `run-state 应记录 healthy，实际=${JSON.stringify(run.renderer)}`);
  const crashDumps = path.join(t.userData, 'crash-dumps');
  t.assert(fs.existsSync(crashDumps), 'crash-dumps 目录应存在');
  t.assert(!t.readNew(t.desktopLog).includes('渲染进程异常退出'), '健康启动不应出现崩溃事件');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0, `退出码应为 0，实际=${q.exit.code}`);
  t.assert(q.cleanExit === true, 'run-state 应标记 cleanExit=true');
};

SCENARIOS['crash-recover'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  await t.send('crash-main');
  await t.waitFor('渲染进程异常退出: reason=crashed', 30000, '崩溃事件');
  await t.waitFor('安排恢复', 30000, '恢复安排');
  await t.waitFor('界面已稳定', 120000, '恢复后稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), `恢复后应回到 Web UI，实际=${st.url}`);
  t.assert(st.recovery.failures === 0 && !st.recovery.gaveUp, '恢复后计数清零');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['crash-rebuild'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  // 快速连续崩溃（间隔 ~1.5s，快于 3s 稳定期），第 3 次应触发重建
  let rebuilt = false;
  for (let i = 0; i < 8 && !rebuilt; i += 1) {
    await t.send('crash-main');
    for (let j = 0; j < 6 && !rebuilt; j += 1) {
      await sleep(200);
      const fresh = t.readNew(t.desktopLog) + t.readNew(t.stdoutFile);
      if (fresh.includes('主窗口已重建')) rebuilt = true;
    }
  }
  t.assert(rebuilt, '连续崩溃应触发主窗口重建');
  await t.waitFor('界面已稳定', 120000, '重建后稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl) && !st.recovery.gaveUp, '重建后应恢复正常');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['crash-giveup'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  // 持续快速崩溃（间隔 ~1.2s）直到自动恢复放弃。重建后若 renderer 已死，
  // 恢复退避期间（可达 ~20s）的崩溃注入是空操作，需要更多次注入跨过
  // 「死窗口期」，让恢复加载后的稳定窗口内仍有新崩溃落进来。
  let gaveUp = false;
  for (let i = 0; i < 24 && !gaveUp; i += 1) {
    await t.send('crash-main');
    for (let j = 0; j < 6 && !gaveUp; j += 1) {
      await sleep(200);
      const fresh = t.readNew(t.desktopLog) + t.readNew(t.stdoutFile);
      if (fresh.includes('自动恢复失败达到上限')) gaveUp = true;
    }
  }
  t.assert(gaveUp, '连续崩溃应最终放弃自动恢复');
  // 恢复页日志可能已被上一轮 readNew 消费，用全文件检索断言
  let errPage = false;
  for (let i = 0; i < 60 && !errPage; i += 1) {
    await sleep(500);
    errPage = t.grepLog('加载本地恢复页面');
  }
  t.assert(errPage, '应加载本地恢复页面');
  await sleep(1500);
  const st = await t.state();
  t.assert(st.recovery.gaveUp === true, '应处于放弃状态');
  t.assert(st.url.includes('recovery.html'), `应显示恢复页，实际=${st.url}`);
  // 手动恢复按钮
  await t.send('recovery-reload');
  await t.waitFor('界面已稳定', 120000, '手动恢复后稳定');
  const st2 = await t.state();
  t.assert(sameUrl(st2.url, st2.webUrl), '手动恢复后应回到 Web UI');
  t.assert(st2.recovery.gaveUp === false && st2.recovery.failures === 0, '手动恢复应清零状态');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['hang-unresponsive'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  await t.send('hang-main');
  await t.waitFor('检测到界面无响应', 180000, '挂起检测');
  await t.waitFor('界面持续无响应', 60000, '宽限期到');
  await t.waitFor('渲染进程异常退出', 30000, '强制终结崩溃事件');
  await t.waitFor('界面已稳定', 120000, '挂起恢复后稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl) && !st.recovery.gaveUp, '挂起恢复后应正常');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['server-restart'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  // 模拟插件市场式原地重启：先静默终止服务（不弹对话框）
  await t.send('kill-server-silent');
  // 等待服务进程真正退出（优雅终止可能需数秒），再触发重载
  let dead = false;
  for (let i = 0; i < 40 && !dead; i += 1) {
    await sleep(500);
    const st = await t.state(5000).catch(() => null);
    dead = !!(st && st.serverAlive === false);
  }
  t.assert(dead, '服务进程应已退出');
  // 此时目标页必然加载失败 → 应识别「服务已退出」，交给既有重启流程，不进入崩溃恢复循环
  await t.send('reload-main');
  await t.waitFor('目标页加载失败', 30000, '目标页加载失败事件');
  await t.waitFor('服务进程已退出，交由既有重启对话框处理', 15000, '服务退出分支');
  await sleep(8000); // 观察期：不应出现恢复循环
  const noise = t.readNew(t.desktopLog);
  t.assert(!noise.includes('安排恢复'), '服务已退出时不应安排恢复循环');
  // 重启服务（换新端口）→ 自动加载新地址并恢复稳定
  await t.send('restart-server');
  await t.waitFor('界面已稳定', 120000, '服务重启后恢复稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), `应加载到新端口的 Web UI，实际=${st.url}`);
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['restart-service'] = async (t) => {
  // 复现 chrome:restart-service（插件市场原地重启）的完整路径：
  // killTree 后立即 startAndShow。断言重启前后端口不变（稳定 origin）。
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  const portOf = (u) => { try { return new URL(u).port || ''; } catch { return ''; } };
  const before = await t.state();
  const portBefore = portOf(before.webUrl);
  t.assert(portBefore, '启动后应取得 web 端口');
  const st = await t.send('restart-service', undefined, 120000);
  t.assert(st.ok, '重启命令应成功: ' + JSON.stringify(st));
  await t.waitFor('dsh web 服务已重启', 120000, '服务重启完成');
  await t.waitFor('界面已稳定', 120000, '重启后稳定');
  const after = await t.state();
  t.assert(sameUrl(after.url, after.webUrl), '重启后主窗应加载新 webUrl');
  const portAfter = portOf(after.webUrl);
  t.assert(portAfter === portBefore, `服务重启应复用原端口（稳定 origin），实际 ${portBefore} -> ${portAfter}`);
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['preview-fence'] = async (t) => {
  // 预览静态服务必须与 dsh:file-open / dsh:file-revert 共用同一文件围栏：
  // 只允许读取「会话 cwd」之下的项目文件，杜绝任意本地文件读取。
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  const log = fs.readFileSync(t.desktopLog, 'utf8');
  const m = /预览静态服务已启动: http:\/\/127\.0\.0\.1:(\d+)/.exec(log);
  t.assert(m, '预览静态服务端口应出现在日志');
  const base = 'http://127.0.0.1:' + Number(m[1]);
  const enc = (p) => String(p).replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const get = (p) => new Promise((resolve, reject) => {
    const req = http.get(base + '/' + enc(p), { timeout: 5000 }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('preview get timeout')); });
  });
  // 1) 会话根之外：DSH_HOME 与 userData 的文件必须被拒绝。
  const secret = path.join(t.dshHome, 'secret-marker.txt');
  fs.writeFileSync(secret, 'PREVIEW_LEAK_MARKER');
  t.assert(await get(secret) === 403, '会话根之外（DSH_HOME）文件应 403');
  t.assert(await get(path.join(t.userData, 'settings.json')) === 403, '会话根之外（userData）文件应 403');
  // 2) 会话 cwd 之内：先被拒（无会话）→ 创建会话日志后立即可读。
  //    第二次请求同时验证「文件围栏缓存刷新」：第一次请求已把空根集写入
  //    5 分钟缓存，若缓存不刷新，新会话的项目文件会被误拒。
  const proj = path.join(t.dir, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  const file = path.join(proj, 'index.html');
  fs.writeFileSync(file, '<h1>hello</h1>');
  t.assert(await get(file) === 403, '无会话时项目文件也应 403');
  const header = { type: 'session', version: 0, id: 'sess-preview', createdAt: Date.now(), cwd: proj, delegationDepth: 0 };
  const frame = zlib.zstdCompressSync(Buffer.from(JSON.stringify(header) + '\n'));
  const sessDir = path.join(t.dshHome, 'sessions', 'sess-preview');
  fs.mkdirSync(sessDir, { recursive: true });
  fs.writeFileSync(path.join(sessDir, 'session.jsonl.zstd'), frame);
  t.assert(await get(file) === 200, '会话 cwd 内文件应可预览（缓存应刷新）');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['vision-key-keep'] = async (t) => {
  // 识图 apiKey 保存回归：role('secret') 字段永不回显，旧版卡片在「改其它
  // 字段后保存」时会把已存密钥静默清空（用户反馈“密钥没法保存”）。修复后：
  // 留空 = 保持已存密钥；仅非空输入才写入。
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  // 1) 同步进 profile 的 vision 客户端 bundle 必须携带修复标记。
  const clientFile = path.join(t.dshHome, 'profiles', 'web', 'node_modules', '@dsh-external', 'dsh-vision', 'lib', 'client.js');
  t.assert(fs.existsSync(clientFile), 'vision 客户端 bundle 应已同步进 profile');
  const bundle = fs.readFileSync(clientFile, 'utf8');
  t.assert(bundle.includes('保持已保存的密钥'), 'bundle 应包含「留空 = 保持已保存的密钥」提示');
  t.assert(bundle.includes('apiKeyValue !== ""'), 'bundle 应包含「仅非空才写入密钥」逻辑');
  // 2) 走与设置页一致的 RPC 链路验证语义。
  const rpc = (method, payload) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r' + Date.now(), method, payload });
    const base = webUrlOf(t);
    const endpoint = new URL('/api/' + method, base);
    const req = http.request({ host: endpoint.hostname, port: endpoint.port, path: endpoint.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(data) }); } catch { reject(new Error('bad json (url=' + base + ' path=' + endpoint.pathname + ' status=' + res.statusCode + '): ' + String(data).slice(0, 300))); } });
    });
    req.on('error', reject);
    req.end(body);
  });
  const keyInDisk = () => {
    const sf = path.join(t.dshHome, 'settings.yaml');
    if (!fs.existsSync(sf)) return null;
    const m = /apiKey:\s*(\S+)/.exec(fs.readFileSync(sf, 'utf8'));
    return m ? m[1] : null;
  };
  const s1 = await rpc('settings.mutate', { ns: 'dsh-vision', ops: [{ op: 'set', path: ['apiKey'], value: 'sk-user-key-abc' }] });
  t.assert(s1.json && s1.json.result && s1.json.result.ok, '第一次保存密钥应成功');
  t.assert(keyInDisk() === 'sk-user-key-abc', `密钥应落盘，实际=${keyInDisk()}`);
  const s2 = await rpc('settings.mutate', { ns: 'dsh-vision', ops: [{ op: 'set', path: ['model'], value: 'glm-4.6v' }] });
  t.assert(s2.json && s2.json.result && s2.json.result.ok, '第二次保存（只改模型）应成功');
  t.assert(keyInDisk() === 'sk-user-key-abc', `改其它字段保存不得清空密钥，实际=${keyInDisk()}`);
  const s3 = await rpc('settings.mutate', { ns: 'dsh-vision', ops: [{ op: 'set', path: ['apiKey'], value: 'sk-new-key-xyz' }] });
  t.assert(s3.json && s3.json.result && s3.json.result.ok, '新密钥覆盖保存应成功');
  t.assert(keyInDisk() === 'sk-new-key-xyz', `新密钥应覆盖旧值，实际=${keyInDisk()}`);
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

function webUrlOf(t) {
  const m = /Web UI 就绪: (http:\/\/127\.0\.0\.1:\d+)/.exec(fs.readFileSync(t.desktopLog, 'utf8'));
  return m ? m[1] : null;
}

SCENARIOS['kill-renderer'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  await t.send('kill-main');
  await t.waitFor('渲染进程异常退出: reason=killed', 30000, '被终止事件');
  await t.waitFor('界面已稳定', 120000, '恢复后稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), '被杀后应恢复');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['float-crash'] = async (t) => {
  await t.waitFor('boot-ready', 240000, 'Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  await t.send('crash-float');
  await t.waitFor('kind=float', 30000, '浮窗崩溃事件');
  await t.waitFor('界面已稳定', 120000, '浮窗恢复稳定');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl) && !st.recovery.gaveUp, '主窗应不受影响');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['early-crash'] = async (t) => {
  // 窗口刚创建（loading.html 阶段）就崩溃，验证启动早期崩溃也能恢复
  await t.waitFor('test-channel-ready', 60000, '测试通道就绪');
  await t.send('crash-main');
  await t.waitFor('boot-ready', 240000, '崩溃后仍能完成启动');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), `启动后应加载 Web UI，实际=${st.url}`);
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

SCENARIOS['unsafe-port'] = async (t) => {
  // DSH_DESKTOP_TEST_FORCE_UNSAFE=1：第一次探测到的端口被强制视为
  // Chromium 受限端口（6000），验证自动重启换端口后仍能正常完成启动。
  await t.waitFor('test-channel-ready', 60000, '测试通道就绪');
  await t.waitFor('重启服务换端口', 60000, '受限端口重启日志');
  await t.waitFor('boot-ready', 240000, '换端口后 Web UI 就绪');
  await t.waitFor('界面已稳定', 60000, '稳定期完成');
  const st = await t.state();
  t.assert(sameUrl(st.url, st.webUrl), '应加载到新端口的 Web UI');
  const q = await t.quitAndCheck();
  t.assert(q.exit.code === 0 && q.cleanExit === true, '干净退出');
};

// ---------------------------------------------------------------------------
// 运行入口
// ---------------------------------------------------------------------------

async function runScenario(name) {
  const t = new ScenarioContext(name);
  t.assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败: ${msg}`);
  };
  const started = Date.now();
  const baseline = { node: tasklistPids('node.exe'), electron: tasklistPids('electron.exe') };
  let result = null;
  try {
    t.spawn();
    await SCENARIOS[name](t);
    result = { pass: true };
  } catch (err) {
    result = { pass: false, error: String((err && err.stack) || err) };
  } finally {
    try { await t.quitAndCheck().catch(() => {}); } catch {}
    t.close();
    // 进程清理检查：本次场景引入的 node/electron 进程应全部退出
    await sleep(2000);
    const after = { node: tasklistPids('node.exe'), electron: tasklistPids('electron.exe') };
    for (const pid of baseline.node) after.node.delete(pid);
    for (const pid of baseline.electron) after.electron.delete(pid);
    if (after.node.size > 0 || after.electron.size > 0) {
      result.pass = false;
      result.error = (result.error ? result.error + '; ' : '') +
        `进程泄漏: node.exe=${[...after.node].join(',')} electron.exe=${[...after.electron].join(',')}`;
    }
    result.durationMs = Date.now() - started;
    result.dir = t.dir;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    console.log(Object.keys(SCENARIOS).join('\n'));
    return;
  }
  const names = args.includes('--all') ? Object.keys(SCENARIOS) : args.filter((a) => !a.startsWith('--'));
  if (names.length === 0) {
    console.error('用法: node scripts/test/integration-runner.js <scenario...> | --all | --list');
    process.exit(2);
  }
  let failures = 0;
  for (const name of names) {
    if (!SCENARIOS[name]) {
      console.log(`[${name}] 未知场景`);
      failures += 1;
      continue;
    }
    process.stdout.write(`[${name}] 开始…\n`);
    const r = await runScenario(name);
    process.stdout.write(`[${name}] ${r.pass ? 'PASS' : 'FAIL'} (${(r.durationMs / 1000).toFixed(1)}s)\n`);
    if (!r.pass) {
      failures += 1;
      process.stdout.write(`[${name}] ${r.error}\n`);
    }
  }
  console.log(JSON.stringify({ total: names.length, failures }, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

