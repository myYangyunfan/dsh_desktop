'use strict';
// desktop-diagnostics.js 单测：patch 健康 / bundles 解析 / 日志扫描 / 崩溃转储 / 汇总报告。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  readTailText,
  tallyLines,
  scanLogTail,
  analyzePatch,
  analyzeBundles,
  analyzePlugins,
  analyzeCrashDumps,
  readSelfHealHistory,
  isLlmErrorLine,
  analyzeLlmErrors,
  resolveDefaultModel,
  runDiagnostics,
} = require('../desktop-diagnostics.js');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-diag-test-'));
}

function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

test('readTailText 读取尾部定长字节', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'a.log');
  fs.writeFileSync(file, '1111\n2222\n3333', 'utf8');
  assert.strictEqual(readTailText(file, 6, fs), '2\n3333');
  assert.strictEqual(readTailText(file, 100, fs).endsWith('3333'), true);
  assert.strictEqual(readTailText(path.join(dir, 'missing'), 100, fs), '');
});

test('tallyLines 行级去重保序计数', () => {
  const out = tallyLines(['err a', 'err a', 'err b', '', '  err a  ']);
  assert.deepStrictEqual(out, [
    { line: 'err a', count: 3 },
    { line: 'err b', count: 1 },
  ]);
});

test('scanLogTail 聚合错误行并过滤无害行', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'x.log');
  fs.writeFileSync(file, [
    '[2026-01-01] [fatal] boom',
    '[2026-01-01] [fatal] boom',
    'main exited code=0',
    '  at node:internal/foo',
    '[ok] normal',
  ].join('\n'), 'utf8');
  const scan = scanLogTail(file, {}, fs);
  assert.strictEqual(scan.totalLines, 5);
  assert.strictEqual(scan.errors.length, 1);
  assert.strictEqual(scan.errors[0].line, '[2026-01-01] [fatal] boom');
  assert.strictEqual(scan.errors[0].count, 2);
  assert.strictEqual(scanLogTail(path.join(dir, 'nope'), {}, fs), null);
});

test('analyzePatch 正常解析 + 重复 id + 孤儿', () => {
  const dir = tmpdir();
  const good = write(dir, 'good.yml', '[{"id":"a","insert":[{"id":"p1"},{"id":"p1"}]},{"id":"b"}]');
  const yaml = { load: (t) => JSON.parse(t) };
  const out = analyzePatch(good, yaml, fs);
  assert.strictEqual(out.parseOk, true);
  assert.strictEqual(out.entryCount, 2);
  assert.deepStrictEqual(out.duplicateIds, [{ id: 'p1', count: 2 }]);
  assert.deepStrictEqual(out.orphanIds, []);
});

test('analyzePatch 带 insert 的顶层条目 id 也参与重复检测', () => {
  const dir = tmpdir();
  // 两个顶层条目同 id（web），各自带 insert——顶层 id 是 loader 条目 id，
  // 重复 = duplicate loader entry id 启动失败，必须检出
  const dup = write(dir, 'dup.yml', '[{"id":"web","insert":[{"id":"p-x"}]},{"id":"web","insert":[{"id":"p-y"}]}]');
  const yaml = { load: (t) => JSON.parse(t) };
  const out = analyzePatch(dup, yaml, fs);
  assert.strictEqual(out.parseOk, true);
  assert.ok(out.duplicateIds.some((d) => d.id === 'web' && d.count === 2), JSON.stringify(out.duplicateIds));
});

test('analyzePatch 解析失败 + js-yaml 缺失降级', () => {
  const dir = tmpdir();
  const bad = write(dir, 'bad.yml', '{{{{ not yaml');
  const out = analyzePatch(bad, { load: () => { throw new Error('oops'); } }, fs);
  assert.strictEqual(out.parseOk, false);
  assert.match(out.parseError, /oops/);
  // js-yaml 缺失：JSON 数组可解析，YAML 报「待解析」
  const jsonArr = write(dir, 'arr.yml', '[{"id":"a"}]');
  const out2 = analyzePatch(jsonArr, null, fs);
  assert.strictEqual(out2.parseOk, true);
  assert.strictEqual(out2.entryCount, 1);
  const notJson = write(dir, 'yj.yml', '# hi\n- id: x\n');
  const out3 = analyzePatch(notJson, null, fs);
  assert.strictEqual(out3.parseOk, false);
  assert.match(out3.parseError, /js-yaml 不可用/);
});

test('analyzeBundles 按 profile→core→assets 顺序解析', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  const core = path.join(dir, 'core');
  const assets = path.join(dir, 'assets');
  write(profile, 'node_modules/@deepseek-ai/dsh-base/package.json', '{"name":"@deepseek-ai/dsh-base"}');
  write(profile, 'node_modules/foo-bar/package.json', '{"name":"foo-bar"}');
  write(core, 'dsh-web-app/package.json', '{"name":"@deepseek-ai/dsh-web-app"}');
  write(assets, 'baz/package.json', '{"name":"baz"}');
  write(profile, 'package.json', JSON.stringify({
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'foo-bar', 'baz', 'missing-one'] } },
  }));
  const out = analyzeBundles(profile, assets, core, fs);
  assert.deepStrictEqual(out.missing, ['missing-one']);
  assert.strictEqual(out.bundles.find((b) => b.name === '@deepseek-ai/dsh-base').source, 'profile');
  assert.strictEqual(out.bundles.find((b) => b.name === '@deepseek-ai/dsh-web-app').source, 'core');
  assert.strictEqual(out.bundles.find((b) => b.name === 'foo-bar').source, 'profile');
  assert.strictEqual(out.bundles.find((b) => b.name === 'baz').source, 'assets');
});

test('analyzePlugins 发现缺目录的 insert 条目', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  write(profile, 'node_modules/pkg-a/package.json', '{"name":"pkg-a"}');
  const entries = [
    { id: 'a1', insert: [{ id: 'x', name: 'pkg-a' }, { id: 'y', name: 'pkg-missing' }] },
  ];
  const out = analyzePlugins(entries, profile, fs);
  assert.strictEqual(out.insertCount, 2);
  assert.deepStrictEqual(out.missingDirs, [{ id: 'y', name: 'pkg-missing' }]);
});

test('analyzeCrashDumps 统计 dmp 文件', () => {
  const dir = tmpdir();
  write(dir, 'one.dmp', 'x');
  write(dir, 'two.dmp', 'y');
  write(dir, 'readme.txt', 'z');
  const out = analyzeCrashDumps(dir, fs);
  assert.strictEqual(out.dumpCount, 2);
  assert.ok(out.newestDump.endsWith('.dmp'));
  // 目录不存在
  const none = analyzeCrashDumps(path.join(dir, 'zzz'), fs);
  assert.strictEqual(none.dirExists, false);
  assert.strictEqual(none.dumpCount, 0);
});

test('runDiagnostics 汇总报告：健康 profile 无错误', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  const assets = path.join(dir, 'assets');
  const core = path.join(dir, 'core');
  write(profile, 'cordis.patch.yml', '[{"id":"web","insert":[{"id":"p-companion","name":"companion-pkg"}]}]');
  write(profile, 'node_modules/companion-pkg/package.json', '{"name":"companion-pkg"}');
  write(profile, 'package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }));
  write(core, '@deepseek-ai/dsh-base/package.json', '{"name":"@deepseek-ai/dsh-base"}');
  const logDir = path.join(dir, 'logs');
  write(logDir, 'desktop.log', '[ok] fine\n');
  const report = runDiagnostics({
    profileDir: profile,
    patchFile: path.join(profile, 'cordis.patch.yml'),
    assetsDir: assets,
    coreDirDshAt: core,
    crashDir: path.join(dir, 'crash'),
    logs: { desktop: path.join(logDir, 'desktop.log'), web: path.join(logDir, 'web.log') },
    yaml: { load: (t) => JSON.parse(t) },
    env: { version: '9.9.9' },
  }, fs);
  assert.strictEqual(report.ok, true);
  assert.deepStrictEqual(report.errors, []);
  assert.strictEqual(report.sections.patch.exists, true);
  assert.strictEqual(report.sections.patch.entryCount, 1);
});

test('runDiagnostics 报重复 id 错误与缺失 bundle 警告', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  write(profile, 'cordis.patch.yml', '[{"id":"web","insert":[{"id":"dup","name":"pkg"},{"id":"dup","name":"pkg2"}]}]');
  write(profile, 'package.json', JSON.stringify({ dsh: { profile: { bundles: ['no-such-bundle'] } } }));
  const report = runDiagnostics({
    profileDir: profile,
    patchFile: path.join(profile, 'cordis.patch.yml'),
    assetsDir: null,
    coreDirDshAt: null,
    crashDir: null,
    logs: {},
    yaml: { load: (t) => JSON.parse(t) },
    env: {},
  }, fs);
  assert.strictEqual(report.ok, false);
  assert.strictEqual(report.errors.length, 1);
  assert.match(report.errors[0].message, /重复的 loader 条目 id「dup」/);
  const missingWarn = report.warnings.find((w) => /no-such-bundle/.test(w.message));
  assert.ok(missingWarn, '应有缺失 bundle 警告');
});

test('readSelfHealHistory 读取自愈历史并容错', () => {
  const dir = tmpdir();
  // 文件缺失 → []
  assert.deepStrictEqual(readSelfHealHistory(path.join(dir, 'missing.json'), fs), []);
  // 正常数组：过滤形状不符、按写入顺序保留（ts 降序由写入端保证）、截断 5 条
  const file = path.join(dir, 'self-heal-history.json');
  write(dir, 'self-heal-history.json', JSON.stringify([
    { kind: 'bundle', names: ['@dsh-external/dsh-vision'], ts: 1000 },
    { kind: 'overlay', names: ['balance'], ts: 900 },
    { kind: 'bad-kind', names: ['x'], ts: 800 },
    { kind: 'bundle', names: [], ts: 700 },
    { kind: 'bundle', names: ['a'], ts: 600 },
    { kind: 'bundle', names: ['b'], ts: 500 },
    { kind: 'bundle', names: ['c'], ts: 400 },
    { kind: 'bundle', names: ['d'], ts: 300 },
    { kind: 'bundle', names: ['e'], ts: 200 },
    { kind: 'bundle', names: ['f'], ts: 100 },
    'not-an-object',
    null,
  ]));
  const out = readSelfHealHistory(file, fs);
  assert.strictEqual(out.length, 5);
  assert.strictEqual(out[0].kind, 'bundle');
  assert.strictEqual(out[0].names[0], '@dsh-external/dsh-vision');
  assert.strictEqual(out[1].kind, 'overlay');
  // 损坏 JSON → []
  write(dir, 'self-heal-history.json', '{broken');
  assert.deepStrictEqual(readSelfHealHistory(file, fs), []);
  // 非数组 → []
  write(dir, 'self-heal-history.json', '{"a":1}');
  assert.deepStrictEqual(readSelfHealHistory(file, fs), []);
  // 未传路径 → []
  assert.deepStrictEqual(readSelfHealHistory(null, fs), []);
});

test('runDiagnostics 报告携带自愈历史（sections + infos）', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  write(profile, 'cordis.patch.yml', '[{"id":"web","insert":[]}]');
  write(profile, 'package.json', JSON.stringify({ dsh: { profile: { bundles: [] } } }));
  const hist = path.join(dir, 'self-heal-history.json');
  write(dir, 'self-heal-history.json', JSON.stringify([
    { kind: 'bundle', names: ['@dsh-external/dsh-vision'], ts: Date.now() - 60000 },
  ]));
  const report = runDiagnostics({
    profileDir: profile,
    patchFile: path.join(profile, 'cordis.patch.yml'),
    assetsDir: null,
    coreDirDshAt: null,
    crashDir: null,
    logs: {},
    selfHealHistoryFile: hist,
    yaml: { load: (t) => JSON.parse(t) },
    env: {},
  }, fs);
  assert.strictEqual(report.sections.selfHeal.length, 1);
  assert.strictEqual(report.sections.selfHeal[0].kind, 'bundle');
  assert.ok(report.infos.some((i) => /最近启动自愈.*已自动移除.*dsh-vision/.test(i.message)));
});

// --- A-3 LLM 错误与默认模型 ---

test('isLlmErrorLine：关键词直达与 4xx/5xx+上下文双条件', () => {
  assert.strictEqual(isLlmErrorLine('llm: NO_ADAPTER for provider opencode'), true);
  assert.strictEqual(isLlmErrorLine('INVALID_REPLAY_STATE: cannot resume legacy session'), true);
  assert.strictEqual(isLlmErrorLine('[llm] MISSING_CREDENTIAL OPENCODE_API_KEY'), true);
  assert.strictEqual(isLlmErrorLine('[llm] POST /v1/chat/completions 401'), true);
  assert.strictEqual(isLlmErrorLine('api request failed with status 503 retrying'), true);
  // 裸 4xx/5xx（端口/行号/数字）无 LLM 上下文 → 不误报
  assert.strictEqual(isLlmErrorLine('listening on 127.0.0.1:4040'), false);
  assert.strictEqual(isLlmErrorLine('line 500 of boot script'), false);
  assert.strictEqual(isLlmErrorLine('web UI ready'), false);
  assert.strictEqual(isLlmErrorLine(''), false);
});

test('analyzeLlmErrors：不存在/有记录/损坏行容错', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'llm-errors.jsonl');
  assert.deepStrictEqual(analyzeLlmErrors(file, fs), { exists: false, count: 0, recent: [] });
  const rows = [];
  for (let i = 1; i <= 7; i++) rows.push(JSON.stringify({ at: '2026-08-18T0' + i + ':00:00Z', line: 'err ' + i }));
  fs.writeFileSync(file, rows.join('\n') + '\n' + 'not-json-line\n', 'utf8');
  const r = analyzeLlmErrors(file, fs);
  assert.strictEqual(r.exists, true);
  assert.strictEqual(r.count, 7); // 损坏行跳过
  assert.strictEqual(r.recent.length, 5);
  assert.strictEqual(r.recent[4].line, 'err 7'); // 最近一条在尾部
  assert.strictEqual(r.recent[0].line, 'err 3');
});

test('resolveDefaultModel：凭证键存在/缺失/配置缺键', () => {
  const dir = tmpdir();
  const settings = JSON.stringify({
    'agent-default-model': { provider: 'opencode', model: 'deepseek-v4-flash-free' },
    'llm-pi-ai': { providers: { opencode: { apiKeyEnv: 'OPENCODE_API_KEY' } } },
  });
  const credOk = 'OPENCODE_API_KEY: abc123\nDEEPSEEK_API_KEY: xyz\n';
  const credMissing = 'DEEPSEEK_API_KEY: xyz\n';
  const fakeYaml = { load: (t) => JSON.parse(t) };
  const sf = write(dir, 'settings.json5', settings);
  const cf = write(dir, 'cred-ok.yaml', credOk);
  const cf2 = write(dir, 'cred-missing.yaml', credMissing);
  const ok = resolveDefaultModel(sf, cf, fakeYaml, fs);
  assert.deepStrictEqual(ok, { ok: true, provider: 'opencode', model: 'deepseek-v4-flash-free', apiKeyEnv: 'OPENCODE_API_KEY', credentialPresent: true });
  const miss = resolveDefaultModel(sf, cf2, fakeYaml, fs);
  assert.strictEqual(miss.credentialPresent, false);
  const noSettings = resolveDefaultModel(path.join(dir, 'nope.yaml'), cf, fakeYaml, fs);
  assert.strictEqual(noSettings.ok, false);
  assert.ok((noSettings.reason || '').length > 0);
  const noAdm = resolveDefaultModel(write(dir, 'no-adm.yaml', '{"other":1}'), cf, fakeYaml, fs);
  assert.strictEqual(noAdm.ok, false);
  assert.ok(/agent-default-model/.test(noAdm.reason));
});

test('runDiagnostics 报告携带 llm 段（错误计数 + 凭证缺失 warning）', () => {
  const dir = tmpdir();
  const profile = path.join(dir, 'profile');
  write(profile, 'cordis.patch.yml', '[{"id":"web","insert":[]}]');
  write(profile, 'package.json', JSON.stringify({ dsh: { profile: { bundles: [] } } }));
  const errs = path.join(dir, 'llm-errors.jsonl');
  write(dir, 'llm-errors.jsonl', JSON.stringify({ at: '2026-08-18T01:00:00Z', line: '[llm] NO_ADAPTER' }) + '\n');
  const sf = write(dir, 'settings.json5', JSON.stringify({
    'agent-default-model': { provider: 'opencode', model: 'deepseek-v4-flash-free' },
    'llm-pi-ai': { providers: { opencode: { apiKeyEnv: 'OPENCODE_API_KEY' } } },
  }));
  const cf = write(dir, 'cred.yaml', 'DEEPSEEK_API_KEY: xyz\n'); // 无 OPENCODE_API_KEY
  const report = runDiagnostics({
    profileDir: profile,
    patchFile: path.join(profile, 'cordis.patch.yml'),
    assetsDir: null,
    coreDirDshAt: null,
    crashDir: null,
    logs: {},
    selfHealHistoryFile: null,
    llmErrorsFile: errs,
    settingsFile: sf,
    credentialsFile: cf,
    yaml: { load: (t) => JSON.parse(t) },
    env: {},
  }, fs);
  assert.strictEqual(report.sections.llm.errors.count, 1);
  assert.strictEqual(report.sections.llm.errors.recent[0].line, '[llm] NO_ADAPTER');
  assert.strictEqual(report.sections.llm.defaultModel.provider, 'opencode');
  assert.ok(report.infos.some((i) => /1 条模型调用错误/.test(i.message)));
  assert.ok(report.warnings.some((i) => /凭证键 OPENCODE_API_KEY 未在 \.credentials\.yaml 中配置/.test(i.message)));
});