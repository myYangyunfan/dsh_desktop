'use strict';
// dsh-quest-ui 配套插件单元测试（纲要 §8.1）：
//   T1 partitionItems：一期恒把所有下标归入 quests；空数组返回两个空数组；
//   T2 fingerprint：相同结构摘要输出相同字符串；自有节点存在位翻转时输出变化；
//   T3 CSS 作用域扫描：主题 CSS 每个选择器以 body[data-dsh-quest-ui] 开头；
//   T3a 切分器自身回归：顶层逗号才切，:has()/:is() 括号内逗号不得切；
//   T4 源码体积：client.js + index.js + package.json 合计 ≤ 60KB（P6）；
//   T5 companion 登记：COMPANION_PLUGINS 存在 quest-ui 条目。
// 评估方式照 verify-balance-dock.cjs：vm + 最小 window stub，评估 client.js
// 源码即可拿到 window.__dshQuestUiCore（纯逻辑在 factory 外挂载）。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pluginDir = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-quest-ui');
const clientSrc = fs.readFileSync(path.join(pluginDir, 'lib', 'client.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(pluginDir, 'lib', 'index.js'), 'utf8');
const pkgSrc = fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8');

// ---------- 评估 client.js：捕获 __ModuleLoader__.load，取 __dshQuestUiCore ----------
const loads = [];
const sandboxWindow = { __ModuleLoader__: { load: (obj) => { loads.push(obj); } } };
sandboxWindow.window = sandboxWindow;
const sandbox = { window: sandboxWindow, console };
vm.createContext(sandbox);
vm.runInContext(clientSrc, sandbox, { filename: 'client.js' });

const core = sandboxWindow.__dshQuestUiCore;
test('setup: __dshQuestUiCore 已挂载且模块结构完整', () => {
	assert.ok(core, 'window.__dshQuestUiCore 未挂载');
	assert.equal(typeof core.partitionItems, 'function', 'partitionItems 导出');
	assert.equal(typeof core.fingerprint, 'function', 'fingerprint 导出');
	assert.equal(typeof core.readWorkspaceMeta, 'function', 'readWorkspaceMeta 导出');
	assert.equal(loads.length, 1, '恰好注册一个模块');
	assert.equal(loads[0].id, '@deepseek-ai/dsh-quest-ui', '模块 id 正确');
	assert.equal(typeof loads[0].factory, 'function', 'factory 可调用');
});

// ---------- T1：partitionItems ----------
test('T1 partitionItems：一期全部下标归入 quests，空数组返回两个空数组', () => {
	// 注：core 在 vm 沙箱 realm 内构造对象，原型与主 realm 不同，
	// deepStrictEqual 会因跨 realm 原型比较失败，故用宽松 deepEqual。
	assert.deepEqual(core.partitionItems(['模型调优', '写周报', '重构侧栏']), { quests: [0, 1, 2], chats: [] });
	assert.deepEqual(core.partitionItems(['唯一会话']), { quests: [0], chats: [] });
	assert.deepEqual(core.partitionItems([]), { quests: [], chats: [] });
	// 一期即使传入关键词也不分组（二期预留，签名向后兼容）
	assert.deepEqual(core.partitionItems(['模型', '日常'], ['模型']), { quests: [0, 1], chats: [] });
});

// ---------- T2：fingerprint ----------
test('T2 fingerprint：相同摘要同串，自有节点存在位翻转变串', () => {
	const s1 = { sessionCount: 3, headPresent: false, pillsPresent: false, conversationReady: true };
	const s2 = { sessionCount: 3, headPresent: false, pillsPresent: false, conversationReady: true };
	assert.strictEqual(core.fingerprint(s1), core.fingerprint(s2), '相同结构摘要输出相同字符串');
	// 分组头存在位翻转（React 重渲染抹掉分组头）→ 指纹必须变化以触发重放
	assert.notStrictEqual(core.fingerprint(s1), core.fingerprint(Object.assign({}, s1, { headPresent: true })), 'headPresent 翻转指纹变化');
	// 药丸存在位翻转 → 变化
	assert.notStrictEqual(core.fingerprint(s1), core.fingerprint(Object.assign({}, s1, { pillsPresent: true })), 'pillsPresent 翻转指纹变化');
	// 会话行数量变化 → 变化
	assert.notStrictEqual(core.fingerprint(s1), core.fingerprint(Object.assign({}, s1, { sessionCount: 4 })), '行数变化指纹变化');
	assert.strictEqual(core.fingerprint(null), '', '空摘要返回空串');
});

test('附：二期预留接口一期恒 null / 分组文案常量', () => {
	assert.strictEqual(core.readWorkspaceMeta(), null, 'readWorkspaceMeta 一期恒 null');
	assert.deepEqual(core.GROUP_LABELS, { quests: 'Quests', chats: '会话' });
	assert.deepEqual(core.PILL_TEXTS, ['运行于 dsh', 'Quest 模式']);
});

// ---------- T3：CSS 作用域扫描 ----------
/** 按「顶层逗号」切选择器组。括号内的逗号属于函数型选择器
 *  （:has() / :not() / :is() / :where()）的选择器列表，不是并列选择器的
 *  分隔符：朴素 split(',') 会把 :has(textarea, [data-composer-input]) 误切成
 *  两段，把合法的整作主题域内的规则报成越界。 */
function splitTopLevelSelectors(selector) {
	const parts = [];
	let depth = 0;
	let cur = '';
	for (const ch of selector) {
		if (ch === '(') depth += 1;
		else if (ch === ')') depth -= 1;
		if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
		cur += ch;
	}
	parts.push(cur);
	return parts.map((p) => p.trim()).filter((p) => p !== '');
}

test('T3a 选择器切分：顶层逗号才切，括号内逗号不切', () => {
	assert.deepEqual(
		splitTopLevelSelectors('body[data-dsh-quest-ui] a:has(textarea, [data-composer-input])'),
		['body[data-dsh-quest-ui] a:has(textarea, [data-composer-input])'],
		':has() 内的列表不得被切开'
	);
	assert.deepEqual(
		splitTopLevelSelectors('body[data-dsh-quest-ui] a,body[data-dsh-quest-ui] b{'),
		['body[data-dsh-quest-ui] a', 'body[data-dsh-quest-ui] b{'],
		'顶层逗号应切开'
	);
	assert.deepEqual(
		splitTopLevelSelectors('body[x] :is(a, b),body[x] c:where(p, q),body[x] d'),
		['body[x] :is(a, b)', 'body[x] c:where(p, q)', 'body[x] d'],
		'混合形态'
	);
});

test('T3 主题 CSS：每条选择器以 body[data-dsh-quest-ui] 开头', () => {
	const m = clientSrc.match(/const CSS = \[([\s\S]*?)\]\.join\(""\)/);
	assert.ok(m, 'client.js 中应存在 const CSS = [...].join("") 主题常量');
	const literals = m[1].match(/'[^']*'/g) || [];
	assert.ok(literals.length >= 10, '主题 CSS 规则数量异常: ' + literals.length);
	for (const raw of literals) {
		const rule = raw.slice(1, -1);
		const brace = rule.indexOf('{');
		assert.ok(brace > 0, '规则缺少选择器: ' + rule);
		const selector = rule.slice(0, brace).trim();
		// @keyframes 除外（本插件未使用，防御性保留该例外）
		if (selector.startsWith('@keyframes')) continue;
		// 逗号并列的复合选择器逐段检查（::-webkit-scrollbar 伪元素规则的
		// 前缀变体同样以 body[data-dsh-quest-ui] 开头，主断言直接覆盖）。
		// 只切顶层逗号：:has(textarea, [data-composer-input]) 里的逗号属于
		// 函数型选择器的列表，朴素 split(',') 会把它误报成越界。
		for (const part of splitTopLevelSelectors(selector)) {
			assert.ok(
				part.trim().startsWith('body[data-dsh-quest-ui]'),
				'选择器未以 body[data-dsh-quest-ui] 开头: ' + part
			);
		}
	}
});

// ---------- T4：体积上限 ----------
test('T4 体积：三文件合计 ≤ 60KB（P6）', () => {
	const total = Buffer.byteLength(clientSrc, 'utf8') + Buffer.byteLength(indexSrc, 'utf8') + Buffer.byteLength(pkgSrc, 'utf8');
	assert.ok(total <= 60 * 1024, '合计 ' + total + ' 字节超出 60KB 上限');
});

// ---------- T5：companion 登记检查 ----------
test('T5 companion 登记：COMPANION_PLUGINS 含 quest-ui 条目', () => {
	const companionSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'companion-plugins.js'), 'utf8');
	assert.ok(
		/\{\s*id:\s*'quest-ui'\s*,\s*name:\s*'@deepseek-ai\/dsh-quest-ui'\s*,?\s*\}/.test(companionSrc),
		'COMPANION_PLUGINS 缺少 { id: \'quest-ui\', name: \'@deepseek-ai/dsh-quest-ui\' }'
	);
});
