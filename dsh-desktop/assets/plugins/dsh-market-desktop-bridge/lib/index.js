/**
 * dsh-market-desktop-bridge — DSH Desktop 配套桥接插件（host 半边）。
 *
 * 为 dsh-community-market（上游市场：anywhere-labs/deepseek-harness-desktop，
 * MIT）提供其在 DSH Plugin Desktop 壳层环境下赖以工作的四个 cordis 服务：
 *
 *   desktopProfiles  当前 profile 身份（name/dir）。桌面壳拥有 profile 位置，
 *                    不经由 DSH_HOME 推导时由 DSH_PROFILE_DIR 显式指定。
 *   desktopPnpm      包操作：重新调起启动本进程的 dsh CLI 跑 `dsh plugin …`
 *                    （安装走 npm registry 精确版本 + 失败回滚 remove）。
 *   desktopPlugins   插件清单与启停：读写 web profile 的 cordis.patch.yml，
 *                    语义与 DSH Desktop 壳层 plugin-manager（sidecar
 *                    plugin-set-enabled → patch-surgery.togglePluginInPatch）
 *                    双向兼容 —— 关闭 = insert 内层条目迁移为顶层
 *                    `disabled: true` 块；启用 = 移除 disabled 行。
 *   desktopActions   openTerminal（本壳未提供终端开启通道，静默忽略）与
 *                    requestRestart（受监管环境重启权归壳层：此处 no-op，
 *                    实际重启由市场客户端补丁转接 window.dshDesktop.
 *                    restartService() 桥走壳层原地监管重启）。
 *
 * 本插件零第三方依赖（仅 @deepseek-ai/cordis + Node 内建），随包分发，
 * 与 dsh-community-market 同装卸载。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Service } from '@deepseek-ai/cordis';

export const name = 'market-desktop-bridge';
export const inject = [];

// ---------------------------------------------------------------------------
// profile 推导（与 dsh-market 历史实现同口径）
// ---------------------------------------------------------------------------

/** 本 host 进程实际启动的 profile（`--profile <name>` on the dsh CLI argv）。 */
function argvProfile() {
  const argv = process.argv;
  const flag = argv.indexOf('--profile');
  if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith('-')) return argv[flag + 1];
  return undefined;
}

/** DSH_HOME（默认 ~/.dsh）。 */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh');
}

/** 壳层可显式指定 profile 目录；否则按 profile 名推导。 */
function resolveProfileDirectory(profile) {
  const explicit = process.env.DSH_PROFILE_DIR;
  if (typeof explicit === 'string' && explicit !== '' && isAbsolute(explicit)) return explicit;
  return join(dshHome(), 'profiles', profile);
}

// ---------------------------------------------------------------------------
// dsh CLI 重入（进程层唯一出口；语义移植自 dsh-market/lib/dsh-cli.js）
// ---------------------------------------------------------------------------

/** Windows npm/dsh 是 .cmd shim，Node spawn 无 shell 起不来。 */
const winCmdShim = process.platform === 'win32';
/** cmd.exe 的元字符 —— 出现在 token 内就必须加引号。 */
const CMD_METACHARS = /[\s"&|<>^()%!]/;

function quoteCmdArg(arg) {
  if (!CMD_METACHARS.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

function cmdCommandLine(argv) {
  return argv.map(quoteCmdArg).join(' ');
}

const COMSPEC = process.env.ComSpec ?? 'cmd.exe';

/**
 * spawn 封装：Windows .cmd shim 经 `cmd.exe /d /s /c` 起进程树，其余直接
 * spawn（shell: false，规避 DEP0190）。
 */
function spawnShim(file, args, options, viaShell = false) {
  if (!viaShell || process.platform !== 'win32') {
    return spawn(file, [...args], { ...options, shell: false });
  }
  return spawn(COMSPEC, ['/d', '/s', '/c', `"${cmdCommandLine([file, ...args])}"`], {
    ...options,
    shell: false,
    windowsVerbatimArguments: true,
  });
}

/** 重入启动本进程的 CLI：`node …bin.js` 直跑；裸 `dsh` 走 PATH shim。 */
function dshArgv() {
  const entry = process.argv[1];
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const abs = resolve(entry);
    return { file: process.execPath, args: [...process.execArgv, abs], cwd: dirname(abs), viaShell: false };
  }
  return { file: 'dsh', args: [], cwd: undefined, viaShell: winCmdShim };
}

/** pnpm v10+ 无 TTY 时交互式卡死 —— CI 模式强制其行动。 */
function spawnEnv() {
  return { ...process.env, CI: 'true' };
}

/**
 * 输出尾部缓冲上限（字符）。issue #170：包管理器的真实失败原因（如
 * `[ERR_PNPM_FETCH_404]`、`dsh: pnpm not found on PATH`）只随子进程输出出现，而市场
 * 侧此前 `resume()` 丢弃输出、把一切压成固定文案，用户无从自救。实测（pnpm 11
 * 经 `dsh plugin` 的 stdio:'inherit' 链）404 错误行落在 **stdout**、只有
 * `dsh: pnpm failed …` 落在 stderr，故两路都要留。桥接层是子进程的唯一拥有者，
 * 在这里留一份**有界**尾部（长日志只保最后 N 字符，不随输出无界增长），随 done
 * 结算一起回传给市场格式化。
 */
const OUTPUT_TAIL_CHARS = 4096;

/**
 * 有界尾部文本缓冲：`push(chunk)` 增量喂入，`take()` 取尾部快照。
 * 用 StringDecoder 逐块解码，避免多字节 UTF-8 被块边界截断成乱码。
 */
function createTailBuffer(limit = OUTPUT_TAIL_CHARS) {
  const decoder = new StringDecoder('utf8');
  const parts = [];
  let length = 0;
  const trim = () => {
    while (length > limit && parts.length > 0) {
      const excess = length - limit;
      const head = parts[0];
      if (head.length <= excess) { length -= head.length; parts.shift(); continue; }
      parts[0] = head.slice(excess);
      length -= excess;
      break;
    }
  };
  return {
    push(chunk) {
      const text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
      if (text === '') return;
      parts.push(text);
      length += text.length;
      trim();
    },
    take() {
      const rest = decoder.end();
      if (rest !== '') { parts.push(rest); length += rest.length; trim(); }
      return parts.join('');
    },
  };
}

/** Windows 上 kill 只杀 wrapper —— taskkill 清整树。 */
function killChildTree(child) {
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    } catch { /* fall through */ }
  }
  child.kill('SIGKILL');
}

/**
 * 跑一条 `dsh plugin …` 命令，返回市场契约要求的流式句柄。
 * @param {readonly string[]} pluginArgs plugin 子命令参数（如 ['add','x@1.0.0']）
 * @param {string} invokingDir 命令 cwd（profile 目录）
 * @param {AbortSignal} [signal]
 * @param {string} [profile] profile 名（`dsh plugin` 的 `--profile` 为必需项，
 *   缺省时内核 CLI 直接 `required option '--profile <name>' not specified` 报错，
 *   导致市场安装/更新/卸载全部失败 —— issue #164）。
 * @returns {{ stdout: import('node:stream').Readable, stderr: import('node:stream').Readable,
 *   done: Promise<{exitCode: number|null, signal: string|null, stdoutTail: string,
 *   stderrTail: string, spawnError: string}>, cancel: () => void }}
 *   `done` 仅在「子进程 exit 已收到且双流已关」后结算（issue #170：旧实现只数
 *   流关闭，Windows 上会得到 exitCode:null → 成功安装被市场误判为失败），并带
 *   两路输出的有界尾部与 spawn 失败原因，供市场拼可自救的错误文案。
 */
/** 组装 `dsh plugin …` 的完整 argv（含必需的 `--profile <name>`）。 */
function buildPluginArgv(entry, pluginArgs, profile) {
  const argv = [...entry.args, 'plugin'];
  if (typeof profile === 'string' && profile !== '') argv.push('--profile', profile);
  argv.push(...pluginArgs);
  return argv;
}

function runDshPlugin(pluginArgs, invokingDir, signal, profile) {
  const entry = dshArgv();
  const argv = buildPluginArgv(entry, pluginArgs, profile);
  const outTail = createTailBuffer();
  const errTail = createTailBuffer();
  const child = spawnShim(entry.file, argv, {
    cwd: invokingDir || entry.cwd || undefined,
    env: spawnEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }, entry.viaShell);
  // 边读边留尾部：两路都必须是 flowing（不堵管道、不卡子进程），同时不丢弃
  // 根因文本（issue #170）——数据监听器兼当排水，无需再 resume()。
  child.stdout.on('data', (chunk) => outTail.push(chunk));
  child.stderr.on('data', (chunk) => errTail.push(chunk));
  const done = new Promise((resolveDone) => {
    let exitCode = null;
    let signalName = null;
    let spawnError = '';
    let settled = false;
    let exited = false;
    // 等整树输出收尾（Windows shim wrapper 退出 ≠ pnpm 退出）再结算，与上游
    // DesktopPnpmHandle「全树退出才 settle」同义。
    let pendingStreams = 2;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolveDone({
        exitCode,
        signal: signalName,
        stderrTail: errTail.take(),
        stdoutTail: outTail.take(),
        spawnError,
      });
    };
    // issue #170（真因）：Windows + node 24 实测两路 stdio 的 'close' 先于子进程
    // 'exit' 到达（stdout-close → stderr-close → exit）。只数流关闭会在 exitCode
    // 仍为 null 时结算，市场 `outcome.exitCode !== 0` 据此判败 → **安装实际成功
    // 也报“did not complete successfully”并回滚**。故结算条件改为「exit 已收到
    // 且双流已关」，并以 ChildProcess 'close' 兜底。
    const trySettle = () => { if (exited && pendingStreams <= 0) settle(); };
    const onStreamClose = () => { pendingStreams -= 1; trySettle(); };
    child.stdout.on('close', onStreamClose);
    child.stderr.on('close', onStreamClose);
    child.on('exit', (code, sig) => { exitCode = code; signalName = sig; exited = true; trySettle(); });
    child.on('error', (err) => {
      // spawn 本身失败（ENOENT / EPERM 等）：错误文本此前被吞成 exitCode -1。
      spawnError = String((err && err.message) || err || 'spawn error');
      exitCode = -1;
      signalName = null;
      exited = true;
      settle();
    });
    child.on('close', (code, sig) => {
      if (!exited) { exitCode = code; signalName = sig; exited = true; }
      settle();
    });
  });
  const cancel = () => killChildTree(child);
  if (signal !== undefined) {
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  }
  return { stdout: child.stdout, stderr: child.stderr, done, cancel };
}

/** `dsh plugin add <name>@<version> --save-exact …`（安装与更新共用同一命令形态）。 */
function updateAddCommand(packageName, version, pnpmOptions = []) {
  return ['add', `${packageName}@${version}`, '--save-exact', ...pnpmOptions];
}

// ---------------------------------------------------------------------------
// cordis.patch.yml 手术（与壳层 patch-surgery 同文件格式语义的自包含实现）
// 行级实现：顶层条目 = 行首 `- ` 开始到下一个行首 `- ` 前；insert 内层条目
// = 缩进的 `- id:` 行 + 更深缩进的属性行。
// ---------------------------------------------------------------------------

const LOADER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function yamlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function preserveEol(original, out) {
  const eol = detectEol(original);
  return eol === '\n' ? out : out.replace(/\n/g, '\r\n');
}

function indentOf(line) {
  const m = /^[ \t]*/.exec(line);
  return m === null ? 0 : m[0].length;
}

function stripQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * 行级解析 patch：产出顶层块（含 insert 块）骨架。
 * @returns {{ begin:number, end:number, insert:boolean, indent:number }[]}
 */
function topLevelBlockRanges(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^-(\s|$)/.test(lines[i])) {
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^-(\s|$)/.test(lines[j])) { end = j; break; }
      }
      blocks.push({ begin: i, end, insert: /^-\s*insert\s*:/.test(lines[i]), indent: 0 });
    }
  }
  return blocks;
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在 insert 块范围内找内层 `- id: <id>` 条目的行范围（id 行 + 其后更深缩
 * 进的属性行）。@return {[number, number] | null}
 */
function findInnerEntry(lines, begin, end, id) {
  const idLineRe = new RegExp(`^\\s+-\\s*id:\\s*'?${escapeRe(id)}'?\\s*$`);
  for (let i = begin; i < end; i += 1) {
    if (!idLineRe.test(lines[i])) continue;
    const base = indentOf(lines[i]);
    let j = i + 1;
    while (j < end) {
      const line = lines[j];
      if (line.trim() === '') break;
      if (line.trim().startsWith('#')) { j += 1; continue; }
      if (indentOf(line) <= base) break;
      j += 1;
    }
    return [i, j];
  }
  return null;
}

/**
 * 顶层 `- id: <id>` 块内属性行索引集合与范围。
 * @returns {{ begin:number, end:number, props: Map<string, number> } | null}
 */
function findTopEntry(lines, id) {
  const idLineRe = new RegExp(`^-\\s*id:\\s*'?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?\\s*$`);
  const idLinePrefixRe = new RegExp(`^-\\s*id:\\s*'?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?\\b`);
  for (let i = 0; i < lines.length; i += 1) {
    if (!idLinePrefixRe.test(lines[i])) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^-(\s|$)/.test(lines[j])) { end = j; break; }
    }
    const props = new Map();
    for (let j = i + 1; j < end; j += 1) {
      const m = /^([ \t]{0,2})([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[j]);
      if (m !== null) props.set(m[2], j);
    }
    return { begin: i, end, props };
  }
  return null;
}

/** 解析 patch 顶层与 insert 内层条目 → 注册行集合。 */
function parsePatchRows(text) {
  const rows = [];
  const normalized = text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text;
  const lines = normalized.split('\n');
  for (const block of topLevelBlockRanges(lines)) {
    if (block.insert) {
      for (let i = block.begin + 1; i < block.end; i += 1) {
        const m = /^([ \t]+)-\s*id:\s*(\S+)\s*$/.exec(lines[i]);
        if (m === null) continue;
        const row = { id: stripQuotes(m[2]), name: '', disabled: false, removed: false, nested: true };
        const base = indentOf(lines[i]);
        for (let j = i + 1; j < block.end; j += 1) {
          if (lines[j].trim() === '') break;
          if (indentOf(lines[j]) <= base) break;
          const p = /^([ \t]+)(name|disabled|removed)\s*:\s*(.*)$/.exec(lines[j]);
          if (p === null) continue;
          if (p[2] === 'name') row.name = stripQuotes(p[3]);
          if (p[2] === 'disabled') row.disabled = /true/i.test(p[3]);
          if (p[2] === 'removed') row.removed = /true/i.test(p[3]);
        }
        rows.push(row);
      }
    } else {
      const idMatch = /^-\s*id:\s*(\S+)\s*$/.exec(lines[block.begin]);
      if (idMatch === null) continue;
      const row = { id: stripQuotes(idMatch[1]), name: '', disabled: false, removed: false, nested: false };
      for (let j = block.begin + 1; j < block.end; j += 1) {
        const p = /^([ \t]{0,2})(name|disabled|removed)\s*:\s*(.*)$/.exec(lines[j]);
        if (p === null) continue;
        if (p[2] === 'name') row.name = stripQuotes(p[3]);
        if (p[2] === 'disabled') row.disabled = /true/i.test(p[3]);
        if (p[2] === 'removed') row.removed = /true/i.test(p[3]);
      }
      rows.push(row);
    }
  }
  return rows;
}

/** insert 块内层条目全部移除后，删掉空 `- insert:` 块首行。 */
function dropEmptyInsertLines(lines) {
  const blocks = topLevelBlockRanges(lines);
  const drop = new Set();
  for (const block of blocks) {
    if (!block.insert) continue;
    let hasEntry = false;
    for (let i = block.begin + 1; i < block.end; i += 1) {
      if (/^\s+-\s*(?:id|name|config|disabled|removed|requires)\s*:/.test(lines[i])) { hasEntry = true; break; }
    }
    if (!hasEntry) drop.add(block.begin);
  }
  return lines.filter((_, i) => !drop.has(i));
}

/**
 * 幂等关闭：insert 内层条目移出 + 顶层块确保 disabled: true（无则追加）。
 * 与壳层 patch-surgery.togglePluginInPatch(text, id, false) 文件格式兼容。
 */
function disableInPatch(text, id, pkgName) {
  if (!LOADER_ID_RE.test(id)) throw new TypeError('invalid loader id: ' + id);
  const original = text;
  const normalized = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  let lines = normalized.split('\n');
  // 1) 移出 insert 内层条目（同一 id 只保留一个登记点）
  const blocks = topLevelBlockRanges(lines);
  for (const block of blocks) {
    if (!block.insert) continue;
    const range = findInnerEntry(lines, block.begin, block.end, id);
    if (range !== null) {
      lines.splice(range[0], range[1] - range[0]);
      return finishDisable(original, lines, id, pkgName);
    }
  }
  return finishDisable(original, lines, id, pkgName);
}

function finishDisable(original, lines, id, pkgName) {
  lines = dropEmptyInsertLines(lines);
  // 2) 顶层块：确保 disabled: true；removed: true 翻回 false（复活语义）
  const top = findTopEntry(lines, id);
  if (top !== null) {
    let mutated = false;
    if (top.props.has('removed')) {
      lines[top.props.get('removed')] = lines[top.props.get('removed')].replace(/(:\s*)true\b/i, '$1false');
      mutated = true;
    }
    if (top.props.has('disabled')) {
      const idx = top.props.get('disabled');
      if (!/true/i.test(lines[idx])) { lines[idx] = lines[idx].replace(/(:\s*)\S+/, ': true'); mutated = true; }
    } else {
      const nameIdx = top.props.get('name');
      const insertAt = nameIdx !== undefined ? nameIdx + 1 : top.begin + 1;
      lines.splice(insertAt, 0, '  disabled: true');
      mutated = true;
    }
    if (!mutated) return original;
  } else {
    // 3) 追加标记注释 + 顶层禁用块（先清历史标记注释防堆积）
    lines = lines.filter((line) => !(line.trim().startsWith('#') && line.includes(`关闭 ${id}`)));
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push(`# 插件管理（设置页「插件」栏）：关闭 ${id}`);
    lines.push(`- id: ${id}`);
    lines.push(`  name: ${yamlQuote(pkgName)}`);
    lines.push('  disabled: true');
    lines.push('');
  }
  const out = lines.join('\n');
  return out === normalizedOf(original) ? original : preserveEol(original, out);
}

function normalizedOf(text) {
  return text.includes('\r\n') ? text.replace(/\r\n/g, '\n') : text;
}

/**
 * 幂等启用：顶层块移除 disabled/removed 行；仍带 name/config 则保留为激活
 * 登记（对市场安装的用户插件，删掉整块等于注销）；两者皆无才整块移除。
 */
function enableInPatch(text, id) {
  if (!LOADER_ID_RE.test(id)) throw new TypeError('invalid loader id: ' + id);
  const original = text;
  const normalized = normalizedOf(original);
  const lines = normalized.split('\n');
  const top = findTopEntry(lines, id);
  if (top === null) return original;
  const dropRows = [];
  for (const key of ['disabled', 'removed']) {
    if (top.props.has(key)) dropRows.push(top.props.get(key));
  }
  const keepable = top.props.has('name') || top.props.has('config')
    || [...top.props.keys()].some((key) => !['disabled', 'removed'].includes(key));
  let out;
  if (keepable) {
    const next = lines.filter((_, i) => !dropRows.includes(i));
    out = next.join('\n');
  } else {
    // 无 name/config：整块移除（配套件的 insert 由同步链下次启动补回，与壳层
    // patch-surgery 对齐）
    let end = top.end;
    while (end < lines.length && (lines[end].trim() === '' || lines[end].trim().startsWith('#'))) end += 1;
    const next = lines.filter((_, i) => i < top.begin || i >= end);
    out = next.join('\n');
  }
  // 清标记注释
  out = out.split('\n').filter((line) => !(line.trim().startsWith('#') && line.includes(`关闭 ${id}`))).join('\n');
  if (out === normalized) return original;
  return preserveEol(original, out);
}

// ---------------------------------------------------------------------------
// 服务实现
// ---------------------------------------------------------------------------

/** dsh profile 模板自带的核心 bundle —— 永不作为可管理项列出/禁卸。 */
const INBOX_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
]);
/** 市场与桥本体 —— 禁止通过市场禁用/卸载（防自毁）。 */
const PRODUCT_PACKAGES = new Set(['dsh-community-market', 'dsh-market-desktop-bridge']);

class BridgeProfileService extends Service {
  constructor(ctx, current) {
    super(ctx, 'desktopProfiles');
    this._current = Object.freeze({ ...current });
  }
  get current() { return this._current; }
}

class BridgePnpmService extends Service {
  constructor(ctx, profile) {
    super(ctx, 'desktopPnpm');
    this._profile = profile;
    this._receiptPackages = new Map();
    this._updateReceipts = new Map();
  }
  runPlugin(args, invokingDir, signal) {
    return runDshPlugin(args, invokingDir ?? this._profile.dir, signal, this._profile.name);
  }
  async installPlugin(request) {
    const { pnpmOptions = [], invokingDir, recovery, signal } = request;
    const target = `${recovery.packageName}@${recovery.packageVersion}`;
    this._receiptPackages.set(recovery.receiptId, recovery.packageName);
    return runDshPlugin(['add', target, '--save-exact', ...pnpmOptions], invokingDir ?? this._profile.dir, signal, this._profile.name);
  }
  async recoveredInstallReceiptIds() { return []; }
  async acknowledgeRecoveredInstall() { /* 无 WAL：无恢复面 */ }
  async rollbackPluginInstall(receiptId) {
    const packageName = this._receiptPackages.get(receiptId);
    if (packageName === undefined) return false;
    this._receiptPackages.delete(receiptId);
    const handle = runDshPlugin(['remove', packageName], this._profile.dir, undefined, this._profile.name);
    const outcome = await handle.done;
    return outcome.exitCode === 0;
  }
  /**
   * 更新 = `dsh plugin add <name>@<newVersion> --save-exact …`（pnpm add 对已装
   * 包即为精确升格），与 installPlugin 同命令形态、共用 registry 选项；把旧版本
   * 记入回执表，失败时 rollbackPluginUpdate 用旧版本 re-add 还原（而非 remove）。
   */
  async updatePlugin(request) {
    const { pnpmOptions = [], packageName, packageVersion, previousVersion, invokingDir, receiptId, signal } = request;
    this._updateReceipts.set(receiptId, { packageName, previousVersion });
    return runDshPlugin(updateAddCommand(packageName, packageVersion, pnpmOptions), invokingDir ?? this._profile.dir, signal, this._profile.name);
  }
  async rollbackPluginUpdate(receiptId) {
    const record = this._updateReceipts.get(receiptId);
    if (record === undefined) return false;
    this._updateReceipts.delete(receiptId);
    const handle = runDshPlugin(updateAddCommand(record.packageName, record.previousVersion), this._profile.dir, undefined, this._profile.name);
    const outcome = await handle.done;
    return outcome.exitCode === 0;
  }
}

class BridgePluginsService extends Service {
  constructor(ctx, profile) {
    super(ctx, 'desktopPlugins');
    this._profile = profile;
    this._previews = new Map();
    this._seq = 0;
    this._previewTtlMs = 5 * 60 * 1000;
    ctx.effect(() => () => { this._previews.clear(); }, 'market-desktop-bridge: preview lifetime');
  }
  _patchFile() { return join(this._profile.dir, 'cordis.patch.yml'); }
  _readPatch() {
    try { return readFileSync(this._patchFile(), 'utf8'); } catch { return ''; }
  }
  _writePatch(text) { writeFileSync(this._patchFile(), text); }
  _rows() { return parsePatchRows(this._readPatch()); }
  _rowById(bundleId) { return this._rows().find((row) => row.id === bundleId); }
  _mutable(name) {
    return typeof name === 'string' && name !== ''
      && !INBOX_BUNDLES.has(name) && !PRODUCT_PACKAGES.has(name);
  }
  list() {
    const seen = new Set();
    const bundles = [];
    for (const row of this._rows()) {
      if (seen.has(row.id) || row.removed) continue;
      seen.add(row.id);
      bundles.push({
        bundleId: row.id,
        packageName: row.name || row.id,
        status: row.disabled ? 'disabled' : 'active',
        mutable: this._mutable(row.name || row.id),
      });
    }
    return bundles;
  }
  _issuePreview(bundleId, action) {
    const row = this._rowById(bundleId);
    if (row === undefined) throw new Error(`unknown desktop plugin bundle: ${bundleId}`);
    if (!this._mutable(row.name || row.id)) throw new Error(`plugin bundle is not mutable: ${bundleId}`);
    const now = Date.now();
    for (const [key, value] of this._previews) {
      if (value.expiresAt <= now) this._previews.delete(key);
    }
    this._seq += 1;
    const previewId = `bridge-${now.toString(36)}-${this._seq}`;
    const entry = {
      bundleId,
      packageName: row.name || row.id,
      action,
      expiresAt: now + this._previewTtlMs,
    };
    this._previews.set(previewId, entry);
    return {
      previewId,
      profileName: this._profile.name,
      packageName: entry.packageName,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }
  previewDisable(bundleId) { return this._issuePreview(bundleId, 'disable'); }
  previewEnable(bundleId) { return this._issuePreview(bundleId, 'enable'); }
  async _execute(previewId, kind) {
    const entry = this._previews.get(previewId);
    if (entry === undefined || entry.action !== kind || entry.expiresAt <= Date.now()) {
      throw new Error(`preview expired or unknown: ${previewId}`);
    }
    this._previews.delete(previewId);
    let text = this._readPatch();
    if (!text.trim()) text = '# dsh web profile patch（由 DSH Desktop 维护）\n';
    const row = this._rowById(entry.bundleId);
    const pkgName = row?.name || entry.packageName;
    const patched = kind === 'disable'
      ? disableInPatch(text, entry.bundleId, pkgName)
      : enableInPatch(text, entry.bundleId);
    if (patched !== text) this._writePatch(patched);
    return { packageName: entry.packageName };
  }
  async executeDisable(previewId) { return this._execute(previewId, 'disable'); }
  async executeEnable(previewId) { return this._execute(previewId, 'enable'); }
  isDisabled(packageName) {
    return this._rows().some((row) => row.disabled && (row.name === packageName || row.id === packageName));
  }
  disabledPackageNames() {
    const names = new Set();
    for (const row of this._rows()) {
      if (!row.disabled) continue;
      names.add(row.name || row.id);
    }
    return [...names];
  }
}

class BridgeActionsService extends Service {
  constructor(ctx) {
    super(ctx, 'desktopActions');
  }
  openTerminal() {
    // 本壳未提供终端开启通道：静默忽略（市场 state 面只反映能力存在，
    // 按钮无副作用）。后续壳层若暴露 terminal 桥可在此转接。
  }
  async requestRestart() {
    // 受监管环境重启权归壳层：host 半边 no-op。实际重启由市场客户端补丁
    // （[desktop-restart-fix]）转接 window.dshDesktop.restartService() 走
    // 壳层原地监管重启；无桥环境回落为「稍后重启」。
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

/**
 * 注册四个 desktop 服务。市场侧（dsh-community-market）以 ctx.inject 消费，
 * 服务就绪即激活（浏览始终可用；包操作随 desktopPnpm/desktopProfiles 就绪）。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const profileName = process.env.DSH_PROFILE ?? argvProfile() ?? 'web';
  const profileDir = resolveProfileDirectory(profileName);
  const current = { name: profileName, dir: profileDir };
  ctx.effect(() => {
    const profiles = new BridgeProfileService(ctx, current);
    const pnpm = new BridgePnpmService(ctx, current);
    const plugins = new BridgePluginsService(ctx, current);
    const actions = new BridgeActionsService(ctx);
    return () => {
      for (const service of [profiles, pnpm, plugins, actions]) {
        if (typeof service.dispose === 'function') service.dispose();
      }
    };
  }, 'market-desktop-bridge: desktop services for dsh-community-market');
}

// 纯函数面（仅测试消费；loader 只认 name/inject/apply，多余导出无副作用）。
export const __internals = {
  parsePatchRows,
  disableInPatch,
  enableInPatch,
  argvProfile,
  resolveProfileDirectory,
  buildPluginArgv,
  createTailBuffer,
  runDshPlugin,
  updateAddCommand,
  BridgePnpmService,
};
