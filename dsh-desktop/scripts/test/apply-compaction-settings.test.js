'use strict';

// 单测：scripts/apply-compaction-settings.js 的校验与预设改写逻辑。
// 运行：node --test scripts/test/apply-compaction-settings.test.js
// 真实预设验证（可选）：设置 DSH_PRESETS_DIR 指向 dsh 包的 config/agent-presets。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { patchPresetFile, normalizeSettings, defaultSettings, COMPACTION_MARKER } = require('../apply-compaction-settings');

const PLAIN_ENTRY_LF = [
  '- id: compaction',
  "  name: 'cordis:group'",
  '  group: true',
  '  config:',
  "    - id: compaction-basic",
  "      name: '@deepseek-ai/dsh-compaction-basic'",
  '',
  '    - id: command-compact',
  "      name: '@deepseek-ai/dsh-command-compact'",
  '',
].join('\n');

test('normalizeSettings: defaults and clamping', () => {
  assert.deepStrictEqual(normalizeSettings(undefined), defaultSettings());
  assert.deepStrictEqual(normalizeSettings({ auto: false }), { auto: false, thresholdRatio: 0.8, maxTokens: 8192 });
  assert.deepStrictEqual(normalizeSettings({ thresholdRatio: 0.5, maxTokens: 16384 }), { auto: true, thresholdRatio: 0.5, maxTokens: 16384 });
  // 非法值回退默认
  assert.deepStrictEqual(normalizeSettings({ thresholdRatio: 1.5, maxTokens: 10 }), defaultSettings());
  assert.deepStrictEqual(normalizeSettings({ thresholdRatio: 'abc', maxTokens: 'xyz' }), defaultSettings());
  assert.deepStrictEqual(normalizeSettings(null), defaultSettings());
});

test('patchPresetFile: file without compaction-basic is untouched', () => {
  const src = '- id: x\n  name: y\n';
  assert.strictEqual(patchPresetFile(src, defaultSettings()), src);
});

test('patchPresetFile: inserts config into a plain entry (LF)', () => {
  const out = patchPresetFile(PLAIN_ENTRY_LF, { auto: true, thresholdRatio: 0.6, maxTokens: 16384 });
  assert.ok(out.includes("    - id: compaction-basic\n      name: '@deepseek-ai/dsh-compaction-basic'\n      config:\n        " + COMPACTION_MARKER));
  assert.ok(out.includes('        auto: true\n        thresholdRatio: 0.6\n        maxTokens: 16384'));
  // 后续条目完好
  assert.ok(out.includes("    - id: command-compact\n      name: '@deepseek-ai/dsh-command-compact'"));
  // 只出现一个 compaction-basic 条目（id 行 + name 行各一次）
  assert.strictEqual(out.split('- id: compaction-basic').length - 1, 1);
});

test('patchPresetFile: replaces an existing config block', () => {
  const withConfig = PLAIN_ENTRY_LF.replace(
    "      name: '@deepseek-ai/dsh-compaction-basic'\n",
    "      name: '@deepseek-ai/dsh-compaction-basic'\n      config:\n        auto: false\n        thresholdRatio: 0.9\n        maxTokens: 4096\n"
  );
  const out = patchPresetFile(withConfig, { auto: true, thresholdRatio: 0.3, maxTokens: 32768 });
  assert.ok(out.includes('        auto: true\n        thresholdRatio: 0.3\n        maxTokens: 32768'));
  assert.ok(!out.includes('auto: false'));
  assert.ok(!out.includes('maxTokens: 4096'));
});

test('patchPresetFile: preserves CRLF and is idempotent', () => {
  const crlf = PLAIN_ENTRY_LF.replace(/\n/g, '\r\n');
  const out1 = patchPresetFile(crlf, { auto: true, thresholdRatio: 0.7, maxTokens: 8192 });
  assert.ok(out1.includes('\r\n'));
  const out2 = patchPresetFile(out1, { auto: true, thresholdRatio: 0.7, maxTokens: 8192 });
  assert.strictEqual(out2, out1);
  // LF 同样幂等
  const lf1 = patchPresetFile(PLAIN_ENTRY_LF, defaultSettings());
  assert.strictEqual(patchPresetFile(lf1, defaultSettings()), lf1);
});

// ---- 真实预设验证（可选，需 DSH_PRESETS_DIR 环境变量） ----------------------

const presetsDir = process.env.DSH_PRESETS_DIR;
if (presetsDir && fs.existsSync(presetsDir)) {
  test('real presets: every agent.cordis.yml with compaction-basic gets a valid patch', () => {
    const files = fs.readdirSync(presetsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(presetsDir, d.name, 'agent.cordis.yml'))
      .filter((f) => fs.existsSync(f));
    assert.ok(files.length > 0, 'preset files found');
    let patched = 0;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('compaction-basic')) continue;
      const out = patchPresetFile(src, { auto: false, thresholdRatio: 0.5, maxTokens: 16384 });
      assert.ok(out.includes(COMPACTION_MARKER), file + ' gets marker');
      assert.ok(out.includes('thresholdRatio: 0.5'), file + ' gets ratio');
      assert.strictEqual(out.split('- id: compaction-basic').length - 1, 1, file + ' single entry');
      // 幂等
      assert.strictEqual(patchPresetFile(out, { auto: false, thresholdRatio: 0.5, maxTokens: 16384 }), out, file + ' idempotent');
      patched++;
    }
    assert.ok(patched > 0, 'at least one preset patched');
    console.log(`real presets patched: ${patched}/${files.length}`);
  });
}
