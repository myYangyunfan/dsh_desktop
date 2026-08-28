'use strict';

// ---------------------------------------------------------------------------
// 组合完整性探测（composition integrity）。
//
// 背景：cordis Loader 的故障隔离（cordis-plugin-loader isolateEntryApplyFailures）
// 让「单个 loader entry 激活失败」只写一行 stderr（[loader-isolation] entry …
// failed to apply），树继续启动——受保护名单只有 @deepseek-ai/dsh-base 与
// @deepseek-ai/dsh-web-app 两个 bundle 名。于是「credentials 服务包缺失 / 损坏」
// 这类组合关键服务缺席会被静默降级，直到用户保存 key 那一刻才以
// "credentials service is absent" 爆出来（dsh-host-apiproxy credentialsAbsent）。
//
// 本模块是横向防线的第一层（静态层）：启动前 / 诊断时全量解析宿主组合 yml 的
// 服务行，断言每个服务行声明的包目录在位且 package.json 可解析。纯函数 +
// 可独立 CLI 运行，不修改任何文件（与 fault-isolation preflight 同为只读预检，
// 但探测对象从「ui-slots 补丁覆盖」换成「组合服务行的包在位性」）。
//
// 与 K1（根因线）的关系：K1 若在 preflightHealth 挂运行期探测，本模块提供
// 静态底座与关键服务清单的单一事实源；两者互不依赖。
//
// CLI：
//   node composition-integrity.js --app-dir <payloadRoot>
//   node composition-integrity.js --payload-dir <payloadRoot>   （别名）
// 输出 JSON；退出码非 0 当且仅当关键服务缺席（row-missing / package-missing /
// package-corrupt）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

// 宿主组合的 bundle 清单（desktop = web profile：dsh-base 之上叠 dsh-web-app）。
// name 为 node_modules 包名；file 为包内组合文件相对路径。
const COMPOSITION_SOURCES = [
  { bundle: 'dsh-base', name: '@deepseek-ai/dsh-base', file: 'cordis.patch.yml' },
  { bundle: 'dsh-web-app', name: '@deepseek-ai/dsh-web-app', file: 'cordis.patch.yml' },
];

// ---------------------------------------------------------------------------
// 关键服务清单：缺席会让核心功能哑火的服务行（rowId/moduleName 对应
// cordis.patch.yml 的行 id 与 name）。consequence 为缺席后果文案（UI 直接展示）。
// 判定标准：
//   - 受保护 bundle（loader 缺失即致命，本来就不会静默）；
//   - 「用户高频路径的单点依赖」：保存 key（credentials）、设置读写（settings）、
//     模型调用（llm/llm-deepseek）、会话（session/persistence）、页面可达
//     （webserver/modules/connection/typert-gateway）、权限边界（sandbox/approval）、
//     持久存储（storage-json）、插件清单（plugin-inventory）。
// platformConditional 不在本清单（bash/pwsh 系行按平台禁用属正常组合）。
// ---------------------------------------------------------------------------
const CRITICAL_SERVICES = [
  { rowId: 'credentials', moduleName: '@deepseek-ai/dsh-credentials-local', label: '凭据服务', consequence: '保存/读取 API key 失败（保存 key 时报 "credentials service is absent"）' },
  { rowId: 'settings', moduleName: '@deepseek-ai/dsh-settings-file', label: '设置文档', consequence: '设置读写失效：模型页/偏好保存后不生效或报错' },
  { rowId: 'llm', moduleName: '@deepseek-ai/dsh-llm', label: '模型调用核心', consequence: '所有模型请求无法发起，对话不可用' },
  { rowId: 'llm-deepseek', moduleName: '@deepseek-ai/dsh-llm-deepseek', label: 'DeepSeek 模型路由', consequence: '官方 DeepSeek 模型全部不可用' },
  { rowId: 'session', moduleName: '@deepseek-ai/dsh-session', label: '会话域', consequence: '会话创建/派发失效，无法开始任何对话' },
  { rowId: 'session-persistence-jsonl', moduleName: '@deepseek-ai/dsh-session-persistence-jsonl', label: '会话落盘', consequence: '会话不持久化：重启后全部历史丢失' },
  { rowId: 'sandbox', moduleName: '@deepseek-ai/dsh-sandbox-local', label: '文件边界', consequence: '沙箱判定失效，文件操作权限边界不可用' },
  { rowId: 'approval', moduleName: '@deepseek-ai/dsh-user-approval', label: '权限审批', consequence: '工具调用的用户审批（允许/拒绝）流程失效' },
  { rowId: 'storage-json', moduleName: '@deepseek-ai/dsh-storage-json', label: '本地存储', consequence: '本地键值存储失效，依赖 storage 域的功能不保存' },
  { rowId: 'webserver', moduleName: '@deepseek-ai/dsh-host-webserver', label: '本地服务端口', consequence: '页面端口不监听：白屏/一直加载' },
  { rowId: 'typert-gateway', moduleName: '@deepseek-ai/dsh-api-gateway', label: 'API 网关', consequence: '前后端 RPC 全部哑火，页面所有操作报错' },
  { rowId: 'modules', moduleName: '@deepseek-ai/dsh-client-modules', label: '前端模块表', consequence: '浏览器模块表（window.__DSH_BOOT__）缺失，页面空白' },
  { rowId: 'connection', moduleName: '@deepseek-ai/dsh-client-connection', label: '前后端传输', consequence: 'fetch/SSE 传输断开，页面无法与后端通信' },
  { rowId: 'plugin-inventory', moduleName: '@deepseek-ai/dsh-host-plugin-inventory', label: '插件清单服务', consequence: '插件清单/健康页无数据' },
  { rowId: 'web-runtime', moduleName: '@deepseek-ai/dsh-web-app', label: 'Web 运行时 bundle', consequence: 'Web 运行时未挂载（受保护 bundle，缺失即启动失败）' },
  { rowId: 'base-bundle', moduleName: '@deepseek-ai/dsh-base', label: '基础组合 bundle', consequence: '基础组合缺失（受保护 bundle，缺失即启动失败）' },
];

/** 关键服务清单（只读快照，供 CLI / 前端 / preflight 复用）。 */
function criticalServices() {
  return CRITICAL_SERVICES.map((s) => ({ ...s }));
}

// ---------------------------------------------------------------------------
// yml 服务行解析（容错、无依赖）。
//
// cordis.patch.yml 含 `!js` 表达式与多行标量，通用 YAML 解析器会因自定义
// tag 失败；本层只关心「行 id + 兄弟 name」，逐行扫描即可，且天然满足
// 「yml 坏行容错」：解析不出的行记 parseIssues，不中断全量扫描。
//
// 形态（两层均覆盖）：
//   - insert:            ← 结构行，跳过
//       - id: timer      ← 服务行起点
//         name: '@deepseek-ai/cordis-plugin-timer'
//   - id: system-prompt  ← 覆写行（顶层，无 name）：重配置既有 id，不引入包
//     config: …
// ---------------------------------------------------------------------------

/** 从一行文本提取 `- id: <value>` 的 value；非 id 行返回 null。 */
function matchRowId(line) {
  // 允许任意缩进的列表项 `- id: x`；value 可带单/双引号。
  const m = line.match(/^\s*-\s+id:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** 从一行文本提取 `name: <value>`（服务行的兄弟属性行）。 */
function matchName(line) {
  // 仅匹配属性行（有缩进、非列表项），避免误吞注释里的字样。
  const m = line.match(/^\s+name:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*(?:#.*)?$/);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** 从一行文本提取 `disabled: <value>`（字面量或 !!js 表达式均算「有禁用声明」）。 */
function matchDisabled(line) {
  const m = line.match(/^\s+disabled:\s*(.+?)\s*(?:#.*)?$/);
  return m ? m[1].trim() : null;
}

/**
 * 解析一份 cordis.patch.yml 文本的服务行。
 * @param {string} content yml 文本
 * @param {string} [sourceLabel] 来源标签（报错定位用）
 * @returns {{rows: Array<{rowId:string|null,name:string|null,disabled:string|null}>, parseIssues: Array<{line:number,text:string}>}}
 */
function parseServiceRows(content, sourceLabel = 'yml') {
  const rows = [];
  const parseIssues = [];
  let current = null;
  let currentIndent = -1;
  const lines = String(content).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    const id = matchRowId(line);
    if (id !== null) {
      // 下一服务行：结算上一行。id 解析失败不会走到这里（正则不匹配即跳过）。
      if (current) rows.push(current);
      current = { rowId: id, name: null, disabled: null };
      currentIndent = indent;
      continue;
    }
    const isListItem = /^\s*-\s+/.test(line) && !/^\s*-\s+insert:/.test(line);
    if (isListItem) {
      // 坏行：非 id 的列表项。仅当它与当前行同级（行级缩进）或无行上下文时
      // 记 parseIssue——更深的缩进属于 config 块内容（块式列表值），不算坏行。
      if (current === null || indent <= currentIndent) {
        parseIssues.push({ line: i + 1, text: trimmed, source: sourceLabel, reason: 'list item without id' });
      }
      continue;
    }
    if (current) {
      const name = matchName(line);
      if (name !== null) {
        if (current.name === null) current.name = name;
        else parseIssues.push({ line: i + 1, text: trimmed, source: sourceLabel, reason: 'duplicate name' });
        continue;
      }
      const disabled = matchDisabled(line);
      if (disabled !== null && current.disabled === null) current.disabled = disabled;
    }
  }
  if (current) rows.push(current);
  return { rows, parseIssues };
}

/**
 * 包名 → node_modules 相对路径（容忍 @scope/名 与子路径）。
 *   '@deepseek-ai/dsh-web-app/startup'      → '@deepseek-ai/dsh-web-app'
 *   '@deepseek-ai/dsh-tool-subagent-control/list-agents' → '@deepseek-ai/dsh-tool-subagent-control'
 *   'dsh-web-app'                            → 'dsh-web-app'
 *   'dsh-web-app/lib/x'                      → 'dsh-web-app'
 * @param {string} moduleName 组合行声明的 name
 * @returns {string|null} 包名（= node_modules 下的目录段），无法解析返回 null
 */
function packageNameOf(moduleName) {
  if (!moduleName || typeof moduleName !== 'string') return null;
  const parts = moduleName.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (moduleName.startsWith('@')) {
    // @scope/pkg（子路径截断）；裸 '@scope' 或 '@' 视为坏名。
    if (parts.length < 2) return null;
    return parts.slice(0, 2).join('/');
  }
  return parts[0];
}

/**
 * 断言一个包在某个 node_modules 根下的在位性与完好性。
 * @returns {'present'|'package-missing'|'package-corrupt'} + 佐证字段
 */
function probePackage(nmRoot, pkgName) {
  const dir = path.join(nmRoot, ...pkgName.split('/'));
  if (!fs.existsSync(dir)) return { status: 'package-missing', dir };
  const pkgJsonPath = path.join(dir, 'package.json');
  let raw;
  try { raw = fs.readFileSync(pkgJsonPath, 'utf8'); } catch { return { status: 'package-corrupt', dir, reason: 'package.json unreadable' }; }
  try { JSON.parse(raw); } catch (err) { return { status: 'package-corrupt', dir, reason: 'package.json parse failed: ' + ((err && err.message) || err) }; }
  return { status: 'present', dir };
}

// 服务状态枚举（CLI JSON 的 status 字段）：
//   present         服务行存在 + 包目录在位 + package.json 可解析
//   row-missing     关键服务行在组合 yml 里整个缺失（解析树缺行）
//   package-missing 服务行在、包目录不在
//   package-corrupt 包目录在、package.json 缺失/不可读/解析失败
//   override-row    覆写行（无 name，不引入包）——不计缺席
const SERVICE_STATUS = { PRESENT: 'present', ROW_MISSING: 'row-missing', PKG_MISSING: 'package-missing', PKG_CORRUPT: 'package-corrupt', OVERRIDE: 'override-row' };

/**
 * 组合完整性探测（静态层，只读）。
 * @param {string} appDir payload 根（其下有 node_modules）；--payload-dir 别名同义
 * @param {Object} [opts]
 * @param {string[]} [opts.nmRoots] 覆盖默认 node_modules 根（单测注入用）
 * @param {Array} [opts.sources] 覆盖默认组合 bundle 清单（单测注入用）
 * @param {Array} [opts.critical] 覆盖默认关键服务清单（单测注入用）
 * @returns {{ok:boolean, appDir:string, sources:Array, services:Array, criticalMissing:Array, parseIssues:Array}}
 */
function checkServicePresence(appDir, opts = {}) {
  const nmRoots = opts.nmRoots || [path.join(appDir, 'node_modules')];
  const sources = opts.sources || COMPOSITION_SOURCES;
  const criticalList = opts.critical || criticalServices();
  const services = [];
  const sourceReports = [];
  const parseIssues = [];
  // 关键服务命中表（按 rowId 与 moduleName 双键匹配；bundle 包本体按 moduleName）。
  const criticalHit = new Map(criticalList.map((c) => [c.rowId + '\n' + c.moduleName, { ...c, seen: false }]));

  const criticalFor = (row) => {
    for (const hit of criticalHit.values()) {
      if (hit.seen) continue;
      if (hit.moduleName === row.name || (hit.rowId === row.rowId && row.name)) return hit;
    }
    return null;
  };

  for (const src of sources) {
    const pkgName = packageNameOf(src.name);
    const file = path.join(nmRoots[0], ...String(pkgName).split('/'), src.file);
    let content = null;
    try { content = fs.readFileSync(file, 'utf8'); } catch { /* 缺文件按整体 bundle 缺席处理 */ }
    if (content === null) {
      // 组合源文件缺失：该 bundle 视作缺席；以它为本体的关键服务（base-bundle /
      // web-runtime）与其中声明过 name 的关键行一并记 row-missing。
      sourceReports.push({ bundle: src.bundle, file, present: false, rows: 0 });
      for (const hit of criticalHit.values()) {
        if (!hit.seen && hit.moduleName === src.name) {
          hit.seen = true;
          services.push({ rowId: hit.rowId, bundle: src.bundle, name: hit.moduleName, package: hit.moduleName, status: SERVICE_STATUS.ROW_MISSING, critical: true, consequence: hit.consequence, reason: 'composition source missing: ' + file });
        }
      }
      continue;
    }
    // 源文件在位且可读：以该包为本体的受保护 bundle 关键服务即视为在位
    // （dsh-base 本身不是服务行，是组合容器；dsh-web-app 的行级探测走
    // web-runtime 行，此处兜底防源在位而行清单漏配）。
    for (const hit of criticalHit.values()) {
      if (!hit.seen && hit.moduleName === src.name && src.name === '@deepseek-ai/dsh-base') {
        hit.seen = true;
        services.push({ rowId: hit.rowId, bundle: src.bundle, name: src.name, package: src.name, status: SERVICE_STATUS.PRESENT, critical: true, consequence: hit.consequence, dir: path.dirname(file) });
      }
    }
    const { rows, parseIssues: issues } = parseServiceRows(content, src.bundle);
    parseIssues.push(...issues);
    sourceReports.push({ bundle: src.bundle, file, present: true, rows: rows.length });
    for (const row of rows) {
      if (!row.name) {
        // 覆写行：重配置既有 id，不引入包；仍入列便于全量审计。
        services.push({ rowId: row.rowId, bundle: src.bundle, name: null, package: null, status: SERVICE_STATUS.OVERRIDE, critical: false, disabled: row.disabled });
        continue;
      }
      const pkg = packageNameOf(row.name);
      let probe = pkg ? null : { status: SERVICE_STATUS.PKG_CORRUPT, reason: 'unparseable module name: ' + row.name };
      if (pkg) {
        for (const root of nmRoots) {
          probe = probePackage(root, pkg);
          if (probe.status === SERVICE_STATUS.PRESENT) break;
        }
      }
      const hit = criticalFor(row);
      const entry = {
        rowId: row.rowId, bundle: src.bundle, name: row.name, package: pkg,
        status: probe.status, critical: false, consequence: null,
        dir: probe.dir, reason: probe.reason || null, disabled: row.disabled,
      };
      if (hit) { hit.seen = true; entry.critical = true; entry.consequence = hit.consequence; }
      services.push(entry);
    }
  }

  // 未在组合里命中的关键服务 → row-missing（解析树缺行，正是
  // 「credentials service is absent」的静默前置形态之一）。
  for (const hit of criticalHit.values()) {
    if (hit.seen) continue;
    services.push({ rowId: hit.rowId, bundle: '(missing)', name: hit.moduleName, package: hit.moduleName, status: SERVICE_STATUS.ROW_MISSING, critical: true, consequence: hit.consequence, reason: 'service row absent from composition yml' });
  }

  const criticalMissing = services.filter((s) => s.critical && s.status !== SERVICE_STATUS.PRESENT);
  return { ok: criticalMissing.length === 0, appDir, sources: sourceReports, services, criticalMissing, parseIssues };
}

// ---------------------------------------------------------------------------
// CLI 入口（require 直跑时）。输出 JSON；退出码非 0 当且仅当关键服务缺席。
// ---------------------------------------------------------------------------
function cliMain(argv = process.argv.slice(2), deps = {}) {
  const check = deps.checkServicePresence || checkServicePresence;
  let appDir = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app-dir' || argv[i] === '--payload-dir') appDir = argv[++i];
  }
  if (!appDir) {
    process.stderr.write('用法: node composition-integrity.js --app-dir <payloadRoot>\n');
    return 2;
  }
  let report;
  try { report = check(appDir); }
  catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((err && err.message) || err) }, null, 2) + '\n');
    return 1;
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return report.ok ? 0 : 1;
}

if (require.main === module) process.exit(cliMain());

module.exports = {
  COMPOSITION_SOURCES,
  SERVICE_STATUS,
  criticalServices,
  parseServiceRows,
  packageNameOf,
  probePackage,
  checkServicePresence,
  cliMain,
};
