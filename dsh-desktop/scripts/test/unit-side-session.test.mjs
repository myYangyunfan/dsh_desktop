// dsh-side-session（临时会话插件）供应商解析回归测试。
//
// 背景 bug：v0.3.0 模式 1 的 KNOWN_PROVIDERS 表没有「deepseek-official」——
// 而 DSH 官方默认供应商恰恰是它（dsh-llm-deepseek 注册的 provider 路由，
// 配置在 llm-deepseek 段而非 llm-pi-ai.providers），导致所有未改默认配置的
// 用户模式 1 直接报「未在内置已知表…无法确定 API 端点」。
//
// 修复三层（与官方 dsh-llm-deepseek 对齐）：
//   1. KNOWN_PROVIDERS 补 deepseek-official 条目；
//   2. readProviderProfile 在 llm-pi-ai.providers 未命中时回退读官方段
//      （PROVIDER_SETTINGS_SECTION：deepseek-official → llm-deepseek）；
//   3. resolveProviderBase 尊重官方 DEEPSEEK_BASE_URL env（BASE_URL_ENV）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'plugins', 'dsh-side-session');
const mod = await import(pathToFileURL(join(pluginDir, 'lib', 'index.js')).href);

test('KNOWN_PROVIDERS 覆盖 DSH 官方默认供应商 deepseek-official（与官方包对齐）', () => {
  const entry = mod.KNOWN_PROVIDERS['deepseek-official'];
  assert.ok(entry, '缺失 deepseek-official 条目——agent-default-model 的默认 provider，漏了它模式 1 对所有默认配置用户报 unknown-provider');
  assert.equal(entry.base, 'https://api.deepseek.com');
  assert.equal(entry.env, 'DEEPSEEK_API_KEY');
  assert.equal(entry.openai, true, 'DeepSeek 官方 API 是 OpenAI 兼容 /chat/completions，模式 1 可直连');
});

test('报障现场：默认配置（仅 agent-default-model）下模式 1 能解析出端点', () => {
  const home = mkdtempSync(join(tmpdir(), 'side-session-t1-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    writeFileSync(join(home, 'settings.yaml'), [
      'agent-default-model:',
      '  provider: deepseek-official',
      '  model: deepseek-v4-flash',
    ].join('\n'));
    const base = mod.resolveProviderBase('deepseek-official', mod.readProviderProfile('deepseek-official'));
    assert.equal(base, 'https://api.deepseek.com', '默认配置应命中内置表官方 base，而不是返回空串触发 unknown-provider 报错');
  } finally {
    process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('llm-deepseek 段回退：官方 provider 的自定义 apiKeyEnv / baseURL 能读到', () => {
  const home = mkdtempSync(join(tmpdir(), 'side-session-t2-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    writeFileSync(join(home, 'settings.yaml'), [
      'llm-deepseek:',
      '  apiKeyEnv: MY_DEEPSEEK_KEY',
      '  baseURL: "https://my-proxy.example.com/v1"',
      '  maxTokens: 8192',
      'agent-default-model:',
      '  provider: deepseek-official',
    ].join('\n'));
    const profile = mod.readProviderProfile('deepseek-official');
    assert.equal(profile.apiKeyEnv, 'MY_DEEPSEEK_KEY');
    assert.equal(profile.baseURL, 'https://my-proxy.example.com/v1');
    assert.equal(
      mod.resolveProviderBase('deepseek-official', profile),
      'https://my-proxy.example.com/v1'
    );
  } finally {
    process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('llm-pi-ai.providers 显式配置优先于官方段回退', () => {
  const home = mkdtempSync(join(tmpdir(), 'side-session-t3-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    writeFileSync(join(home, 'settings.yaml'), [
      'llm-pi-ai:',
      '  providers:',
      '    deepseek-official:',
      '      apiKeyEnv: EXPLICIT_KEY',
      '      baseURL: https://explicit.example.com',
      'llm-deepseek:',
      '  apiKeyEnv: SECTION_KEY',
      '  baseURL: https://section.example.com',
    ].join('\n'));
    const profile = mod.readProviderProfile('deepseek-official');
    assert.equal(profile.apiKeyEnv, 'EXPLICIT_KEY', 'llm-pi-ai.providers 显式配置优先');
    assert.equal(profile.baseURL, 'https://explicit.example.com');
  } finally {
    process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('DEEPSEEK_BASE_URL env 覆盖内置 base（对齐官方 BASE_URL_ENV），显式 baseURL 仍最高', () => {
  assert.equal(
    mod.resolveProviderBaseForTestHelper('deepseek-official', {}, { DEEPSEEK_BASE_URL: 'https://env.example.com' }),
    'https://env.example.com'
  );
  assert.equal(
    mod.resolveProviderBaseForTestHelper('deepseek-official', { baseURL: 'https://profile.example.com/' }, { DEEPSEEK_BASE_URL: 'https://env.example.com' }),
    'https://profile.example.com',
    'profile.baseURL 优先于 env；尾斜杠已归一'
  );
  assert.equal(
    mod.resolveProviderBaseForTestHelper('deepseek-official', {}, {}),
    'https://api.deepseek.com',
    '无 env 无 profile 时落内置表'
  );
});

test('真正未知的 provider 仍返回空 base（保留 unknown-provider 报错路径语义）', () => {
  const home = mkdtempSync(join(tmpdir(), 'side-session-t4-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    writeFileSync(join(home, 'settings.yaml'), 'agent-default-model:\n  provider: some-unknown-vendor\n');
    assert.equal(mod.resolveProviderBase('some-unknown-vendor', mod.readProviderProfile('some-unknown-vendor')), '');
  } finally {
    process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});
