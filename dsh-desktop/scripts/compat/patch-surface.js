'use strict';

// patch-surface.js — 兼容层 M2 配套：补丁干预面快照与漂移校验。
//
// 机制（采纳 dsh-TUI 团队 patch-surface.snapshot.json 同款，v0.6.0 兼容层
// README 组件③）：把壳对官方内核的全部补丁干预（dsh-desktop 标记系列）
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
// 补丁标记家族：patch-*.js / patch-adapters.js 里统一以括号名（patch）、
// 冒号名（fix: / compat:）三种声明形态携带「dsh-desktop 」前缀注入。
// 捕获组统一排除 `*` 引号（双引/单引/反引号）`;` `{` `}` `<` `>` 反斜杠
// （字符串拼接里的 `\n` 转义尾巴）与换行，避免从单引号字符串注释里采出
// 带尾巴的垃圾标记名；patch (...) 形式以右括号定界，仍用 [^)]+。
const MARKER_RE = /dsh-desktop (?:patch \(([^)]+)\)|fix:? ([^*"'`;{}<>\n\\]+)|compat:? ([^*"'`;{}<>\n\\]+))/g;

function sha(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** 扫描 repo 的补丁源码，收集全部干预标记名。
 *  递归遍历 <repo>/dsh-desktop/scripts 整棵子树（覆盖 scripts/lib、scripts/compat、
 *  scripts/integration 等子目录里声明的标记），跳过 node_modules/test/dist；
 *  外加 <repo>/dsh-desktop 顶层非递归 .js 扫描（balance.js 等）。 */
function collectMarkers(repoRoot) {
  const markers = new Set();
  const seen = new Set();

  function scanFile(full) {
    if (seen.has(full)) return;
    seen.add(full);
    let src = '';
    try { src = fs.readFileSync(full, 'utf8'); } catch { return; }
    for (const m of src.matchAll(MARKER_RE)) {
      // 「 — 解释文本」同行散文截断（fix:/compat: 注释常名字与说明同句），
      // 截断后与其它短名去重合并。
      const name = ((m[1] || m[2] || m[3] || '').trim()).split(' — ')[0].trim();
      if (name) markers.add(name);
    }
  }

  // ① <repo>/dsh-desktop/scripts 子树递归（跳过 node_modules/test/dist）。
  const SKIP_DIRS = new Set(['node_modules', 'test', 'dist']);
  (function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile() && /\.js$/.test(e.name)) {
        scanFile(full);
      }
    }
  })(path.join(repoRoot, 'dsh-desktop', 'scripts'));

  // ② <repo>/dsh-desktop 顶层非递归 .js 扫描（balance.js 等）。
  let topEntries = [];
  try { topEntries = fs.readdirSync(path.join(repoRoot, 'dsh-desktop'), { withFileTypes: true }); } catch { /* 容错：顶层不可读则跳过 */ }
  for (const e of topEntries) {
    if (e.isFile() && /\.js$/.test(e.name)) scanFile(path.join(repoRoot, 'dsh-desktop', e.name));
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
  // 标记集必须现采（并上快照里已登记的），不能只拿快照的：否则新加的补丁家族
  // 落在快照外的文件上时，buildSurface 根本看不到它，verify 静默绿（守卫盲区）；
  // 落在已有文件上时又会只报「内容漂移（标记仍在位）」，把新增干预说成内容漂。
  const markers = [...new Set([
    ...snap.surface.flatMap((s) => s.markers),
    ...collectMarkers(repoRoot),
  ])].sort();
  const now = buildSurface(kernelRoot, markers);
  const nowMap = new Map(now.surface.map((s) => [s.file, s]));
  const oldMap = new Map(snap.surface.map((s) => [s.file, s]));
  let drift = 0;
  for (const [file, old] of oldMap) {
    const cur = nowMap.get(file);
    if (!cur) { console.error(`::error::补丁干预消失：${file}（原标记 ${old.markers.join(',')}）——内核换版后补丁失配？`); drift++; }
    else if (cur.sha256 !== old.sha256) {
      const added = cur.markers.filter((m) => !old.markers.includes(m));
      const lost = old.markers.filter((m) => !cur.markers.includes(m));
      if (added.length || lost.length) {
        console.error(`::error::标记集变更：${file} 新增 [${added.join(',')}] 消失 [${lost.join(',')}]`);
      } else {
        console.error(`::error::文件内容漂移：${file}（标记仍在位）`);
      }
      drift++;
    }
  }
  for (const [file] of nowMap) {
    if (!oldMap.has(file)) { console.error(`::error::新出现的补丁干预：${file}（快照外）`); drift++; }
  }
  if (drift === 0) { console.log(`✓ patch-surface 无漂移（${now.surface.length} 文件与快照一致）`); return; }
  console.error(`✗ patch-surface 漂移 ${drift} 处——内核换版后按 alpha2-migration-assessment.md 重靶并重跑 snapshot`);
  process.exit(1);
}

module.exports = { collectMarkers, buildSurface, MARKER_RE };

if (require.main === module) {
  const [, , cmd, kernelRoot, repoRoot] = process.argv;
  if (!cmd || !kernelRoot) {
    console.error('用法: node patch-surface.js <snapshot|verify> <kernel-root> [repo-root]');
    process.exit(1);
  }
  const rr = repoRoot ? path.resolve(repoRoot) : path.resolve(__dirname, '..', '..');
  if (cmd === 'snapshot') cmdSnapshot(path.resolve(kernelRoot), rr);
  else if (cmd === 'verify') cmdVerify(path.resolve(kernelRoot), rr);
  else { console.error('未知命令: ' + cmd); process.exit(1); }
}
