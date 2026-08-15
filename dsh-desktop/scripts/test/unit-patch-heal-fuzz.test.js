'use strict';

// profile-patch-heal.js 的确定性模糊/性质测试（node --test）。
// 对 dedupePatchEntries / dropBlocksByIds 做 3000 组确定性随机输入验证。
// 性质：
//   1. 输出 YAML 必须可解析为顶层数组（同 dsh 方言，JSON_SCHEMA + !!js 标量）；
//   2. 幂等：二次调用 removed 为空且文本逐字节不变；
//   3. 每个 id 在 insert 注册块中的出现次数 → 恰好 1（输入 ≥1 时）；
//   4. 非 insert 块（config/disabled/注释）逐字节保留（dedupe 全部保留；
//      dropBlocks 仅允许删除 name-only 直注册块）；
//   5. 无重复时零修改（逐字节相等）。

const test = require('node:test');
const assert = require('node:assert');
const { dedupePatchEntries, dropBlocksByIds } = require('../../profile-patch-heal.js');
const yaml = require('../../node_modules/js-yaml');

const jsType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: () => true,
  construct: (d) => ({ __jsExpr: d }),
});
const load = (c) => yaml.load(c, { schema: yaml.JSON_SCHEMA.extend(jsType) });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const IDS = ['a', 'b', 'c', 'd'];

function topBlocks(lines) {
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) if (/^-(\s|$)/.test(lines[i])) starts.push(i);
  const blocks = [];
  for (let s = 0; s < starts.length; s += 1) {
    const begin = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    blocks.push({
      lines: lines.slice(begin, end),
      insert: /^-\s*insert\s*:/.test(lines[begin]),
    });
  }
  return blocks;
}

function registrationCount(text) {
  const counts = new Map();
  for (const b of topBlocks(text.split(/\r?\n/))) {
    if (!b.insert) continue;
    for (const line of b.lines) {
      const m = /^\s*-\s*id:\s*([A-Za-z0-9_-]+)/.exec(line);
      if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
  }
  return counts;
}

function nonInsertBlocks(text) {
  return topBlocks(text.split(/\r?\n/)).filter((b) => !b.insert).map((b) => b.lines.join('\n'));
}

function genPatch(rand) {
  const blocks = [];
  const n = 2 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i += 1) {
    const kind = i === 0 ? 0.1 : rand(); // 首块固定为 insert：保证输入是合法顶层数组
    if (kind < 0.5) {
      const rows = 1 + Math.floor(rand() * 3);
      const lines = ['- insert:'];
      for (let j = 0; j < rows; j += 1) {
        const id = IDS[Math.floor(rand() * IDS.length)];
        lines.push('    - id: ' + id);
        lines.push("      name: 'pkg-" + id + "'");
      }
      blocks.push(lines.join('\n'));
    } else if (kind < 0.7) {
      blocks.push('- id: ' + IDS[Math.floor(rand() * IDS.length)] + '\n  disabled: true');
    } else if (kind < 0.9) {
      blocks.push('- id: ' + IDS[Math.floor(rand() * IDS.length)] + '\n  config:\n    k: v');
    } else {
      blocks.push('# comment block');
    }
  }
  return '# head\n' + blocks.join('\n') + '\n';
}

test('fuzz 性质验证：3000 组确定性随机输入（dedupe/drop 幂等、可解析、注册唯一、非注册块保留、零写入）', () => {
  let crlfChecked = false;
  for (let seed = 1; seed <= 3000; seed += 1) {
    const rand = rng(seed * 7919);
    const p = genPatch(rand);
    const tag = `seed=${seed}`;
    assert.ok(Array.isArray(load(p)), `${tag} 输入可解析为数组`);
    if (!crlfChecked) {
      const crlf = p.replace(/\n/g, '\r\n');
      assert.ok(Array.isArray(load(dedupePatchEntries(crlf).text)), 'CRLF 输入输出可解析');
      crlfChecked = true;
    }

    // ---- dedupe 性质 ----
    const before = registrationCount(p);
    const nonBefore = nonInsertBlocks(p);
    const r1 = dedupePatchEntries(p);
    assert.ok(Array.isArray(load(r1.text)), `${tag} dedupe 输出可解析`);
    const r2 = dedupePatchEntries(r1.text);
    assert.ok(r2.removed.length === 0 && r2.text === r1.text, `${tag} dedupe 幂等`);
    if (r1.removed.length === 0) assert.strictEqual(r1.text, p, `${tag} 无重复零修改`);
    const after = registrationCount(r1.text);
    for (const [id, n] of before) {
      assert.strictEqual(after.get(id) || 0, n > 0 ? 1 : 0, `${tag} id=${id} 注册行唯一`);
    }
    assert.deepStrictEqual(nonInsertBlocks(r1.text), nonBefore, `${tag} dedupe 非 insert 块逐字节保留`);

    // ---- dropBlocks 性质 ----
    const dropIds = IDS.filter(() => rand() < 0.5);
    const d1 = dropBlocksByIds(p, dropIds);
    assert.ok(Array.isArray(load(d1.text)), `${tag} drop 输出可解析`);
    const d2 = dropBlocksByIds(d1.text, dropIds);
    assert.ok(d2.removed.length === 0 && d2.text === d1.text, `${tag} drop 幂等`);
    if (dropIds.length === 0) assert.strictEqual(d1.text, p, `${tag} 空移除集零修改`);
    const dAfter = registrationCount(d1.text);
    for (const id of IDS) {
      if (dropIds.includes(id)) {
        assert.strictEqual(dAfter.get(id) || 0, 0, `${tag} drop 移除注册行 id=${id}`);
      } else {
        assert.strictEqual(dAfter.get(id) || 0, before.get(id) || 0, `${tag} drop 保留未命中注册行 id=${id}`);
      }
    }
    const removable = (b) => {
      const hit = /^\s*-\s*id:\s*([A-Za-z0-9_-]+)/m.exec(b);
      if (!hit || !dropIds.includes(hit[1])) return false;
      const body = b.split(/\r?\n/).slice(1).filter((l) => l.trim() !== '');
      return body.length > 0 && body.every((l) => /^\s*name\s*:/.test(l));
    };
    const nonDAfter = nonInsertBlocks(d1.text).filter((b) => !removable(b));
    const nonDBefore = nonBefore.filter((b) => !removable(b));
    assert.deepStrictEqual(nonDAfter, nonDBefore, `${tag} drop 非注册配置块逐字节保留`);
  }
});
