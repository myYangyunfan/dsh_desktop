'use strict';

// 插件 peer 下限 ↔ pin 内核运行版本 的机器锁（node --test）。
//
// 为什么需要这条守卫：DSH-0.2.0-RC1-01 —— 内核 0.1.0-rc.1 起在 profile 装载阶段按
// peerDependencies 做硬性兼容判定，不满足的行被**静默** `disabled: true`，stderr 只留
// 一行 `dsh: disabling profile plugin row "<id>"`。症状是「插件页里它在、界面却没有」，
// 用户侧完全无从定位，而我们的 boot 链与插件同步全是绿的。
// 0.2.0-rc.2 舰队实测有 2 条踩线（billion-context-dsh 的 `>=0.1.5-alpha.1 <0.1.6-0`、
// dsh-better-sidebar 的 14 条 `^0.1.0-rc.8`），本轮放宽后必须把「0 拒挂」钉住，
// 否则下次任一通道（d-pack 覆盖 / 外部上游覆盖 / 手改 manifest）把上限收回一个
// 上界，就会重新变成静默下线。
//
// 判据不自己实现 semver 比较：直接用内核的 oracle
// `require('@deepseek-ai/dsh-app-boot').evaluatePluginCompatibility`，
// 与真机装载走同一条代码路径（只读 peerDependencies，只判 `@deepseek-ai/dsh`
// 与 `@deepseek-ai/dsh-*` 两族键，`includePrerelease: true`）。
// 兜底通道 `dsh plugin allow-version`（profile compatibility.json 的 exact-version 豁免）
// **不作为通过条件** —— 本舰队的口径是「声明即兼容」，不靠豁免。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const boot = require('@deepseek-ai/dsh-app-boot');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins.js');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(DSH, 'assets', 'plugins');

const pin = JSON.parse(fs.readFileSync(path.join(DSH, 'scripts', 'compat', 'kernel-pin.json'), 'utf8'));

/** 装机树里的 dsh 族 peer 键（与内核 oracle 的选取规则逐字一致）。 */
function dshFamilyPeers(manifest) {
  const pd = manifest.peerDependencies || {};
  return Object.entries(pd).filter(([k]) => k === '@deepseek-ai/dsh' || k.startsWith('@deepseek-ai/dsh-'));
}

/** 按 package.json 的 name 字段建立「注册条目 → 源目录」映射（不靠目录名猜）。 */
function fleetIndex() {
  const byName = new Map();
  for (const d of fs.readdirSync(PLUGINS).sort()) {
    const root = path.join(PLUGINS, d);
    if (!fs.statSync(root).isDirectory()) continue;
    const mf = path.join(root, 'package.json');
    if (!fs.existsSync(mf)) continue;
    const j = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (j && typeof j.name === 'string') byName.set(j.name, { dir: d, manifest: j });
  }
  return byName;
}

function evaluate(manifest, exemptions = {}, runtimeVersion = undefined) {
  return boot.evaluatePluginCompatibility(manifest, exemptions, runtimeVersion || boot.getDshRuntimeVersion());
}

// ---- 判据源自检 -------------------------------------------------------------

test('判据源：内核兼容 oracle 在装机型与 pin 型上必须同源', () => {
  assert.equal(typeof boot.evaluatePluginCompatibility, 'function',
    'dsh-app-boot 未导出 evaluatePluginCompatibility（内核换代后判据需随迁）');
  const runtime = boot.getDshRuntimeVersion();
  assert.equal(runtime, pin.kernel.packageVersion,
    `装机树运行版本 ${runtime} ≠ kernel-pin ${pin.kernel.packageVersion}（判据与 pin 已脱钩）`);
  assert.ok(pin.kernel.tag.includes(runtime), `kernel-pin 的 tag ${pin.kernel.tag} 与 packageVersion 不同版`);
});

test('反证：oracle 非空转 —— 收紧的旧 peer 区间必须判拒，四种正当写法必须放行', () => {
  const runtime = boot.getDshRuntimeVersion();
  const base = { name: 'synthetic-plugin', version: '1.0.0', private: true };

  // 必须判拒：上限收到 rc.1 之前（本轮修前的 billion-context-dsh 形态）。
  const denied = evaluate({
    ...base,
    peerDependencies: { '@deepseek-ai/dsh': '^0.1.0', '@deepseek-ai/dsh-compaction': '>=0.1.5-alpha.1 <0.1.6-0' },
  }, {}, runtime);
  assert.ok(denied && Object.keys(denied.peers).length === 2, '收紧区间未判拒（oracle 空转，全绿无意义）');
  assert.equal(denied.exempted, false, '合成 manifest 不该自带豁免');

  // 必须放行的四种形态（本轮实际采用的就是 ①③，②④ 是上游常见形态）。
  const allowed = {
    'rc 或运算': '^0.2.0-rc.1',
    '跨代或运算': '^0.1.0 || ^0.2.0-rc.1',
    '开区间上界': '>=0.1.5-alpha.1 <0.3.0-0',
    '通配': '*',
  };
  for (const [label, range] of Object.entries(allowed)) {
    assert.equal(evaluate({ ...base, peerDependencies: { '@deepseek-ai/dsh': range } }, {}, runtime),
      undefined, `正当区间被判拒（${label}: ${range}），判据过严`);
  }

  // 判据边界：非 dsh 族键不参与拒挂（cordis / schemastery / cosmokit 落后不会导致下线）。
  assert.equal(evaluate({ ...base, peerDependencies: { '@deepseek-ai/cordis': '^4.0.1', '@deepseek-ai/schemastery': '^3.0.0' } }, {}, runtime),
    undefined, '非 dsh 族键被误判为拒挂，判据过宽');

  // 兜底通道的形状（记录用途，本舰队不用它换绿）：exact-version 豁免会让 exempted=true 但仍返回 issue。
  const exempted = evaluate(
    { ...base, peerDependencies: { '@deepseek-ai/dsh': '^0.1.0' } },
    { 'synthetic-plugin@1.0.0': [runtime] },
    runtime,
  );
  assert.ok(exempted && exempted.exempted === true, '豁免通道形状与内核实现不一致（判据随迁要跟上）');
});

// ---- 舰队实判 ---------------------------------------------------------------

test('在册舰队：以 pin 内核版本的 peer 判定必须 0 拒挂（DSH-0.2.0-RC1-01 防线）', () => {
  const runtime = boot.getDshRuntimeVersion();
  const byName = fleetIndex();
  const denied = [];
  const orphan = [];
  let withFamily = 0;
  let familyKeys = 0;

  for (const entry of COMPANION_PLUGINS) {
    const hit = byName.get(entry.name);
    if (!hit) { orphan.push(`${entry.id} → ${entry.name}`); continue; }
    const peers = dshFamilyPeers(hit.manifest);
    if (peers.length) { withFamily++; familyKeys += peers.length; }
    const issue = evaluate(hit.manifest, {}, runtime);
    if (issue) denied.push(`${entry.id} (${hit.dir}) ${hit.manifest.name}@${hit.manifest.version} → ${JSON.stringify(issue.peers)}`);
  }

  // 清单↔源 1:1（与 unit-hub-registry 的收口用例同向，这里证明本守卫真的覆盖到全部条目）。
  assert.deepEqual(orphan, [], `COMPANION_PLUGINS 有条目在 assets/plugins 找不到源包：\n  ${orphan.join('\n  ')}`);
  assert.equal(COMPANION_PLUGINS.length, 28, '在册条目数已变（本守卫的阈值与台账需随迁）');
  assert.equal(byName.size, 28, `assets/plugins 源目录数 ${byName.size} 与清单不同数`);

  // 覆盖哨兵：28 条里 11 条声明 dsh 族 peer（实测 46 个键）。若掉到个位数说明读取脱靶，
  // 「0 拒挂」就只是因为什么都没判。
  assert.ok(withFamily >= 10, `只有 ${withFamily} 条声明 dsh 族 peer，采集已脱靶`);
  assert.ok(familyKeys >= 40, `只核到 ${familyKeys} 个 dsh 族 peer 键，采集已脱靶`);

  assert.deepEqual(denied, [],
    `以下插件会被内核静默禁用（peer 与 ${runtime} 不兼容）：\n  ${denied.join('\n  ')}`);
});

test('反向捕获力：把在册插件的真实 peer 收回旧上界，舰队判据必须转红', () => {
  const runtime = boot.getDshRuntimeVersion();
  const byName = fleetIndex();
  const cases = [
    ['billion-context-dsh', '@deepseek-ai/dsh-compaction', '>=0.1.5-alpha.1 <0.1.6-0'],
    ['dsh-better-sidebar', '@deepseek-ai/dsh-client-ui-primitives', '^0.1.0-rc.8'],
  ];
  for (const [pkg, key, oldRange] of cases) {
    const hit = byName.get(pkg);
    assert.ok(hit, `夹具失败：assets/plugins 里没有 ${pkg}`);
    assert.ok(dshFamilyPeers(hit.manifest).some(([k]) => k === key),
      `夹具失败：${pkg} 现在不声明 ${key}，本用例需随迁`);
    const mutated = { ...hit.manifest, peerDependencies: { ...hit.manifest.peerDependencies, [key]: oldRange } };
    const issue = evaluate(mutated, {}, runtime);
    assert.ok(issue && issue.peers[key] === oldRange,
      `${pkg} 的 ${key} 收回 ${oldRange} 后仍判兼容 —— 放宽才是绿的承重墙，判据必须能咬住它`);
    // 现值必须与旧上界不同，否则这条反证是空转的。
    assert.notEqual(hit.manifest.peerDependencies[key], oldRange,
      `${pkg}/${key} 仍是旧区间，修复未落地`);
  }
});
