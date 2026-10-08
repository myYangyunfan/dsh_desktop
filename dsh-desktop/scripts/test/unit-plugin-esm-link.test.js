'use strict';

// 插件具名导入 ↔ 内核实际导出 的离线链接检查（node --test）。
//
// 为什么需要这条守卫：0.1.5-rc.1 换代中，dsh-prompt-custom 因上游把 PERSONA_SECTION
// 拆成 PERSONA_PREFIX_SECTION / PERSONA_SUFFIX_SECTION 而整册加载失败 —— ESM 具名导出
// 缺失是链接期 SyntaxError，被我们的 loader-isolation 补丁隔离成非致命后，症状只是
// 「自定义提示词不生效」。既有守卫都抓不到：
//   · diag-validate   只校验 dsh.bundle.patch 声明与补丁文件在位，不执行 import；
//   · G1（DOM 契约）  只看 CSS 类与 data-* 锚；
//   · 服务器 boot 冒烟 只覆盖 cordis bundle 半边，走 dsh.client 的插件要进浏览器才暴露。
// 这里把「具名导出是否存在」离线跑一遍，覆盖 cordis bundle 与 client 两半的全部运行时 JS。
//
// 判据边界：只判 `import { A } from '@deepseek-ai/*' | 'cordis*' | '.'`；解析不到目标
// 模块的（可选依赖、宿主外包）计入 unresolved 但不判失败，避免把「本机没装」误报成「内核改了」。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(DSH, 'assets', 'plugins');
const HOST_NM = path.join(DSH, 'node_modules');

// 插件自带打包产物（gui/ 与 bundles/ 是其构建输出，不参与宿主链接）。
const SKIP_FILE = /(\\|\/)gui(\\|\/)|bundles(\\|\/)|\.min\.js$/;

function readIf(p) {
  try { return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
}

/** 解析 specifier 到实际文件：沿 fromFile 向上逐层找 node_modules（ESM 就近语义），
 *  全部落空后才以宿主 node_modules 兜底。
 *  注意不能每层都顺带试宿主树 —— 那样第一轮就命中宿主副本，插件自带旧副本这条路径
 *  永远不会被解析（SHAPE 档因此空转，已用负向对照实测出来）。 */
function resolveSpec(spec, fromFile) {
  if (spec.startsWith('.')) {
    const base = path.resolve(path.dirname(fromFile), spec);
    for (const c of [base, base + '.js', base + '.mjs', base + '.cjs', path.join(base, 'index.js')]) {
      const t = readIf(c);
      if (t !== null) return { file: c, text: t };
    }
    return null;
  }
  const tryAt = (root) => {
    const pkgDir = path.join(root, ...spec.split('/'));
    const pj = readIf(path.join(pkgDir, 'package.json'));
    if (pj !== null) {
      let main = 'index.js';
      try {
        const j = JSON.parse(pj);
        if (typeof j.main === 'string') main = j.main;
      } catch { /* 保持默认 */ }
      const f = path.join(pkgDir, main);
      const t = readIf(f) ?? readIf(f + '.js') ?? readIf(path.join(pkgDir, 'index.js'));
      if (t !== null) return { file: f, text: t };
    }
    for (const ext of ['.js', '.mjs', '']) {
      const t = readIf(pkgDir + ext);
      if (t !== null) return { file: pkgDir + ext, text: t };
    }
    return null;
  };
  let dir = path.dirname(fromFile);
  while (dir.length > 3) {
    const hit = tryAt(path.join(dir, 'node_modules'));
    if (hit) return hit;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return tryAt(HOST_NM);
}

const exportCache = new Map();
/** 汇总模块导出名；`export * from` 递归跟进，seen 防环。 */
function exportsOf(file, text, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const names = new Set();
  if (/export\s+default/.test(text)) names.add('default');
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (!t || t === 'default') continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/export\s*\*(?:\s+as\s+[A-Za-z_$][\w$]*)?\s+from\s*['"]([^'"]+)['"]/g)) {
    const r = resolveSpec(m[1], file);
    if (r) for (const n of exportsOf(r.file, r.text, seen)) names.add(n);
  }
  exportCache.set(file, names);
  return names;
}

function pluginFiles(plugin) {
  const root = path.join(PLUGINS, plugin);
  const out = [];
  (function walk(d) {
    let es;
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (/\.js$/.test(e.name) && !SKIP_FILE.test(p)) out.push(p);
    }
  })(root);
  return out;
}

function scan() {
  const missing = [];
  let plugins = 0, named = 0, unresolved = 0;
  for (const plugin of fs.readdirSync(PLUGINS).sort()) {
    let st;
    try { st = fs.statSync(path.join(PLUGINS, plugin)); } catch { continue; }
    if (!st.isDirectory()) continue;
    const files = pluginFiles(plugin);
    if (!files.length) continue;
    plugins++;
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/import\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
        const spec = m[2];
        if (!spec.startsWith('@deepseek-ai/') && !spec.startsWith('cordis') && !spec.startsWith('.')) continue;
        const target = resolveSpec(spec, file);
        if (!target) { unresolved++; continue; }
        const exp = exportsOf(target.file, target.text);
        for (const piece of m[1].split(',')) {
          const t = piece.trim();
          if (!t) continue;
          const orig = t.split(/\s+as\s+/)[0].trim();
          named++;
          if (!exp.has(orig)) {
            missing.push(`${plugin}/${path.relative(PLUGINS, file).replace(/\\/g, '/')}  `
              + `import { ${orig} } from "${spec}" → ${path.relative(DSH, target.file).replace(/\\/g, '/')} 未导出该名`);
          }
        }
      }
    }
  }
  return { plugins, named, unresolved, missing };
}

test('插件具名导入必须都被内核实际导出（离线 ESM 链接，防换代静默断链）', () => {
  const r = scan();
  // 判据自检（不先证这个，「全绿」只可能是什么都没扫到）。
  // 下限 22 = 在册 28 的约 8 成（2026-10 批量退役 11 条后从 39→28；原阈值 30 同比例下调）。
  // 这是「扫描器没脱靶」的覆盖哨兵而非清单锁——精确对账由 unit-hub-registry /
  // unit-composition-integrity 负责，这里只保证本守卫真的扫到了插件群。
  assert.ok(r.plugins >= 22, `只扫到 ${r.plugins} 册插件，覆盖面已脱靶`);
  // 下限 100（2026-10 实测 128）：随插件群 39→28 同比例下调，原阈值 150 已不可能达到。
  assert.ok(r.named >= 100, `只核到 ${r.named} 处具名导入，采集已脱靶`);
  assert.equal(r.unresolved, 0, `有 ${r.unresolved} 处 specifier 解析不到模块，判据已失效`);
  // 两个方向的控制组：真被 rc.1 移除的名字必须判「缺失」，仍在位的必须判「在场」。
  const sp = resolveSpec('@deepseek-ai/dsh-system-prompt', path.join(DSH, 'scripts', 'x.js'));
  assert.ok(sp, '控制组失败：dsh-system-prompt 解析不到');
  const exp = exportsOf(sp.file, sp.text);
  assert.equal(exp.has('PERSONA_SECTION'), false, '控制组失败：rc.1 已移除的 PERSONA_SECTION 被判在场');
  assert.equal(exp.has('PERSONA_PREFIX_SECTION'), true, '控制组失败：rc.1 在位的 PERSONA_PREFIX_SECTION 被判不在场');
  assert.equal(exp.has('renderPrompt'), true, '控制组失败：renderPrompt 被判不在场');
  // 反向捕获力：把某个真在用的名字换成移除过的旧名，必须报红（否则本守卫是空转的）。
  assert.ok(
    !r.missing.some((x) => /PERSONA_SECTION/.test(x)),
    '本插件集里不应再有 PERSONA_SECTION 残留引用（dsh-prompt-custom 已在 0.6.4 迁走）',
  );

  assert.deepEqual(r.missing, [], '存在加载即 SyntaxError 的断链导入：\n  ' + r.missing.join('\n  '));
});

// ---- 内嵌内核包副本的版本平价 ---------------------------------------------
// 上一条守卫只回答「import 的名字存不存在」，且按 ESM 就近语义解析到插件自带副本，
// 因此照不到更隐蔽的一类：插件自带一份**旧**内核包并拿它对上新宿主。
// 0.6.4 实测：dsh-hub 自带 dsh-typert-protocol@0.1.0-rc.6，而宿主已 rc.1 —— 两代协议
// 导出面已分叉（rc.1 移除 TypertLookupFailure、新增 RemoteError / remoteErrorOf），
// 其 lib/index.js 实际 import 的正是这份旧副本。
//
// 判据分两档，避免「版本落后但形状兼容」被误判成断链（那会让守卫常红、失去意义）：
//   · STRICT —— 线协议契约：内嵌副本版本必须等于 kernel-pin。dsh-hub 的 typert-protocol
//     正是此类，rc.6 与 rc.1 的导出面已实际分叉。
//   · SHAPE —— 工具契约：允许版本落后，但导出名集合必须与宿主同名包**全等**。
// 不做全量强制：全量比导出面会把一堆实际兼容的包一律判红，噪声淹掉真信号。
// 新增跨界副本时必须在此登记并选档。
//
// 两档当前均为空，都是「登记项必须真实存在」这条防腐判据的直接后果——盯着空气的守卫
// 不是守卫，它只在装过依赖的开发机上偶然为真：
//   · SHAPE（2026-10-05 撤销）：原条目是 better-sidebar 内嵌 @deepseek-ai/dsh-tools，
//     那份副本**从未入库**——better-sidebar 把整套 dsh-* 列在 peerDependencies（由宿主
//     供给），且它不在 companion-plugins.js 的 shipsNodeModules 名单内，伴随同步与
//     stage-payload 两条路都不会带上任何 node_modules。
//   · STRICT（2026-10 随 dsh-hub 批量退役撤销）：dsh-hub 目录已从 assets/plugins 移除，
//     那份 rc.6 副本随之消失。2026-10 实测在册 28 插件里只剩 dsh-pocket 带
//     node_modules（billion-context-dsh 0.2.26 起把 acp-kernel 内联进 dist，内层副本与
//     shipsNodeModules 标记同批下线），且 dsh-pocket 内只有 cordis / cosmokit 两个纯第三方
//     作用域，没有任何 @deepseek-ai/* 跨界副本可比。
// 结论：本档目前是**待命中**而非废弃——一旦有插件重新内嵌 @deepseek-ai/* 包，就在这里
// 登记并选档；下面的 pin 形态自检仍保证判据本身没坏。
const PROTOCOL_PARITY_STRICT = [];
const PROTOCOL_PARITY_SHAPE = [];

function nestedPkgPath(plugin, pkg) {
	return path.join(PLUGINS, plugin, 'node_modules', ...pkg.split('/'));
}

test('插件内嵌的跨界内核包副本：协议类须等于 pin，工具类须与宿主导出面全等', () => {
	const pin = JSON.parse(
		fs.readFileSync(path.join(DSH, 'scripts', 'compat', 'kernel-pin.json'), 'utf8'),
	).kernel.packageVersion;
	assert.ok(/^\d+\.\d+\.\d+/.test(String(pin)), 'kernel-pin 的 packageVersion 形态异常：' + pin);

	const bad = [];
	for (const { plugin, pkg } of PROTOCOL_PARITY_STRICT) {
		const dir = nestedPkgPath(plugin, pkg);
		const pj = readIf(path.join(dir, 'package.json'));
		// 清单防腐：登记的内嵌副本必须真实存在，否则这条检查只是在盯着空气。
		assert.ok(pj !== null, `watchlist 登记的内嵌副本不存在：${plugin}/node_modules/${pkg}`);
		const v = JSON.parse(pj).version;
		if (v !== pin) bad.push(`${plugin} 内嵌 ${pkg} = ${v}，宿主 pin = ${pin} → 旧协议对新宿主`);
	}
	for (const { plugin, pkg } of PROTOCOL_PARITY_SHAPE) {
		const dir = nestedPkgPath(plugin, pkg);
		const pj = readIf(path.join(dir, 'package.json'));
		assert.ok(pj !== null, `watchlist 登记的内嵌副本不存在：${plugin}/node_modules/${pkg}`);
		const hostEntry = resolveSpec(pkg, path.join(DSH, 'scripts', 'x.js'));
		assert.ok(hostEntry, `宿主侧找不到 ${pkg}，形状比对无从进行`);
		const nestedEntry = resolveSpec(pkg, path.join(dir, 'placeholder.js'));
		assert.ok(nestedEntry, `内嵌 ${pkg} 无可解析入口，形状比对无从进行`);
		const a = [...exportsOf(nestedEntry.file, nestedEntry.text)].sort();
		const b = [...exportsOf(hostEntry.file, hostEntry.text)].sort();
		const lost = a.filter((x) => !b.includes(x));
		const gained = b.filter((x) => !a.includes(x));
		if (lost.length || gained.length) {
			bad.push(`${plugin} 内嵌 ${pkg} 与宿主导出面已分叉：内嵌独有 [${lost.join(',')}] / 宿主独有 [${gained.join(',')}]`
				+ `（内嵌 ${JSON.parse(pj).version} vs 宿主 ${pin}）`);
		}
	}
	assert.deepEqual(bad, [], '内嵌跨界副本已与新宿主不匹配：\n  ' + bad.join('\n  '));
});
