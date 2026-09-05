'use strict';

// unit-dsh-file-drop-attach.test.js — 选中上传 + 附件功能整体补齐的单测。
//
// 覆盖 dsh-file-drop v0.2.0（assets/plugins/dsh-file-drop/lib/client.js）：
//   1) 纯逻辑矩阵：内核限额镜像、分类、路径净化、载荷归一、多文件提示、
//      双通道（HTML5 drop × client-file-drop）去重、选择器裁决
//      （类型/单图/张数/合计）、官方附件管道回滚；
//   2) vm 端到端：仿真 rc.8 模块表物化 factory → apply → 槽位按钮 →
//      「选文件 → plan → 官方 createDraftImages/addImages → 随消息发送的
//      载荷（base64 image 块）」整链（mock 内核附件 API 形态）；
//   3) 壳层 client-file-drop 消费：window CustomEvent → 合并路径提示注入
//      仿真 textarea；内容载荷（dataUrl）转官方管道；
//   4) dsh-image-paste 让位回归：defaultPrevented 的粘贴不再重复走桥存盘。
//
// 运行：node --test scripts/test/unit-dsh-file-drop-attach.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-file-drop', 'lib', 'client.js');
const PASTE_PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-image-paste', 'lib', 'client.js');

/** 在 vm sandbox 里执行 client.js，捕获 __ModuleLoader__.load 注册。 */
function loadClient(file, extraSandbox) {
  let captured = null;
  const baseWindow = { __ModuleLoader__: { load: (reg) => { captured = reg; } } };
  const sandbox = Object.assign({}, extraSandbox || {});
  // extraSandbox.window（事件监听 stub 等）并入基础 window，不得整对象替换
  //（否则 __ModuleLoader__ 丢失，captured 为 null）。
  sandbox.window = Object.assign(baseWindow, sandbox.window || {});
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return { captured, sandbox };
}

// ---------------------------------------------------------------------------
// 0) 加载 + 纯逻辑面暴露
// ---------------------------------------------------------------------------

const { captured } = loadClient(PLUGIN);
assert.ok(captured && typeof captured.factory === 'function', '应经 __ModuleLoader__.load 注册 factory');

// rc8 式 require（种子表），返回可控 stub。
function makeRequire(stubs) {
  return (spec) => {
    if (stubs && Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec];
    throw new Error(`missed module: ${spec}`);
  };
}

// 最小 React stub（createElement + 三 hook；useState 不触发重渲染，仅取值）。
function makeReactStub() {
  return {
    Fragment: Symbol('fragment'),
    createElement: (tag, props, ...children) => ({ tag, props: props || {}, children }),
    useRef: (v) => ({ current: v }),
    useState: (v) => [v, () => {}],
    useEffect: (fn) => { fn(); return () => {}; },
  };
}

// 仿真内核 attachment API 形态（对齐 ui-conversation 客户端）：
// createDraftImages 做 MIME 白名单校验并返回 {kind:'image',id,previewUrl,file}；
// serialize 演示发送载荷（base64 image 块）。
const KERNEL_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
function makeKernelConversation() {
  const drafts = new Map();
  let seq = 0;
  const released = [];
  const api = {
    calls: { create: [], release: [] },
    released,
    createDraftImages(files) {
      for (const f of files) {
        if (!KERNEL_MIMES.includes(f.type)) {
          const err = new Error(`unsupported image media type: ${f.type || '(empty)'}`);
          err.name = 'UnsupportedImageMediaTypeError';
          throw err;
        }
      }
      return files.map((file) => {
        const attachment = { kind: 'image', id: 'img-' + (seq++), previewUrl: 'blob:mock-' + seq, file };
        drafts.set(attachment.id, attachment);
        api.calls.create.push(file.name);
        return attachment;
      });
    },
    releaseDraftImages(list) { for (const d of list) { drafts.delete(d.id); released.push(d.id); } },
    releaseDraftImage(id) { drafts.delete(id); released.push(id); },
    draftImages: (ids) => ids.map((id) => drafts.get(id)).filter(Boolean),
    // 发送载荷形态（内核 submit 时实际执行的序列化，此处演示 wire）。
    serializeDraftImages(ids) {
      return Promise.all(api.draftImages(ids).map(async (a) => ({
        type: 'image',
        mediaType: a.file.type,
        data: Buffer.from(await a.file.arrayBuffer()).toString('base64'),
        name: a.file.name,
      })));
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// 1) 纯逻辑矩阵
// ---------------------------------------------------------------------------

test('内核限额镜像：与 dsh-attachment-local 默认值逐项一致', () => {
  const c = captured.factory(makeRequire({ react: makeReactStub() })).core;
  assert.equal(JSON.stringify(c.KERNEL_IMAGE_MEDIA_TYPES), JSON.stringify(KERNEL_MIMES));
  assert.equal(c.KERNEL_LIMITS.maxImageBytes, 3.5 * 1024 * 1024);
  assert.equal(c.KERNEL_LIMITS.maxImagesPerMessage, 20);
  assert.equal(c.KERNEL_LIMITS.maxMessageImageBytes, 100 * 1024 * 1024);
  assert.equal(c.KERNEL_LIMITS.maxImageDimension, 2000);
});

const core = captured.factory(makeRequire({ react: makeReactStub() })).core;

test('classifyFile 保持既有语义（image/text/binary/无扩展名）', () => {
  assert.equal(core.classifyFile('a.png', 1).kind, 'image');
  assert.equal(core.classifyFile('a.png', 1).reason, 'image');
  assert.equal(core.classifyFile('a.md', 1).kind, 'text');
  assert.equal(core.classifyFile('Makefile', 1).reason, 'extensionless');
  assert.equal(core.classifyFile('a.zip', 1).kind, 'binary');
  assert.ok(core.looksBinary('abc\u0000def'));
  assert.equal(core.formatSize(2048), '2.0 KB');
});

test('sanitizePath：去控制字符/引号、trim、限长；非法输入返回空串', () => {
  assert.equal(core.sanitizePath('  C:\\a\\b.png  '), 'C:\\a\\b.png');
  assert.equal(core.sanitizePath('C:\\a"b\'.png'), 'C:\\ab.png');
  assert.equal(core.sanitizePath('a\u0001\u001fb'), 'ab');
  assert.equal(core.sanitizePath(''), '');
  assert.equal(core.sanitizePath(null), '');
  assert.equal(core.sanitizePath('   '), '');
  assert.equal(core.sanitizePath('x'.repeat(5000)).length, 4096);
});

test('normalizeDropPayload：宽容 detail 形态 + 条目净化 + 上限截断', () => {
  // 注：vm 上下文里构造的对象原型与宿主不同，deepEqual 会因原型失配
  // 报「看着相等」的假失败 —— 统一走 JSON 快照比对。
  const json = (v) => JSON.stringify(v);
  // detail.files 数组（F1 契约形态）
  const a = core.normalizeDropPayload({ files: [{ path: 'C:\\a\\b.png', name: 'b.png', size: 12 }, { name: 'c.md', size: 3 }] });
  assert.equal(json(a), json([{ path: 'C:\\a\\b.png', name: 'b.png', size: 12 }, { path: '', name: 'c.md', size: 3 }]));
  // detail 本身是数组
  assert.equal(core.normalizeDropPayload([{ path: '/x/y.txt', size: '7' }])[0].size, 7);
  // name 缺省从路径 basename 补
  assert.equal(core.normalizeDropPayload([{ path: '/x/子目录/yy.md' }])[0].name, 'yy.md');
  // 垃圾载荷（无名无路径的条目一并剔除）
  assert.equal(json(core.normalizeDropPayload(null)), '[]');
  assert.equal(json(core.normalizeDropPayload({ foo: 1 })), '[]');
  assert.equal(json(core.normalizeDropPayload({ files: [null, 42, { size: 1 }] })), '[]');
  // 防洪水：>100 条截断
  assert.equal(core.normalizeDropPayload({ files: Array.from({ length: 150 }, (_, i) => ({ path: 'p' + i })) }).length, 100);
  // 负数/NaN size 归一 null
  assert.equal(core.normalizeDropPayload({ files: [{ path: 'p', size: -5 }] })[0].size, null);
  assert.equal(core.normalizeDropPayload({ files: [{ path: 'p', size: 'NaN' }] })[0].size, null);
  // 内容字段透传（F1 可选增强）与超长内容丢弃
  const withData = core.normalizeDropPayload({ files: [{ path: 'p', name: 'n', dataUrl: 'data:image/png;base64,AAA', mediaType: 'image/png' }] });
  assert.equal(withData[0].dataUrl, 'data:image/png;base64,AAA');
  assert.equal(withData[0].mediaType, 'image/png');
  const huge = core.normalizeDropPayload({ files: [{ path: 'p', dataUrl: 'x'.repeat(160 * 1024 * 1024 + 1) }] });
  assert.equal(huge[0].dataUrl, undefined);
});

test('buildDropHint：多文件合并块含名/大小/路径', () => {
  const text = core.buildDropHint([
    { name: 'a.png', size: 1024, path: 'C:\\a.png' },
    { name: 'b.md', size: 3, path: '' },
  ]);
  assert.match(text, /^\[拖入 2 个文件\]/);
  assert.ok(text.includes('a.png，1.0 KB'));
  assert.ok(text.includes('完整路径：C:\\a.png'));
  assert.ok(text.includes('b.md，3 B'));
  assert.ok(text.includes('（无路径）'));
});

test('dedupeEntries：路径键与名+大小键交叉命中；窗口外放行', () => {
  const seen = Object.create(null);
  // 壳层事件先报（带路径）
  const first = core.dedupeEntries([{ path: 'C:\\a.png', name: 'a.png', size: 9 }], seen, 1000, 1500);
  assert.equal(first.length, 1);
  // HTML5 侧双报（无路径，同名同大小）→ 路径条目已占名+大小键 → 拦下
  const dup = core.dedupeEntries([{ path: '', name: 'a.png', size: 9 }], seen, 1200, 1500);
  assert.equal(dup.length, 0);
  // 不同文件 → 放行
  const other = core.dedupeEntries([{ path: '', name: 'b.png', size: 1 }], seen, 1200, 1500);
  assert.equal(other.length, 1);
  // 窗口过期后同键再报 → 放行
  const late = core.dedupeEntries([{ path: '', name: 'a.png', size: 9 }], seen, 1000 + 1600, 1500);
  assert.equal(late.length, 1);
});

const MB = 1024 * 1024;
function fakeFile(name, type, size) {
  return { name, type, size, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
}

test('planPickedFiles：类型/单图/张数/合计校验矩阵', () => {
  // 白名单图片 → rail
  let p = core.planPickedFiles([fakeFile('a.png', 'image/png', 1 * MB)], 0);
  assert.equal(p.rail.length, 1);
  assert.equal(p.errors.length, 0);
  // 内核白名单外的图片 MIME（bmp/svg）→ 红字
  p = core.planPickedFiles([fakeFile('a.bmp', 'image/bmp', 1), fakeFile('b.svg', 'image/svg+xml', 1)], 0);
  assert.equal(p.rail.length, 0);
  assert.equal(p.errors.length, 2);
  assert.match(p.errors[0].message, /仅支持 PNG\/JPEG\/WebP\/GIF/);
  // 单图超 3.5MB → 红字（选 4MB）
  p = core.planPickedFiles([fakeFile('big.png', 'image/png', 4 * MB)], 0);
  assert.equal(p.rail.length, 0);
  assert.match(p.errors[0].message, /超过单图 3\.5 MB/);
  // 张数：已有 19 张再选 2 → 第二张被拒
  p = core.planPickedFiles([fakeFile('x.png', 'image/png', 1), fakeFile('y.png', 'image/png', 1)], 19);
  assert.equal(p.rail.length, 1);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].message, /20 张图片上限/);
  // 合计超限分支：默认限额下 20×3.5MB=70MB 永远先撞张数上限，注入放大
  // 单图上限的限额形态（服务端可配置）单独验证合计拒绝语义。
  p = core.planPickedFiles([
    fakeFile('a.png', 'image/png', 34 * MB), fakeFile('b.png', 'image/png', 34 * MB), fakeFile('c.png', 'image/png', 34 * MB),
  ], 0, { maxImageBytes: 40 * MB, maxImagesPerMessage: 20, maxMessageImageBytes: 100 * MB, maxImageDimension: 2000 });
  assert.equal(p.rail.length, 2);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].message, /合计超过 100\.0 MB/);
  // 默认限额下 34MB 单图直接被单图上限拒绝（对齐内核默认 3.5MB）。
  p = core.planPickedFiles([fakeFile('big2.png', 'image/png', 34 * MB)], 0);
  assert.equal(p.rail.length, 0);
  assert.match(p.errors[0].message, /超过单图 3\.5 MB/);
  // 文本 → text 通道；二进制（选择器无路径）→ 红字建议
  p = core.planPickedFiles([fakeFile('n.md', 'text/markdown', 10), fakeFile('z.zip', 'application/zip', 10)], 0);
  assert.equal(p.text.length, 1);
  assert.equal(p.rail.length, 0);
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0].message, /请放入工作区后让 agent 读取/);
  // 空输入（JSON 比对规避 vm 原型失配）
  assert.equal(JSON.stringify(core.planPickedFiles([], 0)), '{"rail":[],"text":[],"errors":[]}');
});

test('dimsWithinLimit：单边 2000px 准入线；未知维度放行', () => {
  assert.equal(core.dimsWithinLimit(2000, 1000), true);
  assert.equal(core.dimsWithinLimit(1000, 2000), true);
  assert.equal(core.dimsWithinLimit(2001, 100), false);
  assert.equal(core.dimsWithinLimit(0, 0), true); // 未知 → 交内核裁决
  assert.equal(core.dimsWithinLimit(-1, 5), true);
});

test('addToOfficialRail：成功 ids 流动；未接纳回滚；服务抛错给文案', () => {
  const kernel = makeKernelConversation();
  const inputActions = { addImages: (ids) => { calls.push(ids); return true; }, setDraft: () => {} };
  const calls = [];
  let r = core.addToOfficialRail({ conversation: kernel, inputActions }, [fakeFile('a.png', 'image/png', 1)]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ['img-0']);
  assert.deepEqual(calls, [['img-0']]);
  // addImages 拒绝（发送裁决期）→ 回滚 release
  const refuse = { addImages: () => false };
  r = core.addToOfficialRail({ conversation: kernel, inputActions: refuse }, [fakeFile('b.png', 'image/png', 1)]);
  assert.equal(r.ok, false);
  assert.match(r.error, /稍后再试/);
  assert.ok(kernel.released.includes('img-1'), '应回滚 release');
  // createDraftImages 抛不支持类型 → 错误文案外溢为返回值
  r = core.addToOfficialRail({ conversation: kernel, inputActions }, [fakeFile('c.bmp', 'image/bmp', 1)]);
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported image media type/);
  // 管道缺席 → 明确文案不抛错
  r = core.addToOfficialRail({}, [fakeFile('d.png', 'image/png', 1)]);
  assert.equal(r.ok, false);
  assert.match(r.error, /附件通道不可用/);
});

// ---------------------------------------------------------------------------
// 2) vm 端到端：选文件 → 附件栏 → 随消息发送的载荷
// ---------------------------------------------------------------------------

/** 带 DOM stub 的 vm 装载（textarea / document / FileReader / setTimeout）。 */
function makeDomSandbox() {
  const dispatched = [];
  const textarea = {
    tagName: 'TEXTAREA',
    value: '',
    focus() {},
    dispatchEvent(ev) { dispatched.push(ev); },
  };
  class FakeEvent { constructor(type, opts) { this.type = type; Object.assign(this, opts || {}); } }
  class FakeFileReader {
    readAsText(file) { this.result = file.__text || ''; if (this.onload) setImmediate(this.onload); }
  }
  const listeners = { document: {}, window: {} };
  const sandbox = {
    console,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    Date,
    Promise,
    URL: undefined, // 探边走 catch → dims 未知 → 放行（内核兜底）
    Event: FakeEvent,
    FileReader: FakeFileReader,
    HTMLTextAreaElement: (function () {
      function T() {}
      Object.defineProperty(T.prototype, 'value', {
        get() { return textarea.value; },
        set(v) { textarea.value = v; },
        configurable: true,
      });
      return T;
    })(),
    document: {
      activeElement: textarea,
      body: null,
      addEventListener(type, fn) { (listeners.document[type] = listeners.document[type] || []).push(fn); },
      querySelector: () => textarea,
    },
  };
  sandbox.window = {
    // 注意不设 __ModuleLoader__ —— loadClient 会并入带捕获的基础 window
    //（此处若覆盖会让 captured 恒为 null）。
    addEventListener(type, fn) { (listeners.window[type] = listeners.window[type] || []).push(fn); },
  };
  return { sandbox, listeners, textarea, dispatched };
}

async function setupApplied() {
  const dom = makeDomSandbox();
  const load = loadClient(PLUGIN, dom.sandbox);
  const kernel = makeKernelConversation();
  const setDraftCalls = [];
  const inputActions = {
    addImages: (ids) => { kernel.lastAdded = ids; return true; },
    setDraft: (text) => { setDraftCalls.push(text); dom.textarea.value = text; },
  };
  const input = { draft: '', imageIds: [] };
  const slotRegistrations = [];
  const ctx = {
    get: (name) => { if (name === 'conversation') return kernel; throw new Error('no service ' + name); },
    slots: {
      inject: (name, fn, label) => { slotRegistrations.push({ name, register: fn, label }); },
      register: (options, component) => ({ options, component }),
    },
  };
  const react = makeReactStub();
  const mod = load.captured.factory(makeRequire({
    react,
    '@deepseek-ai/dsh-client-ui-primitives': { IconPaperclipOutline16: (props) => ({ tag: 'icon', props }) },
  }));
  mod.apply(ctx);
  return {
    ...load, mod, ctx, kernel, inputActions, input, slotRegistrations, react, setDraftCalls,
    dom, textarea: dom.textarea, listeners: dom.listeners, dispatched: dom.dispatched,
    store: load.sandbox.window.__dshFileDropStore,
  };
}

test('e2e: factory 物化 + apply 注册槽位按钮与附件 chip 条（accept 含内核白名单与文本扩展）', async () => {
  const e = await setupApplied();
  assert.equal(e.slotRegistrations.length, 2);
  assert.equal(e.slotRegistrations[0].name, 'conversation.input.left');
  assert.equal(e.slotRegistrations[1].name, 'conversation.input.left');
  // 槽位回调 → ctx.slots.register
  const entry = e.slotRegistrations[0].register();
  assert.equal(entry.options.id, 'dsh-file-drop-attach');
  assert.equal(typeof entry.component, 'function');
  // 渲染组件（hook stub）
  const tree = entry.component({ inputActions: e.inputActions, input: e.input });
  const fileInput = tree.children.find((c) => c.tag === 'input');
  assert.equal(fileInput.props.type, 'file');
  assert.equal(fileInput.props.multiple, true);
  assert.match(fileInput.props.accept, /image\/png/);
  assert.match(fileInput.props.accept, /image\/gif/);
  assert.match(fileInput.props.accept, /\.md/);
  const btn = tree.children.find((c) => c.tag === 'button');
  assert.ok(btn, '应有附件按钮');
  assert.equal(btn.props.disabled, false);
  assert.equal(typeof btn.props.onClick, 'function');
  // 附件 chip 条组件在位（无待发文件时返回 null）。
  const chipsEntry = e.slotRegistrations[1].register();
  assert.equal(chipsEntry.options.id, 'dsh-file-drop-chips');
  assert.equal(typeof chipsEntry.component, 'function');
  assert.equal(chipsEntry.component({ inputActions: e.inputActions, input: e.input }), null);
});

test('e2e: 选 2 图 + 1 文本 + 1 拒绝项 → 官方管道收图、草稿得文本、红字给原因', async () => {
  const e = await setupApplied();
  const entry = e.slotRegistrations[0].register();
  const tree = entry.component({ inputActions: e.inputActions, input: e.input });
  const fileInput = tree.children.find((c) => c.tag === 'input');

  const files = [
    fakeFile('shot.png', 'image/png', 500 * 1024),
    fakeFile('photo.jpg', 'image/jpeg', 900 * 1024),
    { ...fakeFile('note.md', 'text/markdown', 8), __text: '# hi' },
    fakeFile('doc.pdf', 'application/pdf', 8),
    fakeFile('bad.bmp', 'image/bmp', 8),
  ];
  fileInput.props.onChange({ target: { files, value: 'x' } });
  await new Promise((r) => setTimeout(r, 25)); // 探边 promise + FileReader setImmediate

  // 图片：一批 createDraftImages 只收两张白名单图（内核形态），ids 进
  // inputActions.addImages（官方附件栏）；pdf/bmp 不进任何通道。
  assert.deepEqual(e.kernel.calls.create, ['shot.png', 'photo.jpg'], '仅两张白名单图进入官方管道');
  assert.ok(Array.isArray(e.kernel.lastAdded) && e.kernel.lastAdded.length === 2, '两张图 id 进入官方附件栏');

  // 文本：成为附件 chip（内容随发送物化），不再追加草稿
  assert.equal(e.setDraftCalls.length, 0, '文本不再追加草稿');
  const pending = e.store.snapshotPending(e.inputActions);
  assert.deepEqual(Array.from(pending, (x) => x.name), ['note.md'], '文本文件应成为待发附件 chip');
  assert.equal(pending[0].kind, 'text');
  assert.equal(pending[0].content, '# hi');

  // 拒绝项红字：组件 err state（useState stub 只能断言 flashErr 被调——
  // 通过返回树的 error span 不可见，改为断言不抛错且拒绝项未进任何通道。
  assert.equal(e.kernel.lastAdded.length, 2, 'pdf/bmp 不得进入附件栏');
});

test('e2e: 附件随消息发送的载荷 —— serialize 得 base64 image 块（mock 内核 wire）', async () => {
  const e = await setupApplied();
  const entry = e.slotRegistrations[0].register();
  const tree = entry.component({ inputActions: e.inputActions, input: e.input });
  const fileInput = tree.children.find((c) => c.tag === 'input');
  fileInput.props.onChange({ target: { files: [fakeFile('shot.png', 'image/png', 3)], value: 'x' } });
  await new Promise((r) => setTimeout(r, 25));

  // 内核 submit 时对 imageIds 序列化（此处用 mock conversation 演示同一 wire）
  const payload = await e.kernel.serializeDraftImages(e.kernel.lastAdded);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].type, 'image');
  assert.equal(payload[0].mediaType, 'image/png');
  assert.equal(payload[0].data, Buffer.from(new Uint8Array([1, 2, 3]).buffer).toString('base64'));
  assert.equal(payload[0].name, 'shot.png');
});

test('e2e: 壳层 client-file-drop 事件 → 合并路径提示注入仿真输入框', async () => {
  const e = await setupApplied();
  const h = e.listeners.window['client-file-drop'];
  assert.ok(Array.isArray(h) && h.length === 1, '应监听 window client-file-drop');
  e.textarea.value = '请看这些文件\n';
  h[0]({ detail: { files: [
    { path: 'C:\\docs\\设计图.png', name: '设计图.png', size: 2048 },
    { path: 'D:\\work\\笔记.md', name: '笔记.md', size: 30 },
  ] } });
  await new Promise((r) => setTimeout(r, 10));
  assert.match(e.textarea.value, /请看这些文件/);
  assert.match(e.textarea.value, /\[拖入 2 个文件\]/);
  assert.ok(e.textarea.value.includes('C:\\docs\\设计图.png'));
  assert.ok(e.textarea.value.includes('D:\\work\\笔记.md'));
  // 垃圾载荷：静默不抛错、不动输入框
  const before = e.textarea.value;
  h[0]({ detail: { everything: 'broken' } });
  h[0](null);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(e.textarea.value, before);
});

test('e2e: HTML5 drop（内核未接管）白名单图片 → 官方附件管道；双报被去重', async () => {
  const e = await setupApplied();
  // 槽位组件渲染一次让 effect 登记 railEnv（官方管道上下文）。
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, input: e.input });

  const file = fakeFile('dropped.png', 'image/png', 10);
  const dt = {
    types: ['Files'],
    files: [file],
  };
  let prevented = false;
  const ev = {
    dataTransfer: dt,
    defaultPrevented: false, // 内核 ui-attachment 不在场（旧内核形态）
    preventDefault() { prevented = true; this.defaultPrevented = true; },
  };
  e.listeners.document.drop[0](ev);
  assert.ok(prevented, '应阻止浏览器打开文件');
  await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(e.kernel.calls.create, ['dropped.png'], '白名单图片应进官方附件管道');

  // 同一文件再经壳层事件双报（带路径，同 名+大小 键）→ 不得重复注入。
  e.listeners.window['client-file-drop'][0]({ detail: { files: [{ path: 'C:\\x\\dropped.png', name: 'dropped.png', size: 10 }] } });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(!e.textarea.value.includes('完整路径：C:\\x\\dropped.png'), '双报条目应被去重，不注入路径提示');
});

test('e2e: HTML5 drop（内核已接管 defaultPrevented）白名单图片让位，不双加', async () => {
  const e = await setupApplied();
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, input: e.input });
  const ev = {
    dataTransfer: { types: ['Files'], files: [fakeFile('took.png', 'image/png', 10)] },
    defaultPrevented: true, // 内核 ui-attachment 已 preventDefault 并收图
    preventDefault() {},
  };
  e.listeners.document.drop[0](ev);
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(e.kernel.calls.create.length, 0, '内核已接管的图片不得再加一次');
  assert.ok(!e.textarea.value.includes('took.png'), '也不注入路径提示');
});

test('e2e: HTML5 drop 文本文件 → 附件 chip（内容随发送物化，不再注入输入框）', async () => {
  const e = await setupApplied();
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, input: e.input });
  const file = { ...fakeFile('readme.md', 'text/markdown', 5), __text: 'hello-dropped' };
  e.listeners.document.drop[0]({
    dataTransfer: { types: ['Files'], files: [file] },
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(e.textarea.value, '', '不再注入内容进输入框');
  const pending = e.store.snapshotPending(e.inputActions);
  assert.deepEqual(Array.from(pending, (x) => x.name), ['readme.md']);
  assert.equal(pending[0].kind, 'text');
  assert.equal(pending[0].content, 'hello-dropped');
});

test('纯逻辑：materializePending 小内容 / 大路径（发送时物化）', () => {
  const text = core.makePendingTextEntry('a.md', 5, '', 'hello');
  assert.equal(text.kind, 'text');
  const path = core.makePendingTextEntry('big.md', 5, 'C:\\big.md', 'x'.repeat(300 * 1024)); // 超 TEXT_MAX_BYTES → path
  assert.equal(path.kind, 'path');
  assert.equal(path.path, 'C:\\big.md');
  const bin = core.makePendingPathEntry('b.zip', 10, 'C:\\b.zip');
  assert.equal(bin.kind, 'path');
  // 物化：小内容内联成附件注释块；大/二进制给路径提示。
  const out = core.materializePending([text, path, bin]);
  assert.match(out, /<!-- 附件：a\.md -->\nhello/);
  assert.match(out, /完整路径：C:\\big\.md/);
  assert.match(out, /完整路径：C:\\b\.zip/);
});

test('e2e: 发送物化（点击路径）—— 包装 submit 把 chip 内容写进草稿并清空', async () => {
  const e = await setupApplied();
  let submitted = null;
  e.inputActions.submit = function () { submitted = e.textarea.value; };
  // 渲染 AttachButton（React stub 同步跑 effect → 安装 submit 包装 + keydown 监听）
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, input: e.input });
  e.store.addPending(e.inputActions, e.mod.core.makePendingTextEntry('a.md', 5, '', 'hello-file'));
  assert.equal(e.store.snapshotPending(e.inputActions).length, 1, 'chip 已入列');
  // 点击发送按钮 → 走包装后的 submit
  e.inputActions.submit();
  assert.match(submitted, /<!-- 附件：a\.md -->\nhello-file/, '草稿应包含文件内容');
  assert.equal(e.store.snapshotPending(e.inputActions).length, 0, 'chip 应被清空');
});

test('e2e: 发送物化（回车路径）—— 捕获阶段 keydown 把 chip 内容写进草稿并清空', async () => {
  const e = await setupApplied();
  e.inputActions.submit = function () {}; // 使守卫通过（setupApplied 的 mock 无 submit）
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, input: e.input });
  e.store.addPending(e.inputActions, e.mod.core.makePendingTextEntry('b.md', 5, '', 'world-file'));
  const h = e.listeners.document.keydown;
  assert.ok(Array.isArray(h) && h.length >= 1, '应注册 keydown 捕获监听');
  // 回车发送：捕获阶段先物化，React 回车处理器随后 submit 才读得到草稿。
  h[0]({ key: 'Enter' });
  assert.match(e.textarea.value, /<!-- 附件：b\.md -->\nworld-file/, '草稿应包含文件内容');
  assert.equal(e.store.snapshotPending(e.inputActions).length, 0, 'chip 应被清空');
});

// ---------------------------------------------------------------------------
// 3) dsh-image-paste 让位回归（defaultPrevented 不再走桥存盘）
// ---------------------------------------------------------------------------

test('image-paste: defaultPrevented 的粘贴让位原生管道；未接管时维持降级', async () => {
  const dom = makeDomSandbox();
  const saved = [];
  dom.sandbox.window.dshDesktop = {
    imagePaste: {
      save: async (payload) => { saved.push(payload); return { ok: true, path: 'C:\\tmp\\p.png', size: 5 }; },
    },
    getPathForFile: () => '',
  };
  class FileReaderDataUrl {
    readAsDataURL() { this.result = 'data:image/png;base64,AAA'; if (this.onload) setImmediate(this.onload); }
  }
  dom.sandbox.FileReader = FileReaderDataUrl;
  const load = loadClient(PASTE_PLUGIN, dom.sandbox);
  const mod = load.captured.factory(makeRequire({}));
  mod.apply({});

  const pngFile = { name: 'p.png', size: 5, type: 'image/png' };
  const mkEvent = (prevented) => ({
    defaultPrevented: prevented,
    clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => pngFile }], getData: () => '' },
  });

  e_fire_prevented: {
    dom.listeners.document.paste[0](mkEvent(true)); // 内核原生已接手
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(saved.length, 0, 'defaultPrevented 时不得再走桥存盘（防双重处理）');
  }
  dom.listeners.document.paste[0](mkEvent(false)); // 原生未接手（焦点不在输入框等）
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(saved.length, 1, '降级路径仍应保存粘贴图');
  assert.match(saved[0].dataUrl, /^data:image\/png;base64,/);
  assert.match(dom.textarea.value, /\[粘贴图片\]/, '提示应落进输入框（旧内核 textarea 通道）');
  assert.match(dom.textarea.value, /完整路径：C:\\tmp\\p\.png/, '提示应带可分析的完整路径');
});

// ---------------------------------------------------------------------------
// 4) rc8 契约自检：本插件的 require 面落在种子表内
// ---------------------------------------------------------------------------

test('rc8 契约: dsh-file-drop client 的 require 全部在 rc8 种子表', () => {
  const RC8_SEED = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives'];
  const src = fs.readFileSync(PLUGIN, 'utf8');
  const specs = [...src.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2]);
  assert.ok(specs.length >= 2, `应扫描到 require（react + ui-primitives），实际 ${specs.length}`);
  for (const spec of specs) {
    assert.ok(RC8_SEED.includes(spec), `require("${spec}") 不在 rc8 种子表（#124 形态）`);
  }
  assert.ok(specs.includes('react'), '应有 react 依赖（按钮组件）');
});

// ---------------------------------------------------------------------------
// 5) 当前内核契约回归（槽位只下发 hook + composer 是 contenteditable）
//    本族缺陷：内核换代后 conversation.input.left 不再直下 input 快照，
//    props.input 恒 undefined → railCount 恒 0（张数前置拦截失效）、
//    草稿前缀读不到 → 发送时把用户正文直接擦掉（静默丢数据）。
// ---------------------------------------------------------------------------

test('纯逻辑：distillInput/parseInputMirror 往返，含草稿内嵌分隔符与空面容忍', () => {
  const c = captured.factory(makeRequire({ react: makeReactStub() })).core;
  assert.equal(c.distillInput(null), '');
  assert.equal(c.distillInput(undefined), '');
  assert.equal(c.parseInputMirror(''), null);
  assert.equal(c.parseInputMirror('无分隔符'), null);
  const mirror = c.distillInput({ phase: 'plain', draft: '你好\n第二行', imageIds: ['a', 'b', 'c'] });
  const back = c.parseInputMirror(mirror);
  assert.equal(back.draft, '你好\n第二行');
  assert.equal(back.imageCount, 3);
  assert.equal(back.phase, 'plain');
  // 草稿里出现分隔符也不能丢内容（按剩余段无损回填）。
  const nasty = c.distillInput({ phase: 'plain', draft: 'x\u0000y\u0000z', imageIds: [] });
  assert.equal(c.parseInputMirror(nasty).draft, 'x\u0000y\u0000z');
  assert.equal(c.parseInputMirror(nasty).imageCount, 0);
  // imageIds 非数组（异形快照）不能抛错。
  assert.equal(c.parseInputMirror(c.distillInput({ phase: 'plain', draft: '', imageIds: null })).imageCount, 0);
});

test('e2e: 当前内核（无 props.input，只有 useInput）→ 附件栏张数经镜像进限额裁决', async () => {
  const e = await setupApplied();
  // 栏内已有 18 张：单条消息上限 20 → 再选 3 张只能收 2 张。
  // 旧代码（只看 props.input）会算成 0 张 → 3 张全收，即本用例的反面。
  const state = { phase: 'plain', draft: '', imageIds: Array.from({ length: 18 }, (_, i) => 'img' + i) };
  const useInput = (sel) => sel(state);
  const entry = e.slotRegistrations[0].register();
  const tree = entry.component({ inputActions: e.inputActions, useInput });
  const fileInput = tree.children.find((c) => c.tag === 'input');
  fileInput.props.onChange({
    target: { files: [fakeFile('a.png', 'image/png', 10), fakeFile('b.png', 'image/png', 10), fakeFile('c.png', 'image/png', 10)] },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(e.kernel.calls.create.length, 2, '18+3 超单条 20 张上限，应只进 2 张');
});

test('e2e: 当前内核（无 props.input）→ 发送物化保留用户正文（草稿经 useInput 镜像）', async () => {
  const e = await setupApplied();
  e.inputActions.submit = function () {};
  const state = { phase: 'plain', draft: '用户已输入的正文', imageIds: [] };
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, useInput: (sel) => sel(state) });
  e.store.addPending(e.inputActions, e.mod.core.makePendingTextEntry('a.md', 5, '', 'hello'));
  const domBefore = e.textarea.value;
  e.inputActions.submit();
  const last = e.setDraftCalls[e.setDraftCalls.length - 1];
  assert.ok(/^用户已输入的正文\n<!-- 附件：a\.md -->/m.test(last), `草稿应以用户正文开头，实际：${JSON.stringify(last)}`);
  // 权威坐标系：快照 draft 优先于 DOM（submit 前 DOM 桩为空，若 DOM 优先会丢前缀）。
  assert.equal(domBefore, '', '写入前 textarea 桩为空，证明前缀来自快照镜像而非 DOM');
});

test('e2e: 快照 draft 为空时回落 DOM 实时值（旧内核/镜像缺席零回归）', async () => {
  const e = await setupApplied();
  e.textarea.value = 'DOM里的正文';
  e.inputActions.submit = function () {};
  const state = { phase: 'plain', draft: '', imageIds: [] };
  const entry = e.slotRegistrations[0].register();
  entry.component({ inputActions: e.inputActions, useInput: (sel) => sel(state) });
  e.store.addPending(e.inputActions, e.mod.core.makePendingTextEntry('a.md', 5, '', 'x'));
  e.inputActions.submit();
  assert.match(e.setDraftCalls[e.setDraftCalls.length - 1], /^DOM里的正文\n/);
});

test('injectIntoComposer: contenteditable 走 insertText 并回读校验；写不进必报失败', () => {
  const calls = [];
  const ce = {
    tagName: 'DIV', isContentEditable: true, textContent: '旧内容', value: undefined,
    focus() { calls.push('focus'); }, dispatchEvent() {},
  };
  const sandbox = {
    console,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    Date, Promise,
    Event: class { constructor(type, opts) { this.type = type; Object.assign(this, opts || {}); } },
    HTMLTextAreaElement: function T() {},
    document: {
      activeElement: null,
      querySelector: () => null,
      addEventListener() {},
      createRange: () => ({ selectNodeContents() {}, collapse() {} }),
      execCommand: (cmd, ui, val) => { calls.push(cmd + ':' + val); ce.textContent += val; return true; },
    },
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  };
  const load = loadClient(PLUGIN, sandbox);
  const c = load.captured.factory(makeRequire({ react: makeReactStub() })).core;
  assert.equal(c.injectIntoComposer(ce, '新片段'), true, 'insertText 落上且回读命中 → true');
  assert.ok(ce.textContent.includes('新片段'), 'contenteditable 应经 insertText 累加而非覆写');
  assert.ok(ce.textContent.startsWith('旧内容'), '已有内容不得被劈开/丢掉');
  // 写不进（execCommand 失败）必须给 false —— 静默“假装成功”就是上一代缺陷的病灶。
  sandbox.document.execCommand = () => false;
  assert.equal(c.injectIntoComposer({ tagName: 'DIV', isContentEditable: true, textContent: '', focus() {} }, '片段'), false);
  // execCommand 抛错（部分内核不允许）同样降级为 false，不外溢。
  sandbox.document.execCommand = () => { throw new Error('not allowed'); };
  assert.equal(c.injectIntoComposer({ tagName: 'DIV', isContentEditable: true, textContent: '', focus() {} }, '片段'), false);
});

// ---------------------------------------------------------------------------
// 6) dsh-image-paste 当前内核回归：composer 是 contenteditable，
//    旧实现拿 textarea 原型 setter 打在 <div> 上抛 TypeError 被 .catch 吞掉，
//    表现为「粘图后输入框丝毫没有反应且无任何提示」。
// ---------------------------------------------------------------------------

test('image-paste: 当前内核 contenteditable composer → 提示经 insertText 落上；写不上给可见提示', async () => {
  const ce = { tagName: 'DIV', isContentEditable: true, textContent: '', value: undefined, focus() {}, dispatchEvent() {} };
  let execOk = true;
  let noticeHost = null;
  const listeners = { document: {} };
  const sandbox = {
    console,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
    Date, Promise,
    Event: class { constructor(type, opts) { this.type = type; Object.assign(this, opts || {}); } },
    HTMLTextAreaElement: function T() {},
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,AAA'; if (this.onload) setImmediate(this.onload); } },
    document: {
      // 真实粘贴时焦点常在 body 而非输入框 —— 旧实现因此第二步就找不到 composer。
      activeElement: null,
      body: { appendChild() {} },
      createElement: () => { noticeHost = { setAttribute() {}, style: {}, textContent: '' }; return noticeHost; },
      getElementById: () => null,
      addEventListener(type, fn) { (listeners.document[type] = listeners.document[type] || []).push(fn); },
      querySelector: (sel) => (sel === '[data-composer-input]' ? ce : null),
      createRange: () => ({ selectNodeContents() {}, collapse() {} }),
      execCommand: (cmd, ui, val) => { if (!execOk || cmd !== 'insertText') return false; ce.textContent += val; return true; },
    },
    window: {
      getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      dshDesktop: { imagePaste: { save: async () => ({ ok: true, path: 'C:\\tmp\\p.png', size: 5 }) } },
    },
  };
  const load = loadClient(PASTE_PLUGIN, sandbox);
  const mod = load.captured.factory(makeRequire({}));
  mod.apply({});
  const fire = () => listeners.document.paste[0]({
    defaultPrevented: false,
    clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => ({ name: 'p.png', size: 5, type: 'image/png' }) }], getData: () => '' },
  });

  fire();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(ce.textContent, /\[粘贴图片\]/, 'contenteditable 上应经 insertText 落上提示');
  assert.match(ce.textContent, /完整路径：C:\\tmp\\p\.png/, '路径主体不得丢');

  // 写不上（insertText 失败）→ 必须给可见提示，不再静默吞。
  ce.textContent = '';
  execOk = false;
  fire();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ce.textContent, '', 'insertText 失败时不应假装写入了内容');
  assert.ok(noticeHost && /没能写进输入框/.test(noticeHost.textContent), `应弹可见提示，实际：${noticeHost && noticeHost.textContent}`);
});
