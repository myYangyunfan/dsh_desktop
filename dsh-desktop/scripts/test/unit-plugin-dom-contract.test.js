'use strict';
// 插件 DOM/CSS 契约新鲜度守卫（node --test）。
//
// 背景：内核换代（composer 由 <textarea> 换成 Lexical contenteditable、聊天行改锚
// [data-chat-flow-kind]、CSS Module 哈希类随重打包全变、若干 data-* 属性被删除）
// 会让插件的 DOM 锚点「静默」失效——守卫早退、选择器命中 0，表现为「功能在，按了
// 没反应」，既不报错也不进日志。本文件把这类失效变成会自动红的测试：
//   G1 死锚登记表：代码里出现「换代后命中 0」的锚点，所在文件必须带 dsh-compat: 标记
//      （证明是刻意的两代兼容/降级，而不是忘了改）；
//   G2 旧行锚 [data-time-hover-root] 不得是唯一命中路径：同行并代新行锚，或紧邻处有
//      显式回退（|| / ??）；
//   G3 composer 并代：:has(textarea) 不得单代出现；kind="assistant" 必须与 assistant-step 并列；
//   G4 已修形态在场：navbar / tweaks / quest-ui / session-manager / input-fold 的两代锚逐个点名；
//   G5-G7 tweaks 标记扫描行为：新内核 DOM 早退不打标记、旧内核仍正确标记每轮总结、
//      开关关闭时只清标记；
//   G8 覆盖面锁：插件客户端入口以 package.json exports['./client'] 为权威，不再靠
//      「有没有 lib/ 目录」猜（上一版因此让 dsh-offpeak / dsh-synapse 整半逃检）；
//   G9 类名新鲜度：[class*="X"] 的局部名必须仍在内核 CSS/JS 里在场，否则逐条登记为惰性；
//   G10 槽位 props 契约：组件只能读它注册的那个槽确实下发的 props（权威 = runner 里
//      构建期生成的 CLIENT_SLOT_API）。
// 实机取证（v0.6.2 打包时同步，127.0.0.1:61231）：哈希类 .Md3f7G_flowItem/.QWLzlG_root/
// .Sxvs8a_root/._markdown_1nba0_5 命中各 0；[data-time-hover-root]、[data-pending-steering]
// 命中 0；[data-turn-tail] 作为属性只剩 1 个内嵌元素（行上不再有轮号）；行类为
// _RXqYG_flowItem；[data-chat-flow-kind] 值域实测 8 类（system-prompt/user/context/
// turn-error/turn-tail/turn-process/assistant-step/tool-call），无 assistant / tool-result；
// user 行内仍保留 class 词元 userRow / userStack / bubble（哈希前缀会变、局部名不变）；
// composer 为 div.fbHfZa_input[data-composer-input][data-lexical-editor]，占位符是独立元素
// [data-composer-placeholder]，[data-input-scroll] 内 textarea=0、contenteditable=1。
//
// 本守卫看不到什么（别把它当保险箱）：它只能证明「死锚的使用处有登记、有回退」，
// 不能证明选择器在真实页面上命中——那要靠 profile 热替换 + 实机探针。新增锚点时
// 两件事一起做：改插件 + 在本文件登记/点名。G10 同理：动态 inject 的额外 props 无法
// 静态枚举，那些注册点只会落 INCONCLUSIVE（既不判红也不算通过），不拿它当「已审」。
// 用法：node --test scripts/test/unit-plugin-dom-contract.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGINS = path.join(__dirname, '..', '..', 'assets', 'plugins');

// ---------------------------------------------------------------------------
// 死锚登记表：换代后实机命中 0 的锚点
// ---------------------------------------------------------------------------
const DEAD_ANCHORS = [
	'.Md3f7G_flowItem',
	'.QWLzlG_root',
	'.Sxvs8a_root',
	'.Sxvs8a_body',
	'._markdown_1nba0_5',
	'[data-time-hover-root]',
	'[data-pending-steering]',
	'[data-turn-tail]',
	'[class*="suggestion"]',
	'[class*="Suggestion"]'
];
const COMPAT_MARK = 'dsh-compat:';

/** 客户端入口以 package.json 的 exports['./client'] 为权威（字符串或条件导出对象）。 */
function manifestClientFile(plugin) {
	const pj = path.join(PLUGINS, plugin, 'package.json');
	if (!fs.existsSync(pj)) return null;
	let pkg;
	try { pkg = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { return null; }
	const raw = pkg && pkg.exports ? pkg.exports['./client'] : undefined;
	const rel = typeof raw === 'string' ? raw
		: (raw && typeof raw === 'object'
			? (raw.browser || raw.default || raw.import || raw.require)
			: null);
	if (typeof rel !== 'string' || !rel.startsWith('./')) return null;
	const abs = path.join(PLUGINS, plugin, rel.slice(2));
	return fs.existsSync(abs) ? abs : null;
}

/** 该插件是否声明了自己有客户端半边（dsh.client）。 */
function hasClientDecl(plugin) {
	const pj = path.join(PLUGINS, plugin, 'package.json');
	try {
		const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
		return !!(pkg.dsh && pkg.dsh.client);
	} catch { return false; }
}

// 早先只看 <plugin>/lib/*.js：dsh-offpeak 的入口在 client/client.js、dsh-synapse 在
// ./client.js，两者整半躲过 G1-G7。offpeak 的 composer 换代漂移因此在野无人报红
// —— 这是真漏报（守卫看不到 ≠ 没坏），不是假阳性。现按「lib/*.js ∪ 清单入口」取并集。
const libFilesOf = (plugin) => {
	const lib = path.join(PLUGINS, plugin, 'lib');
	const files = fs.existsSync(lib)
		? fs.readdirSync(lib).filter((f) => /\.js$/.test(f)).map((f) => path.join(lib, f))
		: [];
	const entry = manifestClientFile(plugin);
	if (entry !== null && !files.includes(entry)) files.push(entry);
	return files.length ? files : null;
};

/** 剔除注释后的代码行。块注释按状态机整段跳过——上一版只剔以 * 开头的行，
 *  「/* 注释」续行里缩进的正文漏网，把注释里的说明性锚点当成代码引用误报。 */
function codeLinesOf(file) {
	const text = fs.readFileSync(file, 'utf8');
	const out = [];
	let inBlock = false;
	text.split(/\r?\n/).forEach((line, i) => {
		const t = line.trim();
		if (inBlock) {
			if (t.includes('*/')) inBlock = false;
			return;
		}
		if (t === '' || t.startsWith('//')) return;
		if (t.startsWith('/*')) {
			if (!t.includes('*/')) inBlock = true;
			return;
		}
		out.push({ line: i + 1, text: t });
	});
	return out;
}

/** 插件 → [{ file, base, code: 代码行, raw: 全文 }]（标记允许写在注释里）。 */
function sourcesOf(plugin) {
	const files = libFilesOf(plugin);
	if (files === null) return [];
	return files.map((f) => ({
		file: f,
		base: path.basename(f),
		code: codeLinesOf(f),
		raw: fs.readFileSync(f, 'utf8')
	}));
}

const allPlugins = fs.readdirSync(PLUGINS).filter((d) => {
	try { if (!fs.statSync(path.join(PLUGINS, d)).isDirectory()) return false; } catch { return false; }
	return hasClientDecl(d) || fs.existsSync(path.join(PLUGINS, d, 'lib'));
});

test('G1 死锚必须带 dsh-compat 标记（防止“忘了改”冒充“刻意兼容”）', () => {
	const offenders = [];
	let checked = 0;
	for (const plugin of allPlugins) {
		for (const src of sourcesOf(plugin)) {
			const code = src.code.map((l) => l.text).join('\n');
			for (const anchor of DEAD_ANCHORS) {
				if (!code.includes(anchor)) continue;
				checked += 1;
				if (!src.raw.includes(COMPAT_MARK)) {
					offenders.push(plugin + '/' + src.base + ' 引用 ' + anchor + ' 但全文无 ' + COMPAT_MARK + ' 标记');
				}
			}
		}
	}
	assert.ok(checked > 0, '一个死锚引用都没扫到，登记表或扫描路径可能已失效');
	assert.deepEqual(offenders, [], '未标记者：\n' + offenders.join('\n'));
});

test('G2 旧行锚 [data-time-hover-root] 不得作为唯一命中路径', () => {
	const bad = [];
	for (const plugin of allPlugins) {
		for (const src of sourcesOf(plugin)) {
			const lines = src.code;
			lines.forEach((l, idx) => {
				if (!l.text.includes('[data-time-hover-root]')) return;
				// 跨行表达式（回退链换行书写）按窗口判定：本行 ± 2 行。
				const window = lines.slice(Math.max(0, idx - 2), idx + 3).map((x) => x.text).join('\n');
				const dualGen = window.includes('data-chat-flow-kind');
				const hasFallback = /\|\||\?\?/.test(window);
				if (!dualGen && !hasFallback) bad.push(plugin + '/' + src.base + ':' + l.line + '  ' + l.text.slice(0, 72));
			});
		}
	}
	assert.deepEqual(bad, [], '[data-time-hover-root] 须与 [data-chat-flow-kind] 并代，或有显式回退：\n' + bad.join('\n'));
});

test('G3 composer 与 flow kind 不得单代引用', () => {
	const badHas = [];
	const badKind = [];
	for (const plugin of allPlugins) {
		for (const src of sourcesOf(plugin)) {
			src.code.forEach((l, idx) => {
				// :has(textarea) 单代：Lexical 换代后命中 0，两代写法是
				// :has(textarea, [data-composer-input])
				if (/:has\(textarea\s*\)/.test(l.text)) badHas.push(plugin + '/' + src.base + ':' + l.line);
				// kind="assistant" 已不在值域内，必须与 assistant-step 并列
				if (/\[data-chat-flow-kind="assistant"\]/.test(l.text)) {
					const window = src.code.slice(Math.max(0, idx - 2), idx + 3).map((x) => x.text).join('\n');
					if (!window.includes('assistant-step')) badKind.push(plugin + '/' + src.base + ':' + l.line);
				}
			});
		}
	}
	assert.deepEqual(badHas, [], '存在单代 :has(textarea)：\n' + badHas.join('\n'));
	assert.deepEqual(badKind, [], '存在单代 kind="assistant"：\n' + badKind.join('\n'));
});

// ---------------------------------------------------------------------------
// G4：已修形态必须在场（防止修复被后续提交/上游覆盖悄悄抹掉）
// ---------------------------------------------------------------------------
test('G4 五个插件的两代锚形态逐个点名', () => {
	const srcOf = (p, f) => fs.readFileSync(path.join(PLUGINS, p, 'lib', f), 'utf8');

	const navbar = srcOf('dsh-navbar', 'client.js');
	assert.ok(
		/const ROW_SELECTOR = "\[data-time-hover-root\], \[data-chat-flow-kind\]";/.test(navbar),
		'dsh-navbar 行锚应并代（ROW_SELECTOR）'
	);
	assert.ok(navbar.includes('dsh-compat:row-anchor'), 'dsh-navbar 应保留可 grep 的兼容标记');
	assert.ok(/turnOf/.test(navbar) && /data-chat-turn/.test(navbar), 'dsh-navbar 轮号应走 turnOf（data-chat-turn 优先）');

	const tweaks = srcOf('dsh-conversation-tweaks', 'client.js');
	for (const rule of [
		'body[data-dsh-quiet-output] [data-chat-flow-kind="tool-call"]{display:none!important}',
		'body[data-dsh-quiet-output] [data-chat-flow-kind="turn-process"]{display:none!important}',
		'body[data-dsh-quiet-output] [data-chat-flow-kind][data-turn-process-member]{display:none!important}',
		'body[data-dsh-quiet-output] [data-variant="think"]{display:none!important}'
	]) {
		assert.ok(tweaks.includes(rule), 'dsh-conversation-tweaks 缺少属性契约规则：' + rule);
	}
	assert.ok(tweaks.includes('dsh-compat:quiet-output-attrs'), 'dsh-conversation-tweaks 应保留兼容标记');
	assert.ok(/function legacyQuietDom\(\)/.test(tweaks), 'tweaks 的新/旧内核判定函数应在场（早退依据）');

	const quest = srcOf('dsh-quest-ui', 'client.js');
	assert.ok(quest.includes(':has(textarea, [data-composer-input])'), 'dsh-quest-ui 输入区规则应并代');
	assert.ok(quest.includes('[data-composer-placeholder]'), 'dsh-quest-ui 占位符应认独立元素形态');
	assert.ok(quest.includes('dsh-compat:composer-editable'), 'dsh-quest-ui 应保留兼容标记');

	const sm = srcOf('dsh-session-manager', 'client.js');
	assert.ok(sm.includes('[data-composer-input]'), 'dsh-session-manager 补焦应认 contenteditable composer');
	assert.ok(/function placeCaretAtEnd/.test(sm), 'dsh-session-manager 应有 CE 光标放置分支');

	const fold = srcOf('dsh-input-fold', 'client.js');
	assert.ok(
		fold.includes(`row.querySelector('[class*="userRow"]')`),
		'dsh-input-fold 收起按钮宿主应垫一档 userRow 词元（hover-root 已删）'
	);
	assert.ok(fold.includes('dsh-compat:hover-root-fallback'), 'dsh-input-fold 应保留兼容标记');
});

// ---------------------------------------------------------------------------
// 极小 DOM 桩：够跑 tweaks 的选择器子集
//   支持 tag | .class | [attr] | [attr="v"] | [attr*="v"] | 空格(后代) | >(子) | 逗号列表
// ---------------------------------------------------------------------------
class El {
	constructor(tag) {
		this.tagName = String(tag || 'div').toUpperCase();
		this.children = [];
		this.parentElement = null;
		this.className = '';
		this.attrs = Object.create(null);
		this._text = '';
	}
	get classList() { return String(this.className || '').split(/\s+/).filter(Boolean); }
	setAttribute(k, v) {
		if (k === 'class') this.className = String(v);
		else this.attrs[k] = String(v);
	}
	getAttribute(k) {
		if (k === 'class') return this.className || null;
		return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
	}
	hasAttribute(k) { return this.getAttribute(k) !== null; }
	removeAttribute(k) { delete this.attrs[k]; }
	set textContent(v) { this.children = []; this._text = String(v); }
	get textContent() {
		let out = this._text || '';
		for (const c of this.children) out += c.textContent;
		return out;
	}
	// style 插件用 tag.dataset.pluginCss 落 data-plugin-css 属性
	get dataset() {
		const self = this;
		const toAttr = (key) => 'data-' + String(key).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
		return new Proxy({}, {
			set(_t, key, value) { self.setAttribute(toAttr(key), value); return true; },
			get(_t, key) { return self.getAttribute(toAttr(key)); }
		});
	}
	appendChild(n) {
		if (n.parentElement) n.parentElement.removeChild(n);
		this.children.push(n);
		n.parentElement = this;
		return n;
	}
	removeChild(n) {
		const i = this.children.indexOf(n);
		if (i >= 0) this.children.splice(i, 1);
		n.parentElement = null;
		return n;
	}
	matches(sel) { return matchSelector(this, sel); }
	querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
	querySelectorAll(sel) {
		const out = [];
		const walk = (e) => {
			for (const c of e.children) {
				if (c instanceof El) {
					if (matchSelector(c, sel)) out.push(c);
					walk(c);
				}
			}
		};
		walk(this);
		return out;
	}
}

function matchSelector(el, sel) {
	return splitTopLevel(String(sel), ',').some((branch) => {
		const steps = parseBranch(branch);
		return steps !== null && matchSteps(el, steps);
	});
}

/** 按顶层分隔符切分（[] 内的分隔符不算，属性值里可能有逗号）。 */
function splitTopLevel(s, sep) {
	const parts = [];
	let depth = 0;
	let cur = '';
	for (const ch of s) {
		if (ch === '[') depth += 1;
		else if (ch === ']') depth -= 1;
		if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
		cur += ch;
	}
	parts.push(cur);
	return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** "a .b > c" → [{compound,combinator}]，combinator 表示与左侧的关系。 */
function parseBranch(branch) {
	const steps = [];
	let buf = '';
	let pending = null;
	const flush = () => {
		if (!buf.trim()) return;
		steps.push({ compound: buf.trim(), combinator: pending });
		buf = '';
	};
	let depth = 0;
	for (const ch of branch) {
		if (ch === '[') depth += 1;
		else if (ch === ']') depth -= 1;
		if (depth === 0 && ch === '>') { flush(); pending = '>'; continue; }
		if (depth === 0 && /\s/.test(ch)) {
			flush();
			if (pending !== '>') pending = ' ';
			continue;
		}
		buf += ch;
	}
	flush();
	if (!steps.length) return null;
	steps[0].combinator = null;
	return steps;
}

function matchSteps(el, steps) {
	let i = steps.length - 1;
	if (!matchCompound(el, steps[i].compound)) return false;
	let cur = el;
	for (i -= 1; i >= 0; i -= 1) {
		const rel = steps[i + 1].combinator;
		if (rel === '>') {
			cur = cur.parentElement;
			if (!cur || !(cur instanceof El) || !matchCompound(cur, steps[i].compound)) return false;
		} else {
			cur = cur.parentElement;
			while (cur && !(cur instanceof El && matchCompound(cur, steps[i].compound))) cur = cur.parentElement;
			if (!cur) return false;
		}
	}
	return true;
}

function matchCompound(el, compound) {
	let s = String(compound).trim();
	if (!s) return false;
	const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s);
	if (m) {
		if (el.tagName !== m[0].toUpperCase()) return false;
		s = s.slice(m[0].length);
	}
	let i = 0;
	while (i < s.length) {
		if (s[i] === '[') {
			const j = s.indexOf(']', i);
			if (j === -1) return false;
			if (!matchAttr(el, s.slice(i + 1, j))) return false;
			i = j + 1;
		} else if (s[i] === '.') {
			let k = i + 1;
			while (k < s.length && /[A-Za-z0-9_-]/.test(s[k])) k += 1;
			if (!el.classList.includes(s.slice(i + 1, k))) return false;
			i = k;
		} else {
			i += 1;
		}
	}
	return true;
}

function matchAttr(el, attrSel) {
	const raw = String(attrSel).trim();
	const eq = raw.indexOf('=');
	if (eq === -1) return el.hasAttribute(raw);
	const op = eq > 0 && raw[eq - 1] === '*' ? '*=' : '=';
	const name = raw.slice(0, op === '*=' ? eq - 1 : eq).trim();
	const q1 = raw.indexOf('"', eq);
	const q2 = raw.lastIndexOf('"');
	const want = q1 === -1 ? '' : raw.slice(q1 + 1, q2 === -1 ? raw.length : q2);
	const actual = name === 'class' ? String(el.className || '') : (el.getAttribute(name) || '');
	return op === '=' ? actual === want : actual.indexOf(want) !== -1;
}

// ---------------------------------------------------------------------------
// G5-G7：dsh-conversation-tweaks 的标记扫描行为
// ---------------------------------------------------------------------------
function elem(attrs, children) {
	const el = new El((attrs && attrs.__tag) || 'div');
	for (const [k, v] of Object.entries(attrs || {})) {
		if (k === '__tag') continue;
		if (k === 'class') el.className = v;
		else el.setAttribute(k, v);
	}
	for (const c of children || []) el.appendChild(c);
	return el;
}

/** 新内核形状：行类 _RXqYG_flowItem + data-chat-flow-kind，无旧哈希类。 */
function newKernelRows() {
	const msgRoot = elem({ class: '_2erCIa_root' }, [elem({ class: '_2erCIa_body' }, [elem({ class: '_markdown_177e0_5' })])]);
	return [
		elem({ class: '_RXqYG_flowItem', 'data-chat-flow-kind': 'user', 'data-chat-turn': '1' }),
		elem({ class: '_RXqYG_flowItem', 'data-chat-flow-kind': 'assistant-step', 'data-turn-process-member': 'true' }),
		elem({ class: '_RXqYG_flowItem', 'data-chat-flow-kind': 'assistant-step', 'data-turn-process-answer': 'true' }, [msgRoot])
	];
}

/** 旧内核形状：.Md3f7G_flowItem 行 + .Sxvs8a_root 消息卡 + .Sxvs8a_body > ._markdown_1nba0_5 */
function legacyKernelRows() {
	const card = () => elem({ class: 'Sxvs8a_root' }, [elem({ class: 'Sxvs8a_body' }, [elem({ class: '_markdown_1nba0_5' })])]);
	const row = (kind, kids) => elem({ class: 'Md3f7G_flowItem', 'data-chat-flow-kind': kind }, kids);
	return [
		row('user'),
		row('assistant', [card()]),
		row('tool-call'),
		row('assistant', [card()])
	];
}

function collect(el, acc) {
	acc = acc || [];
	for (const c of el.children) { acc.push(c); collect(c, acc); }
	return acc;
}

/**
 * 用给定的行集合装配一个 document，并跑一次 apply()。
 * 插件源码里 document / MutationObserver / setTimeout 都是**裸全局**，
 * 必须在 sandbox 上提供（apply(ctx) 也只收一个参数）。
 */
function runTweaksApply(rows, quiet) {
	const docEl = new El('html');
	const head = new El('head');
	const body = new El('body');
	docEl.appendChild(head);
	docEl.appendChild(body);
	for (const r of rows) body.appendChild(r);

	const doc = {
		documentElement: docEl,
		head,
		body,
		createElement: (t) => new El(t),
		querySelector: (s) => docEl.querySelector(s),
		querySelectorAll: (s) => docEl.querySelectorAll(s)
	};

	const src = fs.readFileSync(path.join(PLUGINS, 'dsh-conversation-tweaks', 'lib', 'client.js'), 'utf8');
	const loads = [];
	const win = { __ModuleLoader__: { load: (o) => loads.push(o) } };
	win.window = win;
	const sandbox = {
		window: win,
		document: doc,
		console,
		setTimeout: () => 0,
		clearTimeout: () => {},
		MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; }
	};
	vm.createContext(sandbox);
	vm.runInContext(src, sandbox, { filename: 'client.js' });
	assert.equal(loads.length, 1, 'tweaks 应恰好注册一个模块');

	const snapshot = { status: 'ready', writable: true, value: { quietOutput: quiet } };
	const ctx = {
		settingsScope: { bind: () => ({ getSnapshot: () => snapshot, subscribe: () => () => {} }) },
		slots: { inject: () => {}, register: () => () => {} },
		effect: () => () => {}
	};
	const api = loads[0].factory((id) => {
		if (id === 'react') {
			return {
				default: {},
				useSyncExternalStore: () => snapshot,
				useState: () => [false, () => {}],
				useEffect: () => {},
				useRef: () => ({ current: null }),
				createElement: () => null
			};
		}
		if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
		if (id === '@deepseek-ai/dsh-client-ui-renderer') return {};
		if (id === '@deepseek-ai/dsh-client-web-react') return {};
		throw new Error('unexpected require: ' + id);
	});
	api.apply(ctx);
	return { doc, rows, all: [body, ...rows.flatMap((r) => [r, ...collect(r)])] };
}

const flatAll = (rows, doc) => [doc.body, ...rows.flatMap((r) => [r, ...collect(r)])];
const markedKeep = (nodes) => nodes.filter((n) => n.getAttribute('data-dsh-keep-summary') !== null);

test('G5 新内核 DOM：标记扫描早退，不再往节点上打 data-dsh-keep-summary', () => {
	const rows = newKernelRows();
	const { doc } = runTweaksApply(rows, true);
	assert.equal(doc.body.getAttribute('data-dsh-quiet-output'), '1', '开关应把 body 标记打开（这部分一直有效）');
	const nodes = flatAll(rows, doc);
	assert.deepEqual(markedKeep(nodes), [], '当前内核由 CSS 属性契约决定可见性，不该再有 DOM 打标记');
	// 早退的前提：判定函数确实认不出旧内核形状
	assert.equal(nodes.some((n) => n.matches('.Sxvs8a_root, .Md3f7G_flowItem')), false, '桩里不该混入旧内核类');
});

test('G5b 新内核 DOM：属性契约规则确实随样式注入（藏什么由这些规则决定）', () => {
	const rows = newKernelRows();
	const { doc } = runTweaksApply(rows, true);
	const tag = doc.head.querySelector('style[data-plugin-css]');
	assert.ok(tag, '应注入插件样式标签');
	const css = tag.textContent;
	for (const need of [
		'[data-chat-flow-kind="tool-call"]',
		'[data-chat-flow-kind][data-turn-process-member]',
		'[data-variant="think"]'
	]) {
		assert.ok(css.includes(need), '注入的 CSS 缺少契约规则 ' + need);
	}
});

test('G6 旧内核 DOM：每轮最后一个带正文的助手消息仍被标为总结', () => {
	const rows = legacyKernelRows();
	const { doc } = runTweaksApply(rows, true);
	const roots = flatAll(rows, doc).filter((n) => n.matches('.Sxvs8a_root'));
	assert.equal(roots.length, 2, '桩里应有两个旧内核消息卡');
	const kept = markedKeep(roots);
	assert.equal(kept.length, 1, '只应保留每轮最后一个总结');
	assert.equal(roots[1], kept[0], '保留的应是 DOM 顺序上最后一个带正文的助手卡');
});

test('G7 旧内核 DOM + 开关关闭：只清除标记，不新增', () => {
	const rows = legacyKernelRows();
	const { doc } = runTweaksApply(rows, false);
	assert.equal(doc.body.hasAttribute('data-dsh-quiet-output'), false, '关闭时 body 标记不应存在');
	assert.deepEqual(markedKeep(flatAll(rows, doc)), [], '关闭时不该有任何 keep-summary 标记');
});

test('G8 覆盖面：声明了 dsh.client 的插件必须真的被扫到（守卫看不到 ≠ 没坏）', () => {
	const scanned = new Map();
	for (const plugin of allPlugins) scanned.set(plugin, sourcesOf(plugin).map((s) => s.base));
	const declared = fs.readdirSync(PLUGINS).filter((d) => {
		try { if (!fs.statSync(path.join(PLUGINS, d)).isDirectory()) return false; } catch { return false; }
		return hasClientDecl(d);
	});
	assert.ok(declared.length >= 30, '声明客户端半边的插件数=' + declared.length + '，枚举判据可能已失效');
	const unseen = declared.filter((d) => (scanned.get(d) || []).length === 0);
	assert.deepEqual(unseen, [], '声明了客户端半边却没有一个文件被扫到：\n' + unseen.join('\n'));
	let total = 0;
	for (const v of scanned.values()) total += v.length;
	assert.ok(total >= 45, '待扫文件数=' + total + '，远低于仓库实际规模——枚举可能又收窄了');

	// 本轮真漏报的回归锁：入口不在 lib/ 下的两个插件必须在扫描集里。
	assert.ok((scanned.get('dsh-offpeak') || []).includes('client.js'),
		'dsh-offpeak 的 client/client.js 未被扫（曾在野漏报 composer 换代漂移）');
	assert.ok((scanned.get('dsh-synapse') || []).includes('client.js'),
		'dsh-synapse 的 ./client.js 未被扫');

	// 并且不是「只进了清单」：offpeak 的两代修好的形态要真在盘上。
	const offpeakSources = sourcesOf('dsh-offpeak');
	const offpeakRaw = offpeakSources.map((s) => s.raw).join('\n');
	const offpeakCode = offpeakSources.flatMap((s) => s.code.map((l) => l.text)).join('\n');
	assert.ok(offpeakRaw.includes(COMPAT_MARK + 'composer-editable'), 'dsh-offpeak 应带 composer 两代兼容标记');
	assert.ok(offpeakCode.includes('[data-composer-input]'), 'dsh-offpeak 输入面锚点应认当前内核（代码行，非注释）');
	// 否定面走 code 口径，不走 raw：本插件头里就写着「原先 card.querySelector(
	// \'textarea\') 恒 null」这段病因说明，拿全文当判据会把注释当代码误报
	// （与 G1 剔除注释同一个理由，本轮自己踩了一次）。
	assert.equal(/instanceof HTMLTextAreaElement/.test(offpeakCode), false,
		'dsh-offpeak 不得再用单代 textarea 判定发送目标');
	assert.equal(/querySelector\(["']textarea["']\)/.test(offpeakCode), false,
		'dsh-offpeak click 通道不得只查 textarea');
});

// ---------------------------------------------------------------------------
// G9 类名新鲜度：CSS Module 的哈希前缀每次重打包都变，但局部名（.bubble、
// .footerActions）稳定。插件拿 [class*="X"] 取元素时，只要 X 在内核 CSS 里
// 查无此人，该选择器就命中 0 —— 又是一类「静默失效」。本条把这件事从「人工对
// 账」变成「内核为权威源的自动比对」（dsh-quest-ui 的 suggestion 三条就是这么抓到的）。
// ---------------------------------------------------------------------------
const KERNEL_NM = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai');

/** 内核侧可用作类名的局部名集合（磁盘上扫一次，缓存）。 */
let kernelNamesCache = null;
function kernelClassNames() {
	if (kernelNamesCache) return kernelNamesCache;
	const names = new Set();
	const walk = (dir) => {
		if (!fs.existsSync(dir)) return;
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
			if (!/\.(css|js)$/.test(e.name)) continue;
			const t = fs.readFileSync(p, 'utf8');
			if (e.name.endsWith('.css')) {
				for (const m of t.matchAll(/\.([A-Za-z_][\w-]{2,})/g)) names.add(m[1]);
			} else {
				for (const m of t.matchAll(/_module_css_default\.([A-Za-z_]\w*)/g)) names.add(m[1]);
				for (const m of t.matchAll(/className:\s*[\w$.]+\.([A-Za-z_]\w*)/g)) names.add(m[1]);
			}
		}
	};
	walk(KERNEL_NM);
	kernelNamesCache = names;
	return names;
}

/** 去掉 CSS Module 的 _hash 尾巴与下划线前缀，得核心词；太短的词不参与判定。 */
function classTokenCore(token) {
	const core = token.replace(/^_+/, '').replace(/_+[0-9a-z]{4,}$/i, '');
	return core.length >= 4 ? core : null;
}

// 已知「在内核里不在场、但有意保留」的类名词：必须逐条带理由（同上死锚纪律）。
// 键一律小写：liveIn 比对是大小写不敏感的，若注册表按原样大小写，[class*="Suggestion"]
// 这种同一词的另一拼法就会悄悄绕过这道关卡（本轮实测踩过一次）。
const INERT_CLASS_TOKENS = new Map([
	['suggestion', '当前内核已无「欢迎页建议条目」UI（实测 suggestion/example/starter/recommend '
		+ '在 dsh-client-ui-conversation 全 0 命中），dsh-quest-ui 的三条规则（suggestion 与 '
		+ 'Suggestion 两种拼法）今日惰性，带 dsh-compat:welcome-suggestions-inert 说明保留。'],
]);

test('G9 [class*="X"] 的局部名必须仍在内核 CSS 里在场（或逐条登记为惰性）', () => {
	const names = kernelClassNames();
	// 判据自检：覆盖面与两个方向的控制组（不先证这个，「全绿」只可能是“什么都没扫到”）。
	assert.ok(names.size >= 300, '内核类名集合只有 ' + names.size + ' 个，扫描可能已脱靶');
	const liveIn = (core) => [...names].some((n) => n.toLowerCase().includes(core.toLowerCase()));
	assert.equal(liveIn('bubble'), true, '控制组失败：已知在位的 bubble 被判不在场');
	assert.equal(liveIn('Sxvs8a_root'), false, '控制组失败：已登记死锚被判在场');

	const sites = [];
	for (const plugin of allPlugins) {
		for (const src of sourcesOf(plugin)) {
			for (const l of src.code) {
				for (const m of l.text.matchAll(/\[class\*=\s*["']([^"']+)["']\s*\]/g)) {
					sites.push({ plugin, base: src.base, line: l.line, token: m[1], core: classTokenCore(m[1]) });
				}
			}
		}
	}
	assert.ok(sites.length >= 40, '待判定的 [class*=] 站点=' + sites.length + '，远低于仓库实际规模');
	const dead = [];
	for (const s of sites) {
		if (s.core === null) continue;
		if (liveIn(s.core)) continue;
		if (INERT_CLASS_TOKENS.has(s.core.toLowerCase())) continue;
		dead.push(`${s.plugin}/${s.base}:${s.line}  [class*="${s.token}"]`);
	}
	assert.deepEqual(dead, [], '插件引用了内核已不存在的类名（未登记为惰性）：\n' + [...new Set(dead)].join('\n'));
	// 惰性登记也不能过期：一旦内核重新出现该局部名，就把这条登记删掉。
	const revived = [...INERT_CLASS_TOKENS.keys()].filter((core) => liveIn(core));
	assert.deepEqual(revived, [], '以下词已在场，不该再挂在惰性名单里：' + revived.join(', '));
});

// ---------------------------------------------------------------------------
// G10 槽位 props 契约：组件只能读它注册的那个槽确实下发的 props。
//
// 为什么单独一条：这一族的故障形态与 G1-G9 相同（不报错、不进日志、UI 就是不出来），
// 但锚点不在 DOM 上而在 props 形状上——组件解构了该槽不下发的名字 → undefined →
// 调用即 TypeError → slot entry 崩退位。本仓已修的 rewind / input-history 与本轮抓到
// 的 dsh-vision「插入文件引用覆盖用户草稿」都是这一族。
//
// 权威 = 内核 cordis runner 里的 CLIENT_SLOT_API：构建期由真源码 AST 生成（注释原文
// 「Produced by the same AST walk as docs/cordis-catalog, so this data and the rendered
// docs cannot diverge」），逐槽列出 standardProps（框架 kit）、ownerProps（宿主下发）、
// kind/scope。这比人工归纳完备：52 个槽全在册，且与本守卫独立推导的活槽名逐数吻合。
//
// 注册项由渲染器兑现成 props，这条映射必须一起认，否则整片误报（本轮实测踩过）：
//   locale: NS   → t（框架注入翻译席位）
//   store: h     → useStore + actions
//   inject: () => ({ a, b }) → a、b
// inject 是间接引用或动态表达式时无法静态枚举 —— 落 INCONCLUSIVE：既不判红，也不算通过。
// 只有「能证明该槽确实不下发」才报，证明不了的不静默丢弃。
// ---------------------------------------------------------------------------
const RUNNER_BUNDLE = path.join(KERNEL_NM, 'dsh-cordis-client-runner', 'lib', 'client.js');

/** 字符串与注释感知的括号配平切片（含外层括号）。 */
function sliceBalanced(text, from) {
	let depth = 0, i = from, str = null;
	while (i < text.length) {
		const c = text[i];
		if (str) {
			if (c === '\\') { i += 2; continue; }
			if (c === str) str = null;
			i += 1;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') { str = c; i += 1; continue; }
		if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
		if (c === '[' || c === '{' || c === '(') { depth += 1; i += 1; continue; }
		if (c === ']' || c === '}' || c === ')') {
			depth -= 1; i += 1;
			if (depth === 0) return text.slice(from, i);
			continue;
		}
		i += 1;
	}
	return null;
}

/** 槽名 → 该槽下发的 props 名集合。 */
let slotContractCache = null;
function slotContract() {
	if (slotContractCache) return slotContractCache;
	const src = fs.readFileSync(RUNNER_BUNDLE, 'utf8');
	const d = /const CLIENT_SLOT_API = \[/.exec(src);
	assert.ok(d, 'runner 里找不到 CLIENT_SLOT_API，权威源已漂移，本条判据须回炉');
	const api = vm.runInNewContext('(' + sliceBalanced(src, src.indexOf('[', d.index)) + ')',
		Object.create(null), { timeout: 3000 });
	const map = new Map();
	for (const e of api) {
		const set = new Set(['children']);
		for (const p of e.standardProps || []) set.add(String(p).split(':')[0].trim());
		for (const s of e.ownerProps || []) {
			for (const m of String(s).matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)) set.add(m[1]);
		}
		if (e.kind === 'chain') set.add('matched');   // 选举结果由渲染器下发
		map.set(e.key, set);
	}
	slotContractCache = map;
	return map;
}

/** 注册项 → 渲染器兑现的额外 props。 */
const OPTION_GIFTS = [
	[/(^|[,\s{])locale\s*:/, ['t']],
	[/(^|[,\s{])store\s*:/, ['useStore', 'actions']],
];

/** 解析 inject 选项：内联对象可枚举；间接/动态引用标 dynamic（不可判定）。 */
function injectGifts(opts) {
	const m = /(^|[,\s{])inject\s*:/.exec(opts);
	if (!m) return { keys: [], dynamic: false };
	const rest = opts.slice(m.index + m[0].length);
	const fn = /^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\(/.exec(rest);
	if (!fn) return { keys: [], dynamic: true };                 // inject: someFn
	const open = rest.indexOf('{', fn.index + fn[0].length - 1);
	if (open < 0) return { keys: [], dynamic: true };
	const lit = sliceBalanced(rest, open);
	if (!lit) return { keys: [], dynamic: true };
	const body = lit.slice(1, -1);
	const keys = [];
	for (const part of body.split(',')) {
		const t = part.trim();
		if (!t) continue;
		const km = /^([A-Za-z_$][\w$]*)\s*:/.exec(t) || /^([A-Za-z_$][\w$]*)$/.exec(t);
		if (km) keys.push(km[1]);
	}
	return { keys, dynamic: /\.\.\./.test(body) };               // 含展开则枚举不完整
}

/** 一个文件里的 slots.register 注册点：{ slot, opts, component|null }。 */
function collectRegistrations(raw) {
	const regs = [];
	const re = /slots\.register\s*\(/g;
	let m;
	while ((m = re.exec(raw))) {
		let i = re.lastIndex;
		while (i < raw.length && /\s/.test(raw[i])) i += 1;
		if (raw[i] !== '{') continue;                             // 首参不是对象字面量，跳过
		const opts = sliceBalanced(raw, i);
		if (!opts) continue;
		const nm = /(^|[,\s{])name\s*:\s*["']([\w.-]+)["']/.exec(opts);
		if (!nm) continue;
		const after = raw.slice(i + opts.length, i + opts.length + 120);
		const cm = /^\s*,\s*([A-Za-z_$][\w$]*)/.exec(after);
		regs.push({ slot: nm[2], opts, component: cm ? cm[1] : null });
	}
	return regs;
}

/** 定位命名组件定义，返回 { params, body }。 */
function findComponentDef(raw, name) {
	const pats = [
		'function\\s+' + name + '\\s*\\(([^)]*)\\)\\s*\\{',
		'(?:const|let|var)\\s+' + name + '\\s*=\\s*\\(([^)]*)\\)\\s*(?:=>|function)[^{]*\\{',
		'(?:const|let|var)\\s+' + name + '\\s*=\\s*function\\s*\\(([^)]*)\\)\\s*\\{',
	];
	for (const p of pats) {
		const re = new RegExp(p, 'g');
		const m = re.exec(raw);
		if (!m) continue;
		const body = sliceBalanced(raw, re.lastIndex - 1);
		if (body) return { params: m[1].trim(), body: body.slice(1, -1) };
	}
	return null;
}

/** 组件对 props 的读取名，以及它调用的 hook 名（用于识别已迁移的镜像读）。 */
function propReadsOf(params, body) {
	const reads = new Set();
	const hooks = new Set();
	const dg = /^\{\s*([\s\S]*?)\s*\}$/.exec(params);
	if (dg) {
		for (const part of dg[1].split(',')) {
			const t = part.trim();
			if (!t || t.startsWith('...')) continue;
			const m = /^([A-Za-z_$][\w$]*)/.exec(t);
			if (m) reads.add(m[1]);
		}
		for (const m of body.matchAll(/\buse([A-Z][\w$]*)\b/g)) hooks.add(m[1]);
		return { reads, hooks };
	}
	const nm = /^([A-Za-z_$][\w$]*)/.exec(params);
	if (nm) {
		const q = nm[1].replace(/\$/g, '\\$');
		for (const m of body.matchAll(new RegExp('\\b' + q + '\\.[A-Za-z_$][\\w$]*', 'g'))) reads.add(m[0].split('.')[1]);
		for (const m of body.matchAll(new RegExp('\\b' + q + '\\.use([A-Z][\\w$]*)', 'g'))) hooks.add(m[1]);
	}
	return { reads, hooks };
}

// 「读了但确实不下发、且核为刻意可选」的登记：逐条带理由（同 G9 惰性名单纪律），
// 且过期即红 —— 防止豁免名单变成再也没人敢删的杂物抽屉。
const OPTIONAL_PROP_READS = new Map([
	['dsh-community-market/MarketSettingsTab::initialView',
		'settings.plugins.tab 的 ownerProps 明示为空（刻意不带宿主 props）；组件按 '
		+ 'initialView === void 0 决定是否下传，MarketSurface 形参有默认值 "installable"。'],
	['dsh-community-market/MarketOverlay::initialView',
		'shell.overlay 无宿主 props；overlay 开在哪一视图由 store（marketView）决定，未下发即回落默认。'],
]);

/** 跑一条判据：entries = [{ label, raw }]。 */
function scanPropContracts(entries) {
	const contract = slotContract();
	const bad = [];
	const inconclusive = [];
	const seenReads = new Set();
	let regs = 0;
	let blind = 0;
	for (const en of entries) {
		const plugin = en.label.split('/')[0];
		for (const r of collectRegistrations(en.raw)) {
			regs += 1;
			const give = contract.get(r.slot);
			if (!give) {
				bad.push(`${en.label} 注册进内核未声明的槽 "${r.slot}"（SlotCore.register 必抛，该 UI 永不挂载）`);
				continue;
			}
			if (r.component === null) { blind += 1; continue; }    // 内联组件，无命名可查
			const def = findComponentDef(en.raw, r.component);
			if (!def) { blind += 1; continue; }                    // 定义在别的文件
			const set = new Set(give);
			for (const [re, gives] of OPTION_GIFTS) if (re.test(r.opts)) for (const g of gives) set.add(g);
			const inj = injectGifts(r.opts);
			for (const k of inj.keys) set.add(k);
			const { reads, hooks } = propReadsOf(def.params, def.body);
			if (inj.dynamic) {
				inconclusive.push(`${en.label} :: ${r.slot} 的 ${r.component} 带动态 inject，额外 props 不可静态枚举`);
				continue;
			}
			for (const x of reads) {
				seenReads.add(`${plugin}/${r.component}::${x}`);
				if (set.has(x)) continue;
				// 旧快照名且同组件在调对应 hook（useInput / useSession …）= 已迁移的两代镜像。
				if (hooks.has(x.charAt(0).toUpperCase() + x.slice(1))) continue;
				if (OPTIONAL_PROP_READS.has(`${plugin}/${r.component}::${x}`)) continue;
				bad.push(`${en.label} 的 ${r.component} 读 props.${x}，但槽 ${r.slot} 不下发它（调用即 TypeError）`);
			}
		}
	}
	return { regs, bad, inconclusive, seenReads, blind };
}

test('G10 组件只能读所在槽确实下发的 props（权威 = CLIENT_SLOT_API）', () => {
	const contract = slotContract();
	// 判据自检：覆盖面 + 三个方向的控制组（不先证这个，「全绿」只可能是什么都没扫到）。
	assert.ok(contract.size >= 45, '权威槽数只有 ' + contract.size + '，runner 结构可能已变');
	assert.equal(contract.get('conversation.input.left').has('useInput'), true,
		'控制组失败：session 作用域槽的 useInput 未被认出');
	assert.equal(contract.get('settings.section').has('useChat'), false,
		'控制组失败：root 作用域槽不该下发 useChat，判据已失效');
	assert.equal(contract.get('sidebar.footer.action').has('wide'), true,
		'控制组失败：ownerProps 里的 wide 未被认出（宿主下发面漏读）');

	const entries = allPlugins.flatMap((p) => sourcesOf(p).map((s) => ({ label: p + '/' + s.base, raw: s.raw })));
	const r = scanPropContracts(entries);
	assert.ok(r.regs >= 25, '扫到注册点=' + r.regs + '，远低于仓库实际规模，判据可能已脱靶');
	// 动态 inject 必须被隔离而非当成通过；数量下限同时给「解析整体失效」上一道锁。
	assert.ok(r.inconclusive.length >= 5,
		'INCONCLUSIVE=' + r.inconclusive.length + '，注入面解析可能已失效（真树里动态 inject 不止这些）');
	assert.deepEqual(r.bad, [], '插件读了它那个槽不下发的 props：\n' + r.bad.join('\n'));

	// 豁免登记不得过期：登记的读法若已不在场，说明组件改完了却没删登记。
	const stale = [...OPTIONAL_PROP_READS.keys()].filter((k) => !r.seenReads.has(k));
	assert.deepEqual(stale, [], '以下豁免登记已不对应任何实际读取，请删掉：' + stale.join(', '));

	// 捕获力自证：四条夹具跑同一条判据，方向各不相同。
	const FIX = {
		// ① 真漂移：往 root 作用域槽要只有 session 槽才有的 useChat
		drift: 'ctx.slots.inject("settings.section", () => ctx.slots.register('
			+ '{ name: "settings.section", id: "x" }, DriftComp));\n'
			+ 'function DriftComp(props) { return props.useChat(() => 1); }',
		// ② locale/store 兑现面：同形状但合法，不得误报
		gifts: 'ctx.slots.inject("settings.section", () => ctx.slots.register('
			+ '{ name: "settings.section", id: "x", store: handle, locale: NS }, OkComp));\n'
			+ 'function OkComp({ t, useStore, actions }) { return null; }',
		// ③ 动态 inject：既不能判红也不能静默放过
		dynamic: 'ctx.slots.inject("settings.section", () => ctx.slots.register('
			+ '{ name: "settings.section", id: "x", inject: () => ctrl.propsOf() }, DynComp));\n'
			+ 'function DynComp({ whatever }) { return null; }',
		// ④ 旧快照名 + 对应 hook 镜像（真树里 file-drop / vision 的实际形态）
		mirror: 'ctx.slots.inject("conversation.input.left", () => ctx.slots.register('
			+ '{ name: "conversation.input.left", id: "x" }, MirrorComp));\n'
			+ 'function MirrorComp(props) {\n'
			+ '  var m = props.useInput ? props.useInput(SEL) : "";\n'
			+ '  return props.input || m;\n}',
		// ⑤ 注册进未声明的槽
		ghost: 'ctx.slots.inject("conversation.input.legacy", () => ctx.slots.register('
			+ '{ name: "conversation.input.legacy", id: "x" }, GhostComp));\n'
			+ 'function GhostComp({ useInput }) { return null; }',
	};
	const fr = scanPropContracts(Object.entries(FIX).map(([k, raw]) => ({ label: k + '/client.js', raw })));
	const hitBad = (p) => fr.bad.some((b) => b.startsWith(p));
	const hitInc = (p) => fr.inconclusive.some((b) => b.startsWith(p));
	assert.equal(hitBad('drift/'), true, '捕获力失败：漂移读 useChat 未被报红，本条守卫是空转的');
	assert.equal(hitBad('gifts/'), false, '捕获力失败：locale/store 兑现面被误报（豁免规则不精确）');
	assert.equal(hitInc('dynamic/') && !hitBad('dynamic/'), true,
		'捕获力失败：动态 inject 未落 INCONCLUSIVE（既不判红也不静默丢）');
	assert.equal(hitBad('mirror/'), false, '捕获力失败：已迁移的镜像读被误报');
	assert.equal(hitBad('ghost/'), true, '捕获力失败：注册进未声明的槽未被报红');
});
