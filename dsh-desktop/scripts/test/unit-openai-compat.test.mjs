// @deepseek-ai/dsh-openclaw-bridge/lib/openai-compat.js 适配器端到端测试。
// 通过 mock 全局 fetch 注入一条带 usage 的 SSE 流，验证：
//   · mapUsage 的 DISJOINT 契约：inputTokens = prompt − cacheRead − cacheWrite，
//     缓存写 token 单列 cacheWriteTokens（避免计费侧重复计费）；
//   · usage 携带 model 字段（余额小部件按会话真实模型取价的数据源）；
//   · 兼容多种 provider 字段命名（cached_tokens / prompt_cache_hit_tokens 等）；
//   · 输入缺失/异常时非负下限。
// 纯内存 mock，无网络、无文件系统。

import test from 'node:test';
import assert from 'node:assert';
import { OpenAiCompatAdapter, PROVIDER_ID } from '../../assets/plugins/dsh-openclaw-bridge/lib/openai-compat.js';

/** 把一段 SSE 文本变成 Response-like 对象（body 为 ReadableStream）。 */
function sseResponse(text) {
  const bytes = new TextEncoder().encode(text);
  const CHUNK = 32;
  let offset = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          async read() {
            if (offset >= bytes.length) return { done: true, value: undefined };
            const value = bytes.slice(offset, offset + CHUNK);
            offset += CHUNK;
            return { done: false, value };
          },
          releaseLock() {},
        };
      },
    },
  };
}

function baseOptions(overrides = {}) {
  return {
    model: 'my-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...overrides,
  };
}

/** 跑一次 stream 并收集全部 chunk。 */
async function collectUsage(getConfig, options, usageJson, extraSse = '') {
  const sse = [
    'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}',
    '',
    'data: {"choices":[],"usage":' + JSON.stringify(usageJson) + '}',
    '',
    extraSse,
    'data: [DONE]',
    '',
  ].join('\n') + '\n'; // 末帧必须以空行收尾（parseSse 只消费完整帧）
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => sseResponse(sse);
  try {
    const adapter = new OpenAiCompatAdapter(getConfig);
    const chunks = [];
    for await (const chunk of adapter.stream(options)) chunks.push(chunk);
    return chunks;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function getConfig() {
  return { baseURL: 'http://localhost:9999/v1', apiKey: 'sk-test-key-123', model: 'my-model' };
}

test('mapUsage DISJOINT 契约: inputTokens=prompt−cacheRead−cacheWrite，缓存写单列', async () => {
  const chunks = await collectUsage(getConfig, baseOptions(), {
    prompt_tokens: 1000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 300, cache_creation_tokens: 100 },
    completion_tokens_details: { reasoning_tokens: 50 },
  });
  const usageChunk = chunks.find((c) => c.type === 'usage');
  assert.ok(usageChunk, '应产出 usage chunk');
  const u = usageChunk.usage;
  assert.strictEqual(u.inputTokens, 600, '1000 − 300(读) − 100(写) = 600');
  assert.strictEqual(u.outputTokens, 200);
  assert.strictEqual(u.cacheReadTokens, 300);
  assert.strictEqual(u.cacheWriteTokens, 100, '缓存写 token 必须单列（按 miss 价计费）');
  assert.strictEqual(u.reasoningTokens, 50);
  // 不变量：三桶之和 == prompt_tokens（绝不重复计费）
  assert.strictEqual(u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens, 1000);
});

test('mapUsage 兼容旧命名（prompt_cache_hit_tokens / prompt_cache_write_tokens）', async () => {
  const chunks = await collectUsage(getConfig, baseOptions(), {
    prompt_tokens: 500,
    completion_tokens: 50,
    prompt_cache_hit_tokens: 200,
    prompt_cache_write_tokens: 50,
  });
  const u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.cacheReadTokens, 200);
  assert.strictEqual(u.cacheWriteTokens, 50);
  assert.strictEqual(u.inputTokens, 250);
});

test('mapUsage 无 details 字段: 全量计入 inputTokens，无缓存字段', async () => {
  const chunks = await collectUsage(getConfig, baseOptions(), {
    prompt_tokens: 700,
    completion_tokens: 80,
  });
  const u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.inputTokens, 700);
  assert.strictEqual(u.outputTokens, 80);
  assert.strictEqual(u.cacheReadTokens, undefined);
  assert.strictEqual(u.cacheWriteTokens, undefined);
});

test('mapUsage 异常输入: 缺失/NaN/负数 prompt → 非负下限，不产出 NaN', async () => {
  const cases = [
    { completion_tokens: 10 }, // prompt 缺失
    { prompt_tokens: 'abc', completion_tokens: 10 }, // NaN
    { prompt_tokens: 50, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 300 } }, // 缓存读 > prompt
  ];
  for (const wire of cases) {
    const chunks = await collectUsage(getConfig, baseOptions(), wire);
    const u = chunks.find((c) => c.type === 'usage').usage;
    assert.ok(Number.isFinite(u.inputTokens), 'inputTokens 必须有限：' + JSON.stringify(wire));
    assert.ok(u.inputTokens >= 0, 'inputTokens 非负：' + JSON.stringify(wire));
    assert.ok(Number.isFinite(u.outputTokens) && u.outputTokens >= 0);
  }
});

test('mapUsage cache 字段为数字串/垃圾串 → 规整为 number 或忽略，不产出 NaN', async () => {
  // 数字字符串 → 规整为 number
  let chunks = await collectUsage(getConfig, baseOptions(), {
    prompt_tokens: 1000,
    completion_tokens: 100,
    prompt_cache_hit_tokens: '300',
    prompt_cache_write_tokens: '100',
  });
  let u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.cacheReadTokens, 300, '数字串 cacheRead 应规整为 number');
  assert.strictEqual(u.cacheWriteTokens, 100);
  assert.strictEqual(u.inputTokens, 600, '1000 − 300 − 100 = 600');
  // 垃圾串 → 视为无该字段（省略 + 按 0 参与减法），inputTokens 不被污染为 NaN
  chunks = await collectUsage(getConfig, baseOptions(), {
    prompt_tokens: 1000,
    completion_tokens: 100,
    prompt_cache_hit_tokens: 'abc',
    prompt_cache_write_tokens: 'xyz',
  });
  u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.cacheReadTokens, undefined, '垃圾串 cacheRead 应被忽略');
  assert.strictEqual(u.cacheWriteTokens, undefined);
  assert.strictEqual(u.inputTokens, 1000, '垃圾串缓存不参与减法，inputTokens = prompt');
  assert.ok(Number.isFinite(u.inputTokens));
});

test('usage 携带 model 字段（按会话真实模型取价的数据源）', async () => {
  const chunks = await collectUsage(getConfig, baseOptions({ model: 'deepseek-v4-pro' }), {
    prompt_tokens: 100,
    completion_tokens: 10,
  });
  const u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.model, 'deepseek-v4-pro');
});

test('usage 不带 model（options.model 缺失）时无 model 字段（兼容旧契约）', async () => {
  const chunks = await collectUsage(getConfig, baseOptions({ model: undefined }), {
    prompt_tokens: 100,
    completion_tokens: 10,
  });
  const u = chunks.find((c) => c.type === 'usage').usage;
  assert.strictEqual(u.model, undefined);
});

test('translate: [DONE] 前 usage 延迟至结束产出；文本 delta 正常', async () => {
  const chunks = await collectUsage(getConfig, baseOptions(), { prompt_tokens: 10, completion_tokens: 5 });
  const kinds = chunks.map((c) => c.type);
  assert.ok(kinds.includes('text-delta'));
  assert.ok(kinds.includes('usage'));
  assert.ok(kinds.includes('finish'));
  const finish = chunks.find((c) => c.type === 'finish');
  assert.deepStrictEqual(finish.reason, { kind: 'stop' });
});

test('providerInfo / PROVIDER_ID 稳定（对外接口契约）', () => {
  const adapter = new OpenAiCompatAdapter(getConfig);
  assert.strictEqual(PROVIDER_ID, 'openclaw-custom');
  const info = adapter.providerInfo('openclaw-custom');
  assert.strictEqual(info.id, 'openclaw-custom');
  assert.ok(info.name.length > 0);
});
