'use strict';
// Patch the bundled @deepseek-ai/dsh-session event vocabulary so that
// out-of-repo plugin events (dsh-agent-teams, dsh-message-edit,
// dsh-web-search-exa) are accepted by the session reader, fixing:
//
//   history unavailable for session "...": SessionFormatUnsupportedError:
//   session "..." contains event type "agent-teams/team-created" (seq N)
//   unknown to this harness and not marked ignorable; refusing to interpret
//   the log — it was likely written by a newer harness
//
// Root cause: the session reader only accepts event types in the generated
// KNOWN_SESSION_EVENT_TYPES vocabulary (or events explicitly marked
// ignorable). Plugin events are out-of-repo, `Session.append()` exposes no
// ignorable option, and the core has no registration surface for them yet
// (see deepseek-ai/deepseek-harness discussion #802).
//
// This script adds the plugin event types to BOTH copies of the vocabulary
// (@deepseek-ai/dsh-session/lib/index.js and lib/types/known-event-types.js).
// The vocabulary Set is located BY CONTENT (contains "agent-preset/selected"),
// never by "first Set literal in the file" — that one is SURFACE_EVENT_TYPES
// and must not be touched. Idempotent: safe to run any number of times, and
// after a DSH Desktop app update overwrites the packaged files.
//
// Usage:
//   node scripts/patch-event-vocabulary.js <path-to-dsh-session-package-dir>
// (also exported for use from after-pack.js)

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const AGENT_TEAMS = [
  'agent-teams/member-added',
  'agent-teams/member-removed',
  'agent-teams/message-sent',
  'agent-teams/task-created',
  'agent-teams/task-updated',
  'agent-teams/team-created',
  'agent-teams/team-deleted',
];
const WANTED = [
  ...AGENT_TEAMS,
  'message-edit/version',
  'web/exa-search-request',
];

function setSpans(text) {
  const spans = [];
  let i = 0;
  for (;;) {
    const j = text.indexOf('new Set([', i);
    if (j === -1) break;
    const k = text.indexOf(']);', j);
    if (k === -1) break;
    spans.push({ start: j, end: k + 3 });
    i = k + 3;
  }
  return spans;
}

function itemsOf(body, quote) {
  const re = new RegExp(`${quote}([^${quote}]+)${quote}`, 'g');
  const items = [];
  let m;
  while ((m = re.exec(body)) !== null) items.push(m[1]);
  return items;
}

function replaceSet(text, span, items, indent, quote) {
  const lines = items.map((t) => `${indent}${quote}${t}${quote},`);
  return text.slice(0, span.start)
    + `new Set([\n${lines.join('\n')}\n${indent}]);`
    + text.slice(span.end);
}

function patchFile(file, quote) {
  const src = fs.readFileSync(file, 'utf8');
  const knownSpan = setSpans(src).find((s) =>
    itemsOf(src.slice(s.start, s.end), quote).includes('agent-preset/selected'));
  if (!knownSpan) {
    console.warn(`patch-event-vocabulary: KNOWN_SESSION_EVENT_TYPES not found in ${file}`);
    return 0;
  }
  const current = itemsOf(src.slice(knownSpan.start, knownSpan.end), quote);
  const missing = WANTED.filter((w) => !current.includes(w));
  if (missing.length === 0) {
    console.log(`patch-event-vocabulary: ${file} already patched (${current.length} types)`);
    return 0;
  }
  const sorted = [...current];
  for (const item of missing) {
    const at = sorted.findIndex((x) => x > item);
    sorted.splice(at === -1 ? sorted.length : at, 0, item);
  }
  const indent = file.endsWith('index.js') ? '\t' : '    ';
  writeFileAtomic(file, replaceSet(src, knownSpan, sorted, indent, quote));
  console.log(`patch-event-vocabulary: ${file} +${missing.length} types (${sorted.length} total)`);
  return missing.length;
}

/** Patch both vocabulary copies under the @deepseek-ai/dsh-session package dir. */
function patchDshSessionVocabulary(sessionPkgDir) {
  const targets = [
    [path.join(sessionPkgDir, 'lib', 'index.js'), '"'],
    [path.join(sessionPkgDir, 'lib', 'types', 'known-event-types.js'), "'"],
  ];
  let changed = 0;
  for (const [file, quote] of targets) {
    if (!fs.existsSync(file)) {
      console.warn(`patch-event-vocabulary: missing ${file}`);
      continue;
    }
    changed += patchFile(file, quote);
  }
  return changed;
}

module.exports = { patchDshSessionVocabulary, WANTED };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/patch-event-vocabulary.js <path-to-dsh-session-package-dir>');
    process.exit(2);
  }
  const changed = patchDshSessionVocabulary(path.resolve(dir));
  console.log(changed > 0
    ? `patched ${changed} type(s) — restart DSH Desktop to pick it up`
    : 'nothing to patch (already up to date)');
}
