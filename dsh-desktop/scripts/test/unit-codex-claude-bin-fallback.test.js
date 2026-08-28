'use strict';

// ---------------------------------------------------------------------------
// Codex / Claude 子代理本地二进制回落补丁单元测试（node --test）。
//
// 安装包瘦身移除 @openai/codex-win32-x64 / @anthropic-ai/claude-agent-sdk-win32-x64
// 原生二进制后，补丁分别向 @openai/codex/bin/codex.js 与
// @deepseek-ai/dsh-subagent-claude-code/lib/index.js 注入 CODEX_BIN / CLAUDE_BIN
// 回落。本测试用真实包源验证三态（changed / already / anchor-missing）+ 幂等，
// 并对 changed 产物跑 node --check 防注入破坏语法。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const adapters = require('../lib/patch-adapters');
const { transformCodexLocalBinFallback, transformClaudeLocalBinFallback } = adapters;
const { CODEX_LOCAL_BIN_MARKER, CLAUDE_LOCAL_BIN_MARKER } = adapters.markers;

const NM = path.join(__dirname, '..', '..', 'node_modules');
const CODEX_FILE = path.join(NM, '@openai', 'codex', 'bin', 'codex.js');
const CLAUDE_FILE = path.join(NM, '@deepseek-ai', 'dsh-subagent-claude-code', 'lib', 'index.js');

/** 落盘产物语法合法（写临时 .mjs，node --check 只验语法不解析依赖）。 */
function checkSyntax(src, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bin-fallback-'));
  const file = path.join(dir, label + '.mjs');
  fs.writeFileSync(file, src, 'utf8');
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(r.status, 0, `${label} 产物语法不合法: ${r.stderr || ''}`);
}

test('transformCodexLocalBinFallback：真实包三态 + 幂等 + 产物语法', () => {
  // 真实包源（dsh-desktop/node_modules 未被 postinstall/patch-deps 碰过，对
  // 本补丁是 pristine；打过补丁后则 already，两态都合法，真正的失配是 anchor-missing）。
  const real = fs.readFileSync(CODEX_FILE, 'utf8');
  const changed = transformCodexLocalBinFallback(real, CODEX_FILE);
  assert.ok(
    changed.status === 'changed' || changed.status === 'already',
    `codex 真实包应命中锚点或已应用，得 ${changed.status}`,
  );
  const patched = changed.status === 'changed' ? changed.src : real;
  assert.ok(patched.includes(CODEX_LOCAL_BIN_MARKER), '注入体应含 marker');
  assert.ok(patched.includes('process.env.CODEX_BIN'), '应回退到 CODEX_BIN');
  assert.ok(patched.includes('path.delimiter'), '应扫描 PATH');
  assert.ok(patched.includes('codex.exe'), 'Windows 下应探测 codex.exe');
  // 幂等：marker 在场 → already。
  assert.equal(transformCodexLocalBinFallback(patched, CODEX_FILE).status, 'already');
  // 失配：无锚点 → anchor-missing，绝不改写。
  const miss = transformCodexLocalBinFallback('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
  // 最终产物语法合法（ESM）。
  checkSyntax(patched, 'codex-patched');
});

test('transformClaudeLocalBinFallback：真实包三态 + 幂等 + 产物语法', () => {
  const real = fs.readFileSync(CLAUDE_FILE, 'utf8');
  const changed = transformClaudeLocalBinFallback(real, CLAUDE_FILE);
  assert.ok(
    changed.status === 'changed' || changed.status === 'already',
    `claude 真实包应命中锚点或已应用，得 ${changed.status}`,
  );
  const patched = changed.status === 'changed' ? changed.src : real;
  assert.ok(patched.includes(CLAUDE_LOCAL_BIN_MARKER), '注入体应含 marker');
  assert.ok(patched.includes('pathToClaudeCodeExecutable'), '应透传 pathToClaudeCodeExecutable');
  assert.ok(patched.includes('process.env.CLAUDE_BIN'), '应回退到 CLAUDE_BIN');
  // 幂等：marker 在场 → already。
  assert.equal(transformClaudeLocalBinFallback(patched, CLAUDE_FILE).status, 'already');
  // 失配：无锚点 → anchor-missing，绝不改写。
  const miss = transformClaudeLocalBinFallback('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
  // 最终产物语法合法（ESM）。
  checkSyntax(patched, 'claude-patched');
});
