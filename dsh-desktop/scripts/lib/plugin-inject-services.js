'use strict';

// 内置插件「宿主半边 inject 的服务名」可解析性判据（判据源，纯函数）。
//
// 为什么需要这条判据（2026-10-17 实测事故）：内核 0.2.1-rc.1 把 `webRuntime`
// 服务整块删除（全树 grep 该服务名 0 命中，信任清单改由 `dsh-client-connection`
// 的 `connection` 服务持有），而 dsh-better-sidebar / dsh-basics-panel 的宿主半边
// 仍 `inject = ['webServer','sessions','webRuntime','tools']`。cordis 的 inject 是
// **就绪门**：名字解析不到 → fiber 永久 pending → loader-isolation 静默隔离 →
// 该插件注册的 `/sidebar/*`、`/basics/*` 路由一条都不挂 → 请求落进
// dsh-host-frontend-static 的 SPA 兜底（只认 GET/HEAD）→ POST 得到**空体 405**。
// 界面症状就是「文件—资源管理器查看不了文件，提示 HTTP 405」，而 boot 五步全 OK、
// 内核进程照常 listen、stderr 零 `failed to load` —— 静态面与开机面都不作证。
//
// 口径：
//   • 判据源全部取自 node_modules 实文件（不硬编码服务名清单）；
//   • 只判宿主半边（package.json `exports['.']` / `main` 解析到的入口），
//     客户端半边的 `remote.<ns>` 与打包器注入的 `inject:` 对象形不在本判据面内
//     —— 前者由 unit-plugin-module-table 的 dsh.client 维度守，后者是包名不是服务名；
//   • 内置插件之间互为提供者也算合法（同批交付），故提供集 = 内核闭包 ∪ 全部内置件。

const fs = require('node:fs');
const path = require('node:path');

/** 服务名形态：字母/数字/下划线/连字符（cordis 服务 id 实测全为此形）。 */
const SERVICE_NAME = '[A-Za-z][\\w$-]*';

const PROVIDE_PATTERNS = [
  // class extends Service { constructor(ctx){ super(ctx, "connection") } }
  new RegExp(`super\\(\\s*[\\w$]+\\s*,\\s*["'](${SERVICE_NAME})["']`, 'g'),
  // ctx.provide("webApp", value)
  new RegExp(`\\.provide\\(\\s*["'](${SERVICE_NAME})["']`, 'g'),
];
const PROVIDE_IDENT = new RegExp(`\\.provide\\(\\s*([\\w$]+)\\s*[,)]`, 'g');
const CONST_LITERAL = /\b(?:const|let|var)\s+([\w$]+)\s*=\s*["']([^"']+)["']/g;

/** 顶层 `const inject = [...]`（允许 `export`、允许跨行、允许尾随逗号）。 */
const HOST_INJECT = new RegExp(`^(?:export\\s+)?const\\s+inject\\s*=\\s*\\[([^\\]]*)\\]`, 'gm');
const STRING_ITEM = /["']([^"']+)["']/g;

function* walkJs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkJs(full);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) yield full;
  }
}

/**
 * 收集一片安装树里「被提供的服务名」。
 * @param {string[]} rootDirs - 绝对目录（内核家族 + 内置插件资产根）。
 * @returns {Set<string>} 服务名全集
 */
function collectProvidedServices(rootDirs) {
  const names = new Set();
  for (const root of rootDirs) {
    for (const file of walkJs(root)) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes('provide') && !text.includes('super(')) continue;
      for (const pattern of PROVIDE_PATTERNS) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(text))) names.add(m[1]);
      }
      // 常量间接：`const WEB_RUNTIME_SERVICE = "webRuntime"` + `ctx.provide(WEB_RUNTIME_SERVICE, …)`
      // —— rc.2 的 dsh-web-app 正是这个形状，漏了就会把在位服务误判成下线。
      const consts = new Map();
      CONST_LITERAL.lastIndex = 0;
      let c;
      while ((c = CONST_LITERAL.exec(text))) consts.set(c[1], c[2]);
      if (consts.size === 0) continue;
      PROVIDE_IDENT.lastIndex = 0;
      let p;
      while ((p = PROVIDE_IDENT.exec(text))) {
        const literal = consts.get(p[1]);
        if (literal) names.add(literal);
      }
    }
  }
  return names;
}

/**
 * 抽出一个入口文件里宿主半边声明的服务依赖。
 * @param {string} text - 文件正文。
 * @returns {string[]} 服务名（按声明序，去重）
 */
function extractHostInjectNames(text) {
  // 2026-11-12（0.2.2-rc.2 换代实测）：先抹掉模板字符串正文，再做行锚匹配。
  // 反例：`dsh-super-injector/lib/index.js` 是个「生成器」插件——它写给用户的脚手架
  // 模板里带着 `export const inject = ['slots']` 这一行，且顶格出现，于是被判据当成
  // 它自己的宿主 inject；rc.1 内核恰好提供 slots 所以一直假绿，rc.2 不再提供才暴露。
  // 抹模板时保留换行，行锚语义不变；真声明在模板之外，不受影响。
  const code = blankTemplateLiterals(text);
  const names = [];
  HOST_INJECT.lastIndex = 0;
  let m;
  while ((m = HOST_INJECT.exec(code))) {
    STRING_ITEM.lastIndex = 0;
    let item;
    while ((item = STRING_ITEM.exec(m[1]))) {
      if (!names.includes(item[1])) names.push(item[1]);
    }
  }
  return names;
}

/** 把模板字符串正文替换成空格（保留换行），用于消除「模板里顶格的假声明」。 */
function blankTemplateLiterals(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== '`') {
      out += ch;
      i += 1;
      continue;
    }
    // 进入模板：抹到未转义的收尾反引号为止（不处理 ${} 嵌套——本判据只需要行锚位）。
    out += '`';
    i += 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        out += text[i + 1] === '\n' ? '\n' : ' ';
        i += 2;
        continue;
      }
      if (c === '`') {
        out += '`';
        i += 1;
        break;
      }
      out += c === '\n' ? '\n' : ' ';
      i += 1;
    }
  }
  return out;
}

/**
 * 解析一个插件目录「实际被挂载」的宿主入口文件。
 * @param {string} pluginDir - 插件目录绝对路径。
 * @returns {{file: string|null, reason: string}} 入口绝对路径与判据说明
 */
function resolveHostEntry(pluginDir) {
  const pkgPath = path.join(pluginDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { file: null, reason: '无 package.json' };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (error) {
    return { file: null, reason: `package.json 不可解析：${error.message}` };
  }
  const candidates = [];
  const root = pkg.exports && pkg.exports['.'];
  if (typeof root === 'string') candidates.push(root);
  else if (root && typeof root === 'object') {
    for (const key of ['default', 'import', 'require', 'types']) {
      if (typeof root[key] === 'string') candidates.push(root[key]);
    }
    if (root.default && typeof root.default === 'object') {
      for (const key of ['default', 'import', 'require']) {
        if (typeof root.default[key] === 'string') candidates.push(root.default[key]);
      }
    }
  }
  if (typeof pkg.main === 'string') candidates.push(pkg.main);
  for (const candidate of candidates) {
    const rel = candidate.replace(/^\.\//, '');
    const abs = path.join(pluginDir, rel);
    if (fs.existsSync(abs)) return { file: abs, reason: `入口 ${candidate}` };
  }
  return { file: null, reason: `声明的入口都不在盘上（候选 ${candidates.join(', ') || '无'}）` };
}

/**
 * 对整个内置插件舰队做 inject 可解析性审计。
 * @param {object} input
 * @param {string[]} input.pluginDirs - 插件目录绝对路径
 * @param {Set<string>} input.provided - 内核闭包提供的服务名
 * @param {string[]} [input.removedIds] - kernel-pin.services.removed 的 id（二次确认）
 * @returns {{rows: object[], violations: object[]}}
 */
function auditInjectServices({ pluginDirs, provided, removedIds = [] }) {
  const removed = new Set(removedIds);
  const rows = [];
  const violations = [];
  for (const dir of pluginDirs) {
    const name = path.basename(dir);
    const { file, reason } = resolveHostEntry(dir);
    if (!file) {
      violations.push({ plugin: name, kind: 'entry-missing', detail: reason });
      rows.push({ plugin: name, entry: null, names: [] });
      continue;
    }
    const names = extractHostInjectNames(fs.readFileSync(file, 'utf8'));
    rows.push({ plugin: name, entry: file, names });
    for (const service of names) {
      if (provided.has(service)) continue;
      violations.push({
        plugin: name,
        kind: removed.has(service) ? 'removed-service' : 'unknown-service',
        detail: `inject 声明了服务 "${service}"，但它不在 pin 内核的提供集里`
          + `（${removed.has(service) ? 'kernel-pin.services.removed 已登记此 id' : '判据按实文件扫出提供面'}）`
          + ` —— fiber 会永久 pending 被静默隔离，该插件注册的 HTTP 路由一条都不挂`,
      });
    }
  }
  return { rows, violations };
}

module.exports = {
  collectProvidedServices,
  extractHostInjectNames,
  resolveHostEntry,
  auditInjectServices,
};
