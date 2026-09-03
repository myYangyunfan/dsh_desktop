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

// ---------------------------------------------------------------------------
// issue #173「自定义提供方接入失败」：minimax / minimax-cn 接入。
// 根因：内核 pi-ai 内置表（@earendil-works/pi-ai/providers/all）以 anthropic-messages
// 协议注册 minimax（国际 https://api.minimax.io/anthropic，env MINIMAX_API_KEY）与
// minimax-cn（国内 https://api.minimaxi.com/anthropic，env MINIMAX_CN_API_KEY）；
// side-session 的 KNOWN_PROVIDERS 缺这两条 → 用户配 minimax-cn/MiniMax-M3 后 mode1 报
// unknown-provider「无法确定 API 端点」。补齐为 openai:false：base 非空使其从
// 「未知供应商」转为「协议不支持→引导 mode2/3」（mode3 经宿主 LLM 走 pi-ai 可正常调用）。
// 证据：node_modules/@earendil-works/pi-ai/dist/providers/minimax{,-cn}.js
// ---------------------------------------------------------------------------
test('KNOWN_PROVIDERS 覆盖 minimax / minimax-cn（对齐 pi-ai anthropic-messages 端点）', () => {
  const cn = mod.KNOWN_PROVIDERS['minimax-cn'];
  assert.ok(cn, '缺 minimax-cn：用户配 minimax-cn/MiniMax-M3 会报 unknown-provider');
  assert.equal(cn.base, 'https://api.minimaxi.com/anthropic', '国内端点须与 pi-ai minimax-cn.js baseUrl 一致');
  assert.equal(cn.env, 'MINIMAX_CN_API_KEY', 'env 须与 pi-ai envApiKeyAuth 一致');
  assert.equal(cn.openai, false, 'pi-ai 以 anthropic-messages 提供 MiniMax，非 OpenAI 兼容，mode1 不能直连 /chat/completions');

  const io = mod.KNOWN_PROVIDERS['minimax'];
  assert.ok(io, '缺 minimax（国际站）');
  assert.equal(io.base, 'https://api.minimax.io/anthropic');
  assert.equal(io.env, 'MINIMAX_API_KEY');
  assert.equal(io.openai, false);
});

test('minimax-cn 可解析出 base/env：不再触发 unknown-provider，并引导到非直连模式', () => {
  const home = mkdtempSync(join(tmpdir(), 'side-session-mm-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    writeFileSync(join(home, 'settings.yaml'), [
      'agent-default-model:',
      '  provider: minimax-cn',
      '  model: MiniMax-M3',
    ].join('\n'));
    const profile = mod.readProviderProfile('minimax-cn');
    // base 能从内置表解析出来（非空）→ resolveGlobalForMode1 不再判 unknown-provider。
    assert.equal(mod.resolveProviderBase('minimax-cn', profile), 'https://api.minimaxi.com/anthropic');
    // env 命中内置表，且与插件启发式 ${PROVIDER}_API_KEY 逐字一致（凭据解析对齐）。
    assert.equal(mod.KNOWN_PROVIDERS['minimax-cn'].env, 'MINIMAX_CN_API_KEY');
    assert.equal('minimax-cn'.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase() + '_API_KEY', 'MINIMAX_CN_API_KEY');
    // openai:false → mode1 走 protocol-unsupported 分支（引导 mode2/3），而非 unknown-provider。
    assert.equal(mod.KNOWN_PROVIDERS['minimax-cn'].openai, false);
  } finally {
    process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('补齐的其它 pi-ai 内置 OpenAI 兼容供应商能被 mode1 解析出 base', () => {
  for (const [p, base] of [
    ['baseten', 'https://inference.baseten.co/v1'],
    ['xiaomi-token-plan-cn', 'https://token-plan-cn.xiaomimimo.com/v1'],
    ['qwen-token-plan-individual', 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'],
  ]) {
    const entry = mod.KNOWN_PROVIDERS[p];
    assert.ok(entry, '缺 ' + p);
    assert.equal(entry.openai, true, p + ' 在 pi-ai 里是 openai-completions，mode1 可直连');
    assert.equal(mod.resolveProviderBaseForTestHelper(p, {}, {}), base);
  }
});
