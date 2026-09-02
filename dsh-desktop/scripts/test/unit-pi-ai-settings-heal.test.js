'use strict';

// pi-ai-settings-heal 单元测试：settings.yaml 的 llm-pi-ai 非法供应商条目
// 自愈（boot repair 步）。两条判定路径都覆盖：
//   - 真内核路径：appDir 指向本仓 dsh-desktop，用安装根 @deepseek-ai/dsh-llm-pi-ai
//     的真 apply() 判定（「目录外路由缺 api/baseURL」真实形态）；
//   - 注桩路径：inject.probeApply 覆盖判定，覆盖防环 / 放弃 / 多轮收敛等
//     内核真码难以稳定构造的分支。
// 断言红线：绝不带着坏配置覆盖用户文件；零改动路径绝不写盘。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { healPiAiSettings, probeWithKernel, settingsFileOf } = require('../../scripts/lib/pi-ai-settings-heal');

const repoRoot = path.resolve(__dirname, '..', '..');

/** 造临时 home 并写入 settings.yaml。 */
function makeHome(yamlText) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-piai-heal-'));
  if (yamlText !== undefined) fs.writeFileSync(path.join(home, 'settings.yaml'), yamlText, 'utf8');
  return home;
}

/** 非法供应商（目录外路由缺 api/baseURL——opencode-go 真实形态）。 */
const BAD_PROVIDER = [
  '    broken-relay:',
  '      models:',
  '        - id: grok-4.5',
  '          name: Grok',
  '          contextWindow: 100000',
  '          maxTokens: 8192',
  '      apiKeyEnv: BROKEN_RELAY_API_KEY',
].join('\n');

/** 合法供应商（完整 api+baseURL——UI 正常添加形态）。 */
const GOOD_PROVIDER = [
  '    good-relay:',
  '      api: openai-completions',
  '      baseURL: https://example.invalid/v1',
  '      models:',
  '        - id: good-model',
  '          name: Good',
  '          contextWindow: 100000',
  '          maxTokens: 8192',
  '      apiKeyEnv: GOOD_RELAY_API_KEY',
].join('\n');

function settingsWith(providersBody) {
  return [
    'ui-theme:',
    '  mode: dark',
    'llm-pi-ai:',
    '  providers:',
    providersBody,
    'agent-default-model:',
    '  model: good-relay/good-model',
    '',
  ].join('\n');
}

const NOOP_LOG = () => {};

test('settingsFileOf 拼接 home 与 settings.yaml', () => {
  assert.equal(settingsFileOf('C:/x'), path.join('C:/x', 'settings.yaml'));
});

test('真内核: 非法供应商被移出，合法供应商与其它 section 原样保留，备份含原文', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER + '\n' + GOOD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');

  const r = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });

  assert.equal(r.changed, true, '应发生修改: ' + JSON.stringify(r));
  assert.deepEqual(r.removed, ['broken-relay']);
  assert.ok(r.backup && fs.existsSync(r.backup), '备份文件应存在');
  assert.ok(r.backup.startsWith(file + '.heal-piai-'), '备份命名 .heal-piai- 前缀');
  const backupText = fs.readFileSync(r.backup, 'utf8');
  assert.ok(backupText.includes('broken-relay'), '备份应含被移出条目原文');

  const healed = fs.readFileSync(file, 'utf8');
  assert.ok(!healed.includes('broken-relay'), '非法条目应被移出');
  assert.ok(healed.includes('good-relay'), '合法条目应保留');
  assert.ok(healed.includes('mode: dark'), '其它 section（ui-theme）应保留');
  assert.ok(healed.includes('model: good-relay/good-model'), 'agent-default-model 应保留');

  // 修复后的 section 必须能过内核 apply（用同一真码复核）。
  const yaml = require(path.join(repoRoot, 'node_modules', 'yaml'));
  const doc = yaml.parseDocument(healed, { uniqueKeys: true });
  assert.equal(doc.errors.length, 0, '修复后应为合法 YAML');
  const piAi = await import('node:url').then((u) => import(u.pathToFileURL(path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')).href));
  assert.equal(probeWithKernel(piAi.apply, doc.toJS()['llm-pi-ai']).ok, true, '修复后内核判定应通过');
});

test('真内核: 全合法配置零写盘（changed:false 且文件未动）', async () => {
  const home = makeHome(settingsWith(GOOD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');
  const statBefore = fs.statSync(file);

  const r = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });

  assert.equal(r.changed, false);
  assert.deepEqual(r.removed, []);
  assert.equal(r.backup, null);
  assert.equal(fs.readFileSync(file, 'utf8'), before, '文件内容不应变化');
  assert.equal(fs.statSync(file).mtimeMs, statBefore.mtimeMs, '不应触碰文件');
});

test('真内核: 无 llm-pi-ai section / 空 providers / providers 非法形态 均不动', async () => {
  for (const [name, text] of [
    ['无 section', 'ui-theme:\n  mode: dark\n'],
    ['空 providers', 'llm-pi-ai:\n  providers: {}\n'],
    ['providers 非法形态', 'llm-pi-ai:\n  providers: oops\n'],
  ]) {
    const home = makeHome(text);
    const file = path.join(home, 'settings.yaml');
    const before = fs.readFileSync(file, 'utf8');
    const r = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });
    assert.equal(r.changed, false, name + ' 应零写');
    assert.ok(r.note, name + ' 应带 note: ' + JSON.stringify(r));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  const emptyHome = makeHome(undefined);
  const r2 = await healPiAiSettings({ appDir: repoRoot, home: emptyHome, log: NOOP_LOG });
  assert.equal(r2.changed, false);
  assert.equal(r2.note, 'settings-missing');
  assert.equal(fs.existsSync(path.join(emptyHome, 'settings.yaml')), false, '绝不应凭空造文件');
});

test('真内核: 内核模块不在位（假 appDir）→ 不修不写', async () => {
  const fakeApp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-piai-fakeapp-'));
  fs.writeFileSync(path.join(fakeApp, 'package.json'), JSON.stringify({ name: 'fake' }), 'utf8');
  const home = makeHome(settingsWith(BAD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');

  const r = await healPiAiSettings({ appDir: fakeApp, home, log: NOOP_LOG });

  assert.equal(r.changed, false);
  assert.ok(String(r.note).startsWith('deps-unavailable'), '应报依赖不在位: ' + JSON.stringify(r));
  assert.equal(fs.readFileSync(file, 'utf8'), before, '文件不应被动');
  assert.equal(fs.readdirSync(home).filter((f) => f.includes('heal-piai')).length, 0, '不应产生备份');
});

test('真内核: 幂等——修完再跑一轮零写', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER + '\n' + GOOD_PROVIDER));
  const first = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(first.changed, true);
  const file = path.join(home, 'settings.yaml');
  const after = fs.readFileSync(file, 'utf8');
  const second = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(second.changed, false);
  assert.deepEqual(second.removed, []);
  assert.equal(fs.readFileSync(file, 'utf8'), after);
});

test('真内核: CRLF 原文修复后保持 CRLF', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER).replace(/\n/g, '\r\n'));
  const r = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, true);
  const healed = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8');
  assert.ok(healed.includes('\r\n'), '应保持 CRLF');
  assert.ok(!/(^|[^\r])\n/.test(healed), '不应残留裸 LF');
});

test('注桩: 抛错不含 provider 名 → 放弃且零写', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');
  const r = await healPiAiSettings({
    appDir: repoRoot, home, log: NOOP_LOG,
    inject: { probeApply: () => { throw new Error('some other failure'); } },
  });
  assert.equal(r.changed, false);
  assert.ok(String(r.note).startsWith('unrecognized-failure'));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('注桩: 多轮收敛——每轮抛一个非法条目，全部移出后通过', async () => {
  // 两个非法条目（键名即 stub 抛的名字，必须真实存在于 settings 才删得掉）。
  const badA = BAD_PROVIDER.replace('broken-relay:', 'a-first:').replace('BROKEN_RELAY_API_KEY', 'A_API_KEY');
  const badB = BAD_PROVIDER.replace('broken-relay:', 'b-second:').replace('BROKEN_RELAY_API_KEY', 'B_API_KEY');
  const home = makeHome(settingsWith(badA + '\n' + badB + '\n' + GOOD_PROVIDER));
  const throwOrder = ['a-first', 'b-second'];
  const r = await healPiAiSettings({
    appDir: repoRoot, home, log: NOOP_LOG,
    inject: {
      probeApply: (ctx, section) => {
        const keys = Object.keys((section && section.providers) || {});
        const hit = throwOrder.find((n) => keys.includes(n));
        if (hit) throw new Error('provider "' + hit + '" model "x" needs an api');
      },
    },
  });
  assert.equal(r.changed, true);
  assert.deepEqual(r.removed, ['a-first', 'b-second']);
  const healed = fs.readFileSync(path.join(home, 'settings.yaml'), 'utf8');
  assert.ok(!healed.includes('a-first') && !healed.includes('b-second'));
  assert.ok(healed.includes('good-relay'), '合法条目保留');
});

test('注桩: 重复抛同名 → 防环放弃', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');
  const r = await healPiAiSettings({
    appDir: repoRoot, home, log: NOOP_LOG,
    inject: { probeApply: () => { throw new Error('provider "broken-relay" still bad'); } },
  });
  assert.equal(r.changed, false);
  assert.ok(String(r.note).startsWith('repeat-failure'));
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('注桩: 抛错指向不存在的键 → 放弃', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER));
  const r = await healPiAiSettings({
    appDir: repoRoot, home, log: NOOP_LOG,
    inject: { probeApply: () => { throw new Error('provider "ghost" bad'); } },
  });
  assert.equal(r.changed, false);
  assert.ok(String(r.note).startsWith('provider-not-found'));
});

test('注桩: 轮次耗尽仍不健康 → 终态复核放弃（绝不带坏配置写盘）', async () => {
  const home = makeHome(settingsWith(BAD_PROVIDER));
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');
  const r = await healPiAiSettings({
    appDir: repoRoot, home, log: NOOP_LOG,
    inject: {
      maxRounds: 1, // 轮 1 删 broken-relay 后即耗尽，终态复核 stub 仍炸 → 放弃
      probeApply: (ctx, section) => {
        const keys = Object.keys((section && section.providers) || {});
        if (keys.length > 0) throw new Error('provider "' + keys[0] + '" bad');
        throw new Error('section-level boom');
      },
    },
  });
  assert.equal(r.changed, false);
  assert.ok(String(r.note).startsWith('still-unhealthy'), '应终态放弃: ' + JSON.stringify(r));
  assert.equal(fs.readFileSync(file, 'utf8'), before, '原文件必须原样保留');
  assert.equal(fs.readdirSync(home).filter((f) => f.includes('heal-piai')).length, 0, '不应产生备份');
});

test('注桩: settings.yaml 解析失败 → 不动', async () => {
  const home = makeHome('llm-pi-ai: [unclosed\n  bad');
  const file = path.join(home, 'settings.yaml');
  const before = fs.readFileSync(file, 'utf8');
  const r = await healPiAiSettings({ appDir: repoRoot, home, log: NOOP_LOG });
  assert.equal(r.changed, false);
  assert.equal(r.note, 'yaml-parse-error');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
