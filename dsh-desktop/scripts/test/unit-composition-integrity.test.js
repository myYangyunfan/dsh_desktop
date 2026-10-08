'use strict';

// composition-integrity 单元测试（node --test）。
// 覆盖：正常 payload 全在位 → ok；挖掉一个包目录 → package-missing 检出且
// 退出语义非 0；包损坏（package.json 解析失败）→ package-corrupt；yml 坏行
// 容错（不中断全量扫描、记 parseIssues）；@scope/名 与子路径名 → node_modules
// 路径映射；关键服务行整个缺失（row-missing）；CLI 入口退出码契约。
//
// 背景（K2 防线）：Loader 故障隔离让单 entry 激活失败静默降级，本模块的静态
// 探测要在启动前把「组合关键服务缺席」变成可见的显式报告。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  criticalServices,
  parseServiceRows,
  packageNameOf,
  checkServicePresence,
  cliMain,
  SERVICE_STATUS,
} = require('../integration/composition-integrity');

// ---------------------------------------------------------------------------
// 夹具：构造一个「关键服务全在位」的最小 payload。node_modules 下放置两个组合
// bundle（dsh-base / dsh-web-app 的 cordis.patch.yml）+ 各服务行对应的包目录
// （package.json 仅需可解析）。不引入对真实 payload 的路径依赖，测试自包含。
// ---------------------------------------------------------------------------

/** 写一个可解析的包目录。 */
function writePkg(nmRoot, pkgName, obj = { name: pkgName, version: '0.0.0' }) {
  const dir = path.join(nmRoot, ...pkgName.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(obj));
  return dir;
}

/** 最小组合 yml：含关键行 + 覆写行 + @scope 子路径名 + 平台禁用行。 */
const BASE_YML = [
  '- insert:',
  "    - id: timer",
  "      name: '@deepseek-ai/cordis-plugin-timer'",
  '',
  "    - id: credentials",
  "      name: '@deepseek-ai/dsh-credentials-local'",
  '',
  "    - id: settings",
  "      name: '@deepseek-ai/dsh-settings-file'",
  '',
  "    - id: session",
  "      name: '@deepseek-ai/dsh-session'",
  '',
  '    # 坏行容错样例：列表项缺 id（记 parseIssue，不中断扫描）',
  "    - name: '@deepseek-ai/orphan-row'",
  '',
  "    - id: tool-subagent-list-agents",
  "      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'",
  '',
  "    - id: tool-bash",
  "      name: '@deepseek-ai/dsh-tool-bash'",
  '      disabled: !!js process.platform === \'win32\'',
  '',
].join('\n');

const WEB_YML = [
  '- id: system-prompt',
  '  config:',
  '    persona: >-      # 覆写行（无 name）：不引入包',
  "      You are a coding agent.",
  '',
  '- insert:',
  "    - id: web-runtime",
  "      name: '@deepseek-ai/dsh-web-app'",
  '',
  "    - id: plugin-inventory",
  "      name: '@deepseek-ai/dsh-host-plugin-inventory'",
  '',
  "    - id: webserver",
  "      name: '@deepseek-ai/dsh-host-webserver'",
  '',
].join('\n');

/** 组装「全在位」payload 根。返回 {root, nm}。 */
function buildHealthyPayload(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-comp-integrity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, 'node_modules');
  // 组合源包（yml + package.json）。
  const baseDir = writePkg(nm, '@deepseek-ai/dsh-base');
  fs.writeFileSync(path.join(baseDir, 'cordis.patch.yml'), BASE_YML);
  const webDir = writePkg(nm, '@deepseek-ai/dsh-web-app');
  fs.writeFileSync(path.join(webDir, 'cordis.patch.yml'), WEB_YML);
  // 服务行声明的全部包在位。
  for (const pkg of [
    '@deepseek-ai/cordis-plugin-timer',
    '@deepseek-ai/dsh-credentials-local',
    '@deepseek-ai/dsh-settings-file',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-tool-subagent-control', // 子路径名的本体包
    '@deepseek-ai/dsh-tool-bash',
    '@deepseek-ai/dsh-host-plugin-inventory',
    '@deepseek-ai/dsh-host-webserver',
  ]) writePkg(nm, pkg);
  return { root, nm };
}

// 测试注入用的精简关键清单：只覆盖夹具里实际声明/期望的行，避免夹具需铺满
// 全部 16 项生产关键服务。
const FIXTURE_CRITICAL = [
  { rowId: 'credentials', moduleName: '@deepseek-ai/dsh-credentials-local', label: '凭据服务', consequence: '保存/读取 API key 失败（保存 key 时报 "credentials service is absent"）' },
  { rowId: 'settings', moduleName: '@deepseek-ai/dsh-settings-file', label: '设置文档', consequence: '设置不生效' },
  { rowId: 'session', moduleName: '@deepseek-ai/dsh-session', label: '会话域', consequence: '无法对话' },
  { rowId: 'plugin-inventory', moduleName: '@deepseek-ai/dsh-host-plugin-inventory', label: '插件清单服务', consequence: '清单无数据' },
  { rowId: 'webserver', moduleName: '@deepseek-ai/dsh-host-webserver', label: '本地服务端口', consequence: '白屏' },
  { rowId: 'web-runtime', moduleName: '@deepseek-ai/dsh-web-app', label: 'Web 运行时 bundle', consequence: '启动失败' },
  { rowId: 'base-bundle', moduleName: '@deepseek-ai/dsh-base', label: '基础组合 bundle', consequence: '启动失败' },
];

function checkFixture(root, overrides = {}) {
  return checkServicePresence(root, {
    sources: [
      { bundle: 'dsh-base', name: '@deepseek-ai/dsh-base', file: 'cordis.patch.yml' },
      { bundle: 'dsh-web-app', name: '@deepseek-ai/dsh-web-app', file: 'cordis.patch.yml' },
    ],
    critical: FIXTURE_CRITICAL,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------

test('criticalServices：清单非空且带缺席后果文案', () => {
  const list = criticalServices();
  assert.ok(list.length >= 10, '关键服务清单应覆盖主要哑火面');
  for (const s of list) {
    assert.ok(s.rowId && s.moduleName && s.label && s.consequence, '每项需含 rowId/moduleName/label/consequence');
  }
  const cred = list.find((s) => s.rowId === 'credentials');
  assert.equal(cred.moduleName, '@deepseek-ai/dsh-credentials-local');
  assert.ok(cred.consequence.includes('credentials service is absent'), 'credentials 后果文案应指向已知报错');
  // 快照防回归：返回的是副本，外部不得污染内部清单。
  list[0].rowId = 'mutated';
  assert.notEqual(criticalServices()[0].rowId, 'mutated');
});

// issue #175 表自锁（原锁在 rv9 的 plugin-manager 健康卡一节；该伴随件 v1.0.0
// 退役、源目录删除后，判据收敛到清单本身）：网关行必须按**实际挂载键**登记。
// 旧键 api-gateway / @deepseek-ai/dsh-host-apiproxy 是重构前命名，拿它查 live
// 注册表永远缺席 → 网关永久误报红条（现键见 dsh-base/cordis.patch.yml 的 typert-gateway 行）。
test('criticalServices：网关行走实际挂载键 typert-gateway（#175 防漂移）', () => {
  const gatewayRowOk = (list) =>
    list.some((s) => s.rowId === 'typert-gateway' && s.moduleName === '@deepseek-ai/dsh-api-gateway')
    && !list.some((s) => s.rowId === 'api-gateway' || s.moduleName === '@deepseek-ai/dsh-host-apiproxy');

  assert.ok(gatewayRowOk(criticalServices()), '现表必须按 typert-gateway + dsh-api-gateway 登记');

  // 反证（防恒真判据）：旧键形态必须被同一判据判红。
  assert.equal(gatewayRowOk([
    { rowId: 'api-gateway', moduleName: '@deepseek-ai/dsh-host-apiproxy' },
  ]), false, '判据对旧网关键形态必须不放过');
  assert.equal(gatewayRowOk([
    { rowId: 'typert-gateway', moduleName: '@deepseek-ai/dsh-host-apiproxy' },
  ]), false, '判据对「行 id 已迁但包名回退」的半迁形态必须不放过');
  assert.equal(gatewayRowOk([]), false, '判据对「网关行整体缺席」必须不放过');
});

test('packageNameOf：@scope/名、子路径、裸名映射', () => {
  assert.equal(packageNameOf('@deepseek-ai/dsh-web-app/startup'), '@deepseek-ai/dsh-web-app');
  assert.equal(packageNameOf('@deepseek-ai/dsh-tool-subagent-control/list-agents'), '@deepseek-ai/dsh-tool-subagent-control');
  assert.equal(packageNameOf('@deepseek-ai/dsh-base'), '@deepseek-ai/dsh-base');
  assert.equal(packageNameOf('dsh-web-app'), 'dsh-web-app');
  assert.equal(packageNameOf('dsh-web-app/lib/x'), 'dsh-web-app');
  assert.equal(packageNameOf('@scope'), null, '裸 @scope 是坏名');
  assert.equal(packageNameOf(''), null);
  assert.equal(packageNameOf(null), null);
});

test('parseServiceRows：服务行/覆写行/禁用声明解析 + 坏行容错', () => {
  const { rows, parseIssues } = parseServiceRows(BASE_YML, 'fixture');
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  assert.equal(byId.get('credentials').name, '@deepseek-ai/dsh-credentials-local');
  assert.equal(byId.get('tool-subagent-list-agents').name, '@deepseek-ai/dsh-tool-subagent-control/list-agents');
  assert.ok(String(byId.get('tool-bash').disabled).includes('process.platform'), 'disabled 表达式应被捕获');
  // 坏行（- name: 缺 id）不产生服务行，但计入 parseIssues，不中断扫描。
  assert.ok(!rows.some((r) => r.name === '@deepseek-ai/orphan-row'), '缺 id 的列表项不得成为服务行');
  assert.ok(parseIssues.some((p) => p.reason === 'list item without id'), '坏行应记 parseIssue');
  // 覆写行（web yml 顶层 - id: system-prompt，无 name）。
  const web = parseServiceRows(WEB_YML, 'fixture');
  const sys = web.rows.find((r) => r.rowId === 'system-prompt');
  assert.ok(sys, '顶层覆写行应被解析');
  assert.equal(sys.name, null, '覆写行无 name');
});

test('checkServicePresence：正常 payload 全在位 → ok，覆写行不计缺席', (t) => {
  const { root } = buildHealthyPayload(t);
  const report = checkFixture(root);
  assert.equal(report.ok, true, '全在位应 ok，实缺: ' + JSON.stringify(report.criticalMissing.map((s) => s.rowId)));
  assert.deepEqual(report.criticalMissing, []);
  const cred = report.services.find((s) => s.rowId === 'credentials');
  assert.equal(cred.status, SERVICE_STATUS.PRESENT);
  // 覆写行标记 override-row，不误报缺席。
  const sys = report.services.find((s) => s.rowId === 'system-prompt');
  assert.equal(sys.status, SERVICE_STATUS.OVERRIDE);
  // 子路径名映射到本体包目录。
  const sub = report.services.find((s) => s.rowId === 'tool-subagent-list-agents');
  assert.equal(sub.package, '@deepseek-ai/dsh-tool-subagent-control');
  assert.equal(sub.status, SERVICE_STATUS.PRESENT);
  // 受保护 bundle 容器：源在位即视为在位。
  assert.equal(report.services.find((s) => s.rowId === 'base-bundle').status, SERVICE_STATUS.PRESENT);
  assert.equal(report.services.find((s) => s.rowId === 'web-runtime').status, SERVICE_STATUS.PRESENT);
});

test('checkServicePresence：挖掉一个包目录 → package-missing 检出 + ok=false', (t) => {
  const { root, nm } = buildHealthyPayload(t);
  fs.rmSync(path.join(nm, '@deepseek-ai', 'dsh-credentials-local'), { recursive: true, force: true });
  const report = checkFixture(root);
  assert.equal(report.ok, false, '关键服务包缺失应判 not ok');
  const missing = report.criticalMissing.find((s) => s.rowId === 'credentials');
  assert.ok(missing, 'credentials 应在 criticalMissing');
  assert.equal(missing.status, SERVICE_STATUS.PKG_MISSING);
  assert.ok(missing.consequence.includes('credentials service is absent'));
  // 非关键行同样被静态层记录（可观测，不影响退出语义）。
  fs.rmSync(path.join(nm, '@deepseek-ai', 'cordis-plugin-timer'), { recursive: true, force: true });
  const report2 = checkFixture(root);
  assert.equal(report2.services.find((s) => s.rowId === 'timer').status, SERVICE_STATUS.PKG_MISSING);
});

test('checkServicePresence：package.json 解析失败 → package-corrupt', (t) => {
  const { root, nm } = buildHealthyPayload(t);
  const pj = path.join(nm, '@deepseek-ai', 'dsh-settings-file', 'package.json');
  fs.writeFileSync(pj, '{ this is not json !!!');
  const report = checkFixture(root);
  assert.equal(report.ok, false);
  const corrupt = report.criticalMissing.find((s) => s.rowId === 'settings');
  assert.ok(corrupt, 'settings 应在 criticalMissing');
  assert.equal(corrupt.status, SERVICE_STATUS.PKG_CORRUPT);
  assert.ok(corrupt.reason.includes('parse failed'), '损坏原因应含解析失败细节');
  // package.json 整个缺失同判 corrupt。
  fs.rmSync(pj, { force: true });
  const report2 = checkFixture(root);
  assert.equal(report2.services.find((s) => s.rowId === 'settings').status, SERVICE_STATUS.PKG_CORRUPT);
});

test('checkServicePresence：yml 坏行容错（不中断）+ 关键行整个缺失 → row-missing', (t) => {
  const { root, nm } = buildHealthyPayload(t);
  // 从 base yml 里删掉 settings 行（模拟解析树缺行/被静默降级后的形态）。
  const baseYml = path.join(nm, '@deepseek-ai', 'dsh-base', 'cordis.patch.yml');
  const lines = fs.readFileSync(baseYml, 'utf8').split('\n');
  const idx = lines.findIndex((l) => /- id: settings/.test(l));
  const nameIdx = lines.findIndex((l) => /name: '@deepseek-ai\/dsh-settings-file'/.test(l));
  assert.ok(idx >= 0 && nameIdx === idx + 1, '夹具行序符合预期');
  lines.splice(idx, 2);
  fs.writeFileSync(baseYml, lines.join('\n'));
  // 再塞一行坏行（非列表、非注释的顶层杂项由容错忽略；用缺 id 列表项触发 parseIssue）。
  fs.appendFileSync(baseYml, "    - name: '@deepseek-ai/broken-row'\n");
  const report = checkFixture(root);
  assert.equal(report.ok, false);
  const rowMissing = report.criticalMissing.find((s) => s.rowId === 'settings');
  assert.ok(rowMissing, 'settings 行缺失应检出 row-missing');
  assert.equal(rowMissing.status, SERVICE_STATUS.ROW_MISSING);
  assert.equal(report.parseIssues.length, 2, '坏行（base 原 1 + 追加 1）均应记录且不中断');
  // 其余关键服务不受坏行影响。
  assert.equal(report.services.find((s) => s.rowId === 'credentials').status, SERVICE_STATUS.PRESENT);
});

test('checkServicePresence：组合源文件缺失 → bundle 级 row-missing（致命）', (t) => {
  const { root, nm } = buildHealthyPayload(t);
  fs.rmSync(path.join(nm, '@deepseek-ai', 'dsh-base', 'cordis.patch.yml'), { force: true });
  const report = checkFixture(root);
  assert.equal(report.ok, false);
  assert.equal(report.criticalMissing.find((s) => s.rowId === 'base-bundle').status, SERVICE_STATUS.ROW_MISSING);
  // 源缺失后其中声明的关键行也全部缺席。
  assert.ok(report.criticalMissing.some((s) => s.rowId === 'credentials'));
  assert.equal(report.sources.find((s) => s.bundle === 'dsh-base').present, false);
});

test('cliMain：退出码非 0 当且仅当关键服务缺席；JSON 可解析', (t) => {
  const { root } = buildHealthyPayload(t);
  // 注入夹具级关键清单（CLI 契约测试不依赖生产 16 项清单全铺）。
  const deps = { checkServicePresence: (dir) => checkFixture(dir) };
  // 健康 → 0。拦截 stdout（CLI 写 JSON 到 stdout）。
  const origWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stdout.write = (chunk) => { captured += String(chunk); return true; };
  try {
    assert.equal(cliMain(['--app-dir', root], deps), 0);
    const healthy = JSON.parse(captured);
    assert.equal(healthy.ok, true);
    // 挖掉 credentials 包 → 1，且 JSON 标出缺席。
    const nm = path.join(root, 'node_modules');
    fs.rmSync(path.join(nm, '@deepseek-ai', 'dsh-credentials-local'), { recursive: true, force: true });
    captured = '';
    assert.equal(cliMain(['--payload-dir', root], deps), 1, '--payload-dir 别名同义');
    const broken = JSON.parse(captured);
    assert.equal(broken.ok, false);
    assert.ok(broken.criticalMissing.some((s) => s.rowId === 'credentials'));
    // 用法错误 → 2（唯一允许的另一非 0 退出）。
    assert.equal(cliMain([], deps), 2);
  } finally {
    process.stdout.write = origWrite;
  }
});

test('真实 vendored 组合源冒烟（若 payload 在位）：全部关键服务 present', { skip: false }, (t) => {
  // 只读冒烟：对仓库内已装配 payload（dsh-tauri/package-payload/dsh-desktop）
  // 跑生产清单探测。payload 缺失（未装配）时跳过，不算失败。
  const payload = path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop');
  if (!fs.existsSync(path.join(payload, 'node_modules', '@deepseek-ai', 'dsh-base', 'cordis.patch.yml'))) {
    t.skip('payload 未装配，跳过真实冒烟');
    return;
  }
  const report = checkServicePresence(payload);
  assert.equal(report.ok, true, '生产关键服务缺席: ' + JSON.stringify(report.criticalMissing, null, 2));
});

test('preflight 挂钩：组合源在位且关键缺席 → 告警 + report.composition；无组合源 → 形状不变', (t) => {
  const { preflight } = require('../integration/fault-isolation');
  // 场景 A：真实 payload 在位时，preflight 内部组合探测生效（健康 → 无额外
  // 输出、返回形状无 composition 键）。用真实 payload 的 appDir + 空 home。
  const payload = path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop');
  const payloadReady = fs.existsSync(path.join(payload, 'node_modules', '@deepseek-ai', 'dsh-base', 'cordis.patch.yml'));
  if (payloadReady) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pf-empty-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const profileDir = path.join(home, 'profiles', 'web');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }));
    const logsA = [];
    const reportA = preflight({ home, appDir: payload, userDataDir: home, log: (m) => logsA.push(m) });
    assert.equal(reportA.scanned, 0, '无 nm 根时 scanned=0（bundles 空）');
    assert.equal('composition' in reportA, false, '健康路径不得附加 composition 键');
    assert.equal(logsA.length, 0, '健康路径不得输出组合告警');
  }
  // 场景 B：appDir 无组合源（测试夹具/空 home）→ 组合探测门控关闭，零输出；
  // K1 compositionPreflight 合入后 composition 字段常驻（空三列表 + 空
  // criticalMissing），形状为 {scanned,unpatched,composition}。
  const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pf-nosrc-'));
  t.after(() => fs.rmSync(home2, { recursive: true, force: true }));
  const profileDir2 = path.join(home2, 'profiles', 'web');
  fs.mkdirSync(profileDir2, { recursive: true });
  fs.writeFileSync(path.join(profileDir2, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['fake'] } } }));
  const logsB = [];
  const reportB = preflight({ home: home2, appDir: home2, userDataDir: home2, log: (m) => logsB.push(m) });
  assert.deepEqual(Object.keys(reportB).sort(), ['composition', 'scanned', 'unpatched'], '无组合源时形状为 {scanned,unpatched,composition(空)}');
  assert.deepEqual(reportB.composition, { checked: [], repaired: [], broken: [], criticalMissing: [] }, '无组合源时 composition 四列表全空');
  assert.equal(logsB.length, 0, '无组合源时不得输出组合告警');
  // 场景 C：组合源在位但关键包被挖掉 → 告警行 + composition 附加（复制一份
  // payload 的最小影子：只建 node_modules/@deepseek-ai/dsh-base/cordis.patch.yml
  // + 一个包，其余关键行自然缺席）。
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pf-shadow-'));
  t.after(() => fs.rmSync(shadow, { recursive: true, force: true }));
  const shadowNm = path.join(shadow, 'node_modules', '@deepseek-ai', 'dsh-base');
  fs.mkdirSync(shadowNm, { recursive: true });
  fs.writeFileSync(path.join(shadowNm, 'cordis.patch.yml'), "    - id: credentials\n      name: '@deepseek-ai/dsh-credentials-local'\n");
  const logsC = [];
  const reportC = preflight({ home: home2, appDir: shadow, userDataDir: home2, log: (m) => logsC.push(m) });
  // K1+K2 融合形态：criticalMissing 非空即关键缺席（不再用 ok 布尔）。
  assert.ok(reportC.composition && reportC.composition.criticalMissing.length > 0, '关键缺席时 composition.criticalMissing 应非空');
  assert.ok(reportC.composition.criticalMissing.some((m) => m.rowId === 'credentials'), 'credentials 缺包应在 composition 中');
  assert.ok(logsC.some((l) => l.includes('组合关键服务缺席') && l.includes('credentials')), '应输出 credentials 缺席告警行');
  assert.ok(logsC.some((l) => l.includes('重启 DSH Desktop')), '应输出修复建议行');
});
