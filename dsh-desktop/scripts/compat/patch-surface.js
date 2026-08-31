'use strict';

// patch-surface.js — 兼容层 M2 配套：补丁干预面快照与漂移校验。
//
// 机制（采纳 dsh-TUI 团队 patch-surface.snapshot.json 同款，v0.6.0 兼容层
// README 组件③）：把壳对官方内核的全部补丁干预（dsh-desktop patch 系列标记）
// 与被干预文件的指纹快照成 JSON；verify 模式重推导并比对——内核换版导致
// 补丁失配（标记消失）或出现意外干预时，CI/本地先爆（而非内核升级静默漂移）。
//
// 用法：
//   node scripts/compat/patch-surface.js snapshot <kernel-root> [repo-root]
//   node scripts/compat/patch-surface.js verify   <kernel-root> [repo-root]
//   snapshot → 写 scripts/compat/patch-surface.snapshot.json
//   verify   → 与快照比对，漂移即退出非零（输出差异清单）

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SNAP_REL = path.join('dsh-desktop', 'scripts', 'compat', 'patch-surface.snapshot.json');
// 补丁标记家族：patch-*.js / patch-adapters.js 里统一以「dsh-desktop patch (名字)」
// 形态声明（含历史形态「dsh-desktop fix:」「dsh-desktop compat:」）。
const MARKER_RE = /dsh-desktop (?:patch \(([^)]+)\)|fix:? ([^*"\n]+)|compat:? ([^*\n"']+))/g;

function sha(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** 扫描 repo 的补丁源码，收集全部干预标记名。 */
function collectMarkers(repoRoot) {
  const markers = new Set();
  const dirs = [
    path.join(repoRoot, 'dsh-desktop', 'scripts'),
    path.join(repoRoot, 'dsh-desktop'),
  ];
  const seen = new Set();
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !/\.js$/.test(e.name) || seen.has(e.name)) continue;
      seen.add(e.name);
      let src = '';
      try { src = fs.readFileSync(path.join(dir, e.name), 'utf8'); } catch { continue; }
      for (const m of src.matchAll(MARKER_RE)) {
        const name = (m[1] || m[2] || m[3] || '').trim();
        if (name) markers.add(name);
      }
    }
  }
  return [...markers].sort();
}

/** 扫描内核根：每个标记命中的文件 + 文件指纹。纯读取，不改内核。 */
function buildSurface(kernelRoot, markers) {
  const files = [];
  (function walk(d) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.js$/.test(e.name)) files.push(full);
    }
  })(kernelRoot);
  files.sort();
  const surface = [];
  for (const f of files) {
    let src = '';
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const hit = markers.filter((m) => src.includes(m));
    if (hit.length === 0) continue;
    surface.push({
      file: path.relative(kernelRoot, f).split(path.sep).join('/'),
      sha256: sha(src),
      markers: hit,
    });
  }
  return { generatedAt: new Date().toISOString(), kernelRoot: path.basename(kernelRoot), markerCount: markers.length, surface };
}

function cmdSnapshot(kernelRoot, repoRoot) {
  const markers = collectMarkers(repoRoot);
  const data = buildSurface(kernelRoot, markers);
  const target = path.join(repoRoot, SNAP_REL);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✓ 快照已写 ${SNAP_REL}：${data.surface.length} 个被干预文件 / ${markers.length} 个标记家族`);
}

function cmdVerify(kernelRoot, repoRoot) {
  const snapPath = path.join(repoRoot, SNAP_REL);
  if (!fs.existsSync(snapPath)) { console.error('✗ 快照不存在：' + SNAP_REL + '（先跑 snapshot）'); process.exit(1); }
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const markers = snap.surface.flatMap((s) => s.markers);
  const uniq = [...new Set(markers)].sort();
  const now = buildSurface(kernelRoot, uniq);
  const nowMap = new Map(now.surface.map((s) => [s.file, s]));
  const oldMap = new Map(snap.surface.map((s) => [s.file, s]));
  let drift = 0;
  for (const [file, old] of oldMap) {
    const cur = nowMap.get(file);
    if (!cur) { console.error(`::error::补丁干预消失：${file}（原标记 ${old.markers.join(',')}）——内核换版后补丁失配？`); drift++; }
    else if (cur.sha256 !== old.sha256) { console.error(`::error::文件内容漂移：${file}（标记仍在位）`); drift++; }
  }
  for (const [file] of nowMap) {
    if (!oldMap.has(file)) { console.error(`::error::新出现的补丁干预：${file}（快照外）`); drift++; }
  }
  if (drift === 0) { console.log(`✓ patch-surface 无漂移（${now.surface.length} 文件与快照一致）`); return; }
  console.error(`✗ patch-surface 漂移 ${drift} 处——内核换版后按 alpha2-migration-assessment.md 重靶并重跑 snapshot`);
  process.exit(1);
}

const [, , cmd, kernelRoot, repoRoot] = process.argv;
if (!cmd || !kernelRoot) {
  console.error('用法: node patch-surface.js <snapshot|verify> <kernel-root> [repo-root]');
  process.exit(1);
}
const rr = repoRoot ? path.resolve(repoRoot) : path.resolve(__dirname, '..', '..');
if (cmd === 'snapshot') cmdSnapshot(path.resolve(kernelRoot), rr);
else if (cmd === 'verify') cmdVerify(path.resolve(kernelRoot), rr);
else { console.error('未知命令: ' + cmd); process.exit(1); }
