'use strict';
// 依赖层小补丁（幂等）：目录选择器 worker 无消息退出时，把真实退出码/信号带进
// 错误文案。由 postinstall / pack / dist 在打包前应用；匹配失败只告警不中断。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-host-directory-picker-native', 'lib', 'index.js');

const PATCH_MARKER = 'worker.on("exit", (code, signal) => {';
const OLD_RE = /worker\.on\("exit", \(\) => \{\s*settle\(\(\) => \{\s*reject\(\/\* @__PURE__ \*\/ new Error\("win32 folder dialog worker exited before reporting a result"\)\);\s*\}\);\s*\}\);/;
const NEW_BLOCK = [
  'worker.on("exit", (code, signal) => {',
  '\t\tsettle(() => {',
  '\t\t\tconst suffix = signal ? ` (signal ${signal})` : typeof code === "number" ? ` (exit code ${code})` : "";',
  '\t\t\treject(/* @__PURE__ */ new Error(`win32 folder dialog worker exited before reporting a result${suffix}`));',
  '\t\t});',
  '\t});',
].join('\n');

const slashTriggerTarget = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-input-trigger', 'lib', 'client.js');
const slashTriggerManifest = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-client-ui-input-trigger', 'package.json');
const SLASH_PREFIX_MARKER = 'prefixCandidateNames = /* @__PURE__ */ new Map();';
const SLASH_PREFIX_LEGACY_MARKER = 'function leadingSlashHitOk(draft, index, names) {';
const SLASH_PREFIX_REQUIRED_MARKERS = [
  'this.leadingPrefixNames("/")',
  'this.prefixCandidateNames.delete(source);',
  'this.prefixCandidateNames.clear();',
  'hit.query === "" && hit.position === "leading"',
  'execute(outcome, span, source, launched)',
  'const sourcePosition = hit.trigger === "/" && hit.position === "inline" ? "leading" : hit.position;',
  'source.name === "command" && !launched',
  'this.execute(outcome, hit.span, src, false)'
];
const SLASH_PREFIX_OLD_LINES = [
  '\t\tfunction boundaryOk(draft, index, char) {',
  '\t\t\tif (index === 0) return true;',
  '\t\t\tconst prev = draft.charAt(index - 1);',
  '\t\t\tif (WHITESPACE.test(prev)) return true;',
  '\t\t\tif (WORD_CHAR.test(prev)) return false;',
  '\t\t\tif (char === "/") {',
  '\t\t\t\tif (prev === "/") return false;',
  '\t\t\t\tif (prev === ":" && index >= 2 && !WHITESPACE.test(draft.charAt(index - 2))) return false;',
  '\t\t\t}',
  '\t\t\treturn true;',
  '\t\t}'
];
const SLASH_PREFIX_HELPER_LINES = [
  '\t\tfunction leadingSlashHitOk(draft, index, names) {',
  '\t\t\tconst prefix = draft.slice(0, index);',
  '\t\t\tif (!/^\\s*(?:\\/[\\p{L}\\p{N}_-]+\\s+)*$/u.test(prefix)) return false;',
  '\t\t\tfor (const match of prefix.matchAll(/\\/([\\p{L}\\p{N}_-]+)\\s+/gu)) {',
  '\t\t\t\tif (!names.includes(match[1] ?? "")) return false;',
  '\t\t\t}',
  '\t\t\treturn true;',
  '\t\t}',
  ''
];
const SLASH_TRACK_OLD_LINES = [
  '\t\t\t\tconst raw = detectTrigger(draft, caret, guard);'
];
const SLASH_TRACK_LEGACY_LINES = [
  '\t\t\t\tlet raw = detectTrigger(draft, caret, guard);',
  '\t\t\t\tif (raw?.trigger === "/" && !leadingSlashHitOk(draft, raw.span.start, this.lexicon.getSnapshot().get("/") ?? [])) raw = null;'
];
const SLASH_TRACK_NEW_LINES = [
  '\t\t\t\tlet raw = detectTrigger(draft, caret, guard);',
  '\t\t\t\tif (raw?.trigger === "/" && !leadingSlashHitOk(draft, raw.span.start, this.leadingPrefixNames("/"))) raw = null;'
];
const SLASH_CACHE_FIELD_OLD_LINES = [
  '\t\t\tlexiconOffs = /* @__PURE__ */ new Map();'
];
const SLASH_CACHE_FIELD_NEW_LINES = [
  ...SLASH_CACHE_FIELD_OLD_LINES,
  '\t\t\tprefixCandidateNames = /* @__PURE__ */ new Map();'
];
const SLASH_SOURCE_REMOVE_OLD_LINES = [
  '\t\t\t\tthis.lexiconOffs.delete(source);',
  '\t\t\t\tthis.refreshLexicon();'
];
const SLASH_SOURCE_REMOVE_NEW_LINES = [
  '\t\t\t\tthis.lexiconOffs.delete(source);',
  '\t\t\t\tthis.prefixCandidateNames.delete(source);',
  '\t\t\t\tthis.refreshLexicon();'
];
const SLASH_DISPOSE_OLD_LINES = [
  '\t\t\t\tfor (const off of this.lexiconOffs.values()) off();',
  '\t\t\t\tthis.lexiconOffs.clear();'
];
const SLASH_DISPOSE_NEW_LINES = [
  ...SLASH_DISPOSE_OLD_LINES,
  '\t\t\t\tthis.prefixCandidateNames.clear();'
];
const SLASH_PREFIX_METHOD_ANCHOR = '\t\t\t/** Re-poll every lexicon-bearing source and publish the aggregated rolls (see the store doc). */';
const SLASH_PREFIX_METHOD_LINES = [
  '\t\t\tleadingPrefixNames(trigger) {',
  '\t\t\t\tconst names = new Set(this.lexicon.getSnapshot().get(trigger) ?? []);',
  '\t\t\t\tfor (const [source, cached] of this.prefixCandidateNames) {',
  '\t\t\t\t\tif (source.trigger !== trigger) continue;',
  '\t\t\t\t\tfor (const name of cached) names.add(name);',
  '\t\t\t\t}',
  '\t\t\t\treturn [...names];',
  '\t\t\t}',
  ''
];
const SLASH_FETCH_SETTLED_OLD_LINES = [
  '\t\t\t\t}).then((items) => {',
  '\t\t\t\t\tif (controller.signal.aborted) return;',
  '\t\t\t\t\tthis.reduce({'
];
const SLASH_FETCH_SETTLED_NEW_LINES = [
  '\t\t\t\t}).then((items) => {',
  '\t\t\t\t\tif (controller.signal.aborted) return;',
  '\t\t\t\t\tconst names = items.map((item) => item.name).filter((name) => typeof name === "string" && name !== "");',
  '\t\t\t\t\tconst previous = hit.query === "" && hit.position === "leading" ? void 0 : this.prefixCandidateNames.get(source);',
  '\t\t\t\t\tthis.prefixCandidateNames.set(source, new Set(previous === void 0 ? names : [...previous, ...names]));',
  '\t\t\t\t\tthis.reduce({'
];
const SLASH_FETCH_POSITION_OLD_LINES = [
  '\t\t\t\tconst projection = this.project();',
  '\t\t\t\tfor (const source of roster) source.candidates(projection, {',
  '\t\t\t\t\tquery: hit.query,',
  '\t\t\t\t\tposition: hit.position,'
];
const SLASH_FETCH_POSITION_NEW_LINES = [
  '\t\t\t\tconst projection = this.project();',
  '\t\t\t\tconst sourcePosition = hit.trigger === "/" && hit.position === "inline" ? "leading" : hit.position;',
  '\t\t\t\tfor (const source of roster) source.candidates(projection, {',
  '\t\t\t\t\tquery: hit.query,',
  '\t\t\t\t\tposition: sourcePosition,'
];
const SLASH_EXECUTE_CALL_OLD = 'this.execute(outcome, hit.span);';
const SLASH_EXECUTE_CALL_NEW = 'this.execute(outcome, hit.span, src);';
const SLASH_EXECUTE_SIGNATURE_OLD = 'execute(outcome, span) {';
const SLASH_EXECUTE_SIGNATURE_NEW = 'execute(outcome, span, source) {';
const SLASH_CLAIM_EXECUTE_OLD_LINES = [
  '				if ("claim" in outcome) return actx.bail(actx, "slash/input-begin-command", {',
  '					claim: outcome.claim,',
  '					span',
  '				}) === true;'
];
const SLASH_CLAIM_EXECUTE_GENERAL_LINES = [
  '				if ("claim" in outcome) return actx.bail(actx, "slash/input-insert-text", {',
  '					text: outcome.claim.token,',
  '					span',
  '				}) === true;'
];
const SLASH_CLAIM_EXECUTE_SCOPED_LINES = [
  '				if ("claim" in outcome && source.trigger === "/" && source.name === "command") return actx.bail(actx, "slash/input-insert-text", {',
  '					text: outcome.claim.token,',
  '					span',
  '				}) === true;',
  ...SLASH_CLAIM_EXECUTE_OLD_LINES
];
const SLASH_LAUNCHER_PICK_OLD_LINES = [
  '				this.stopFetch();',
  '				this.reduce({ type: "close" });',
  '				this.execute(outcome, hit.span, src);'
];
const SLASH_LAUNCHER_PICK_NEW_LINES = [
  '				const launched = this.launcher.getSnapshot() !== null;',
  '				this.stopFetch();',
  '				this.reduce({ type: "close" });',
  '				this.execute(outcome, hit.span, src, launched);'
];
const SLASH_LAUNCHER_SPACE_OLD = 'return this.execute(outcome, hit.span, src);';
const SLASH_LAUNCHER_SPACE_NEW = 'return this.execute(outcome, hit.span, src, false);';
const SLASH_LAUNCHER_SIGNATURE_OLD = 'execute(outcome, span, source) {';
const SLASH_LAUNCHER_SIGNATURE_NEW = 'execute(outcome, span, source, launched) {';
const SLASH_LAUNCHER_CLAIM_OLD = 'if ("claim" in outcome && source.trigger === "/" && source.name === "command") return actx.bail';
const SLASH_LAUNCHER_CLAIM_NEW = 'if ("claim" in outcome && source.trigger === "/" && source.name === "command" && !launched) return actx.bail';

function patchLeadingSlashPrefix() {
  if (!fs.existsSync(slashTriggerTarget) || !fs.existsSync(slashTriggerManifest)) {
    throw new Error('[patch-deps] missing dsh-client-ui-input-trigger 0.1.0-rc.6');
  }
  const manifest = JSON.parse(fs.readFileSync(slashTriggerManifest, 'utf8'));
  if (manifest.version !== '0.1.0-rc.6') {
    throw new Error(`[patch-deps] expected dsh-client-ui-input-trigger 0.1.0-rc.6, received ${String(manifest.version)}`);
  }
  let src = fs.readFileSync(slashTriggerTarget, 'utf8');
  const lineEnding = src.includes('\r\n') ? '\r\n' : '\n';
  const oldClaim = SLASH_CLAIM_EXECUTE_OLD_LINES.join(lineEnding);
  const generalClaim = SLASH_CLAIM_EXECUTE_GENERAL_LINES.join(lineEnding);
  const scopedClaim = SLASH_CLAIM_EXECUTE_SCOPED_LINES.join(lineEnding);
  if (src.includes(SLASH_PREFIX_MARKER)) {
    src = patchLeadingPrefixCandidatePosition(src, lineEnding);
    src = patchCommandClaimDeferral(src, oldClaim, generalClaim, scopedClaim);
    src = patchCommandLauncherIsolation(src, lineEnding);
    const missing = SLASH_PREFIX_REQUIRED_MARKERS.filter((marker) => !src.includes(marker));
    if (missing.length > 0) throw new Error(`[patch-deps] incomplete leading slash prefix patch: ${missing.join(', ')}`);
    fs.writeFileSync(slashTriggerTarget, src);
    console.log('[patch-deps] leading command/Skill prefix authoring patch already applied');
    return;
  }
  const legacy = src.includes(SLASH_PREFIX_LEGACY_MARKER);
  if (!legacy) {
    const oldBoundary = SLASH_PREFIX_OLD_LINES.join(lineEnding);
    const boundaryOccurrences = src.split(oldBoundary).length - 1;
    if (boundaryOccurrences !== 1) {
      throw new Error(`[patch-deps] expected one rc.6 slash boundary, received ${boundaryOccurrences}`);
    }
    src = src.replace(oldBoundary, SLASH_PREFIX_HELPER_LINES.join(lineEnding) + oldBoundary);
  }
  const oldTrack = (legacy ? SLASH_TRACK_LEGACY_LINES : SLASH_TRACK_OLD_LINES).join(lineEnding);
  const trackOccurrences = src.split(oldTrack).length - 1;
  if (trackOccurrences !== 1) {
    throw new Error(`[patch-deps] expected one rc.6 trigger track call, received ${trackOccurrences}`);
  }
  src = src.replace(oldTrack, SLASH_TRACK_NEW_LINES.join(lineEnding));
  const replacements = [
    [SLASH_CACHE_FIELD_OLD_LINES, SLASH_CACHE_FIELD_NEW_LINES, 'candidate cache field'],
    [SLASH_SOURCE_REMOVE_OLD_LINES, SLASH_SOURCE_REMOVE_NEW_LINES, 'source removal cache cleanup'],
    [SLASH_DISPOSE_OLD_LINES, SLASH_DISPOSE_NEW_LINES, 'controller cache cleanup'],
    [SLASH_FETCH_SETTLED_OLD_LINES, SLASH_FETCH_SETTLED_NEW_LINES, 'candidate cache update'],
    [SLASH_FETCH_POSITION_OLD_LINES, SLASH_FETCH_POSITION_NEW_LINES, 'leading-prefix candidate position']
  ];
  for (const [beforeLines, afterLines, label] of replacements) {
    const before = beforeLines.join(lineEnding);
    const occurrences = src.split(before).length - 1;
    if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 ${label}, received ${occurrences}`);
    src = src.replace(before, afterLines.join(lineEnding));
  }
  const methodOccurrences = src.split(SLASH_PREFIX_METHOD_ANCHOR).length - 1;
  if (methodOccurrences !== 1) {
    throw new Error(`[patch-deps] expected one rc.6 prefix method anchor, received ${methodOccurrences}`);
  }
  src = src.replace(SLASH_PREFIX_METHOD_ANCHOR, SLASH_PREFIX_METHOD_LINES.join(lineEnding) + SLASH_PREFIX_METHOD_ANCHOR);
  src = patchCommandClaimDeferral(src, oldClaim, generalClaim, scopedClaim);
  src = patchCommandLauncherIsolation(src, lineEnding);
  const missing = SLASH_PREFIX_REQUIRED_MARKERS.filter((marker) => !src.includes(marker));
  if (missing.length > 0) throw new Error(`[patch-deps] incomplete leading slash prefix patch: ${missing.join(', ')}`);
  fs.writeFileSync(slashTriggerTarget, src);
  console.log('[patch-deps] patched leading command/Skill prefix authoring');
}
function patchLeadingPrefixCandidatePosition(src, lineEnding) {
  const before = SLASH_FETCH_POSITION_OLD_LINES.join(lineEnding);
  const after = SLASH_FETCH_POSITION_NEW_LINES.join(lineEnding);
  if (src.includes(after)) return src;
  const occurrences = src.split(before).length - 1;
  if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 leading-prefix candidate position, received ${occurrences}`);
  return src.replace(before, after);
}
function patchCommandClaimDeferral(src, oldClaim, generalClaim, scopedClaim) {
  if (src.includes(SLASH_LAUNCHER_SIGNATURE_NEW) && src.includes(SLASH_LAUNCHER_CLAIM_NEW)) return src;
  if (!src.includes(SLASH_EXECUTE_CALL_NEW)) {
    const callOccurrences = src.split(SLASH_EXECUTE_CALL_OLD).length - 1;
    if (callOccurrences !== 2) throw new Error(`[patch-deps] expected two rc.6 outcome execute calls, received ${callOccurrences}`);
    src = src.split(SLASH_EXECUTE_CALL_OLD).join(SLASH_EXECUTE_CALL_NEW);
  }
  if (!src.includes(SLASH_EXECUTE_SIGNATURE_NEW)) {
    const signatureOccurrences = src.split(SLASH_EXECUTE_SIGNATURE_OLD).length - 1;
    if (signatureOccurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 outcome execute signature, received ${signatureOccurrences}`);
    src = src.replace(SLASH_EXECUTE_SIGNATURE_OLD, SLASH_EXECUTE_SIGNATURE_NEW);
  }
  if (!src.includes(scopedClaim)) {
    const before = src.includes(generalClaim) ? generalClaim : oldClaim;
    const claimOccurrences = src.split(before).length - 1;
    if (claimOccurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 command claim executor, received ${claimOccurrences}`);
    src = src.replace(before, scopedClaim);
  }
  return src;
}
function patchCommandLauncherIsolation(src, lineEnding) {
  const oldPick = SLASH_LAUNCHER_PICK_OLD_LINES.join(lineEnding);
  const newPick = SLASH_LAUNCHER_PICK_NEW_LINES.join(lineEnding);
  if (!src.includes(newPick)) {
    const occurrences = src.split(oldPick).length - 1;
    if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 launcher pick executor, received ${occurrences}`);
    src = src.replace(oldPick, newPick);
  }
  if (!src.includes(SLASH_LAUNCHER_SPACE_NEW)) {
    const occurrences = src.split(SLASH_LAUNCHER_SPACE_OLD).length - 1;
    if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 Space executor, received ${occurrences}`);
    src = src.replace(SLASH_LAUNCHER_SPACE_OLD, SLASH_LAUNCHER_SPACE_NEW);
  }
  if (!src.includes(SLASH_LAUNCHER_SIGNATURE_NEW)) {
    const occurrences = src.split(SLASH_LAUNCHER_SIGNATURE_OLD).length - 1;
    if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 launcher-aware execute signature, received ${occurrences}`);
    src = src.replace(SLASH_LAUNCHER_SIGNATURE_OLD, SLASH_LAUNCHER_SIGNATURE_NEW);
  }
  if (!src.includes(SLASH_LAUNCHER_CLAIM_NEW)) {
    const occurrences = src.split(SLASH_LAUNCHER_CLAIM_OLD).length - 1;
    if (occurrences !== 1) throw new Error(`[patch-deps] expected one rc.6 command claim condition, received ${occurrences}`);
    src = src.replace(SLASH_LAUNCHER_CLAIM_OLD, SLASH_LAUNCHER_CLAIM_NEW);
  }
  return src;
}
function main() {
  if (!fs.existsSync(target)) {
    console.log('[patch-deps] dsh-host-directory-picker-native 不存在，跳过');
    return;
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes(PATCH_MARKER)) {
    console.log('[patch-deps] picker worker 退出码补丁已应用，跳过');
    return;
  }
  if (!OLD_RE.test(src)) {
    console.log('[patch-deps] picker-native 未匹配到目标代码（版本可能已更新），跳过');
    return;
  }
  src = src.replace(OLD_RE, NEW_BLOCK);
  fs.writeFileSync(target, src);
  console.log('[patch-deps] 已补丁 picker-native：worker 退出上报 exit code / signal');
}

patchLeadingSlashPrefix();
main();
