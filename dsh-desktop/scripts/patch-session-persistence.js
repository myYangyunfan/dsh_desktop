'use strict';

// Make the JSONL persistence reader tolerate recoverable crash states:
// 1) the final zstd frame is structurally complete but its plaintext ends
//    halfway through one JSONL record (torn tail);
// 2) a whole session log is corrupt (bad frame magic / zero-padded head) —
//    it must be skipped with a warning instead of crashing the entire
//    plugin-tree init (2026-08 incident: shadow-copy restored logs with
//    zero-padded heads bricked app startup).
// The actual transforms live in runtime-patches.js so the desktop boot path,
// WSL sync, postinstall, and afterPack share them.

const fs = require('node:fs');
const path = require('node:path');
const { applyPatchToFiles } = require('./lib/patch-engine');
const {
  PERSISTENCE_PKG_REL,
  transformPersistenceAll,
} = require('./lib/runtime-patches');

function patchSessionPersistence(nmRoot, log = () => {}) {
  const file = path.join(nmRoot, '@deepseek-ai', PERSISTENCE_PKG_REL);
  if (!fs.existsSync(file)) return 0;
  return applyPatchToFiles({
    prefix: '会话持久化容错补丁',
    files: [file],
    log,
    transform: transformPersistenceAll,
    alreadyLog: (target) => '已应用，跳过 ' + target,
    doneLog: (target) => '已应用 zstd 尾部/损坏会话容错 ' + target,
    anchorLog: log,
    failLog: (target, error) => '会话持久化容错补丁失败(' + target + '): ' + error.message,
  });
}

module.exports = { patchSessionPersistence };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'node_modules'));
  const changed = patchSessionPersistence(root, (message) => console.log(message));
  console.log(`会话持久化容错补丁: ${changed > 0 ? '已应用' : '无变化'}`);
}
