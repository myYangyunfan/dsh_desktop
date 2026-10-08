// 页内 bundle 的 settingsScope 替代适配器（bindSettingsScope）的契约测试。
//
// 为什么测它：内核里没有 `ctx.settingsScope` 这个服务（@deepseek-ai/* 全文 0 处命中），
// 真实形状是 `ctx.remote.settings.describe()/mutate()`。这个适配器是 7 个包共用的形状，
// 而它最容易错的地方正是**取值的键**：内核 describe() 的 ns 是 profile 条目 id
// （`conversation-tweaks`），不是包名、也不是历史上写死的 `dsh-conversation-tweaks`。
// 用错键不报错，只是永远取不到值 —— 所以必须有一条用例专门把键钉住。
//
// 反证要求：下面每项判据都配一条「拆掉它结论必须翻转」的用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, '..', 'lib', 'client.js');
const ENTRY_ID = 'conversation-tweaks';

/**
 * 从 bundle 里把 bindSettingsScope 抠出来单独执行。
 * bundle 是 classic-script 工厂，整份跑起来要 react 与一堆宿主服务；
 * 这里只取这一个函数（它不依赖闭包外的任何东西），避免为了测试给产物开导出。
 */
function loadAdapter() {
  const src = readFileSync(BUNDLE, 'utf8');
  const start = src.indexOf('function bindSettingsScope(');
  assert.ok(start >= 0, 'bundle 里找不到 bindSettingsScope —— 适配器被删了或改名了');
  // 从函数头开始，按花括号配平切出整个函数体。
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  assert.ok(end > 0, 'bindSettingsScope 花括号不配平');
  return new Function(`return (${src.slice(start, end)})`)();
}

/** 造一个假的 ctx.remote.settings，记录调用。 */
function fakeRemote(namespaces, opts = {}) {
  const calls = { describe: 0, mutate: [] };
  return {
    calls,
    ctx: {
      remote: {
        settings: {
          async describe() {
            calls.describe += 1;
            if (opts.throwOnDescribe) throw new Error('boom');
            return opts.notOk
              ? { ok: false, error: { message: 'gateway/down' } }
              : { ok: true, value: { writable: opts.writable !== false, namespaces } };
          },
          async mutate(ns, ops, revision) {
            calls.mutate.push({ ns, ops, revision });
            if (opts.failMutate) return { ok: false, error: { message: 'rejected-by-schema' } };
            const value = { ...namespaces[0].value, [ops[0].path[0]]: ops[0].value };
            return { ok: true, value: { value, revision: namespaces[0].revision + 1 } };
          }
        }
      }
    }
  };
}

const row = (ns, value, revision = 3) => ({ ns, value, revision, applies: 'live' });

const settle = async (scope, times = 3) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
  return scope.getSnapshot();
};

test('按 profile 条目 id 取值，不是包名也不是 dsh- 前缀 NS', async () => {
  const { ctx } = fakeRemote([row(ENTRY_ID, { quietOutput: true })]);
  const scope = loadAdapter()(ctx, ENTRY_ID);
  const snap = await settle(scope);
  assert.equal(snap.status, 'ready');
  assert.equal(snap.value.quietOutput, true);
  assert.equal(snap.revision, 3);
});

test('反证：键不对时必须落到 missing，而不是假装 ready', async () => {
  const { ctx } = fakeRemote([row('dsh-conversation-tweaks', { quietOutput: true })]);
  const scope = loadAdapter()(ctx, ENTRY_ID);
  const snap = await settle(scope);
  assert.equal(snap.status, 'missing');
  assert.equal(snap.value, undefined);
});

test('写回走 mutate(ns, [{op:"set",path:[field],value}], revision)', async () => {
  const { ctx, calls } = fakeRemote([row(ENTRY_ID, { quietOutput: false })]);
  const scope = loadAdapter()(ctx, ENTRY_ID);
  await settle(scope);
  await scope.set('quietOutput', true);
  assert.equal(calls.mutate.length, 1);
  assert.deepEqual(calls.mutate[0], {
    ns: ENTRY_ID,
    ops: [{ op: 'set', path: ['quietOutput'], value: true }],
    revision: 3
  });
  assert.equal(scope.getSnapshot().value.quietOutput, true);
  assert.equal(scope.getSnapshot().revision, 4, '写回后要采纳服务端新 revision');
});

test('反证：describe 失败/不 ok 时不能停在 ready', async () => {
  const a = fakeRemote([], { throwOnDescribe: true });
  const sa = loadAdapter()(a.ctx, ENTRY_ID);
  assert.equal((await settle(sa)).status, 'failed');

  const b = fakeRemote([], { notOk: true });
  const sb = loadAdapter()(b.ctx, ENTRY_ID);
  assert.equal((await settle(sb)).status, 'failed');
});

test('反证：mutate 被拒时 set 必须抛，不能静默成功', async () => {
  const { ctx } = fakeRemote([row(ENTRY_ID, { quietOutput: false })], { failMutate: true });
  const scope = loadAdapter()(ctx, ENTRY_ID);
  await settle(scope);
  await assert.rejects(() => scope.set('quietOutput', true), /rejected-by-schema/);
});

test('快照引用要稳定：值没变就不换对象、也不通知订阅者', async () => {
  const { ctx } = fakeRemote([row(ENTRY_ID, { quietOutput: true })]);
  const scope = loadAdapter()(ctx, ENTRY_ID);
  const first = await settle(scope);
  let notified = 0;
  scope.subscribe(() => { notified += 1; });
  // 再取两次同样的值：数组顺序、键序都相同，只是对象是新的。
  await settle(scope, 6);
  assert.equal(scope.getSnapshot(), first, '同值必须复用同一个快照对象');
  assert.equal(notified, 0, '同值不得触发重渲染');
});

test('值真的变了必须换对象并通知', async () => {
  let value = { quietOutput: false };
  const ctx = {
    remote: {
      settings: {
        describe: async () => ({ ok: true, value: { writable: true, namespaces: [{ ...row(ENTRY_ID, value) }] } }),
        mutate: async () => { value = { quietOutput: true }; return { ok: true, value: { value, revision: 9 } }; }
      }
    }
  };
  const scope = loadAdapter()(ctx, ENTRY_ID);
  const before = await settle(scope);
  let notified = 0;
  scope.subscribe(() => { notified += 1; });
  await scope.set('quietOutput', true);
  assert.notEqual(scope.getSnapshot(), before);
  assert.equal(scope.getSnapshot().value.quietOutput, true);
  assert.equal(notified, 1);
});

test('bundle 里不得再出现幽灵服务 settingsScope（注释除外）', () => {
  const src = readFileSync(BUNDLE, 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l)).join('\n');
  assert.ok(!/settingsScope/.test(code), '代码里仍有 settingsScope 引用');
  assert.match(code, /exports\.inject\s*=\s*\[[^\]]*"remote"/, 'inject 必须声明 remote');
});

test('宿主半边必须把该字段标 volatile，否则内核不为它生成表单', () => {
  const host = readFileSync(resolve(HERE, '..', 'lib', 'index.js'), 'utf8');
  assert.match(host, /quietOutput:\s*z\.boolean\(\)\.volatile\(\)/, 'quietOutput 必须 volatile');
  assert.ok(!/settings\.register/.test(host.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')));
});
