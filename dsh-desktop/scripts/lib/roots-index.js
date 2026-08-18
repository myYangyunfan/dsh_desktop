'use strict';
// P0-1 会话根索引：fileRoots() 的磁盘索引与头部读取支持。
// 纯函数模块（fs 可注入）：
//  - readSessionCwd：只读文件头部（64KB→256KB→1MB 渐进），scanZstdFrames
//    对截断 buffer 安全（返回 tornStart）；首帧完整才解压取 header.cwd，
//    全部截断则兜底全量读（与旧 fileRoots 行为一致）。
//  - 索引 round-trip：<userData>/roots-index.json，path → {mtimeMs,size,cwd}。
// 调用方（main.js fileRoots）以 stat 比对决定是否增量重解析，TTL 失效后
// 只读「索引外或已变化」的文件，避免 600 会话全量读盘+解压（数百 MB 同步读）。
const path = require('node:path');

const ROOTS_INDEX_VERSION = 1;
const ROOTS_HEAD_TRIES = [64 * 1024, 256 * 1024, 1024 * 1024];

let saveSeq = 0;

// 解压单帧并在首行 JSON 中取 header.cwd；任何一步失败返回 null（不抛出）。
function inflateSessionCwd(frameBuf, inflate) {
  try {
    const text = inflate(frameBuf).toString('utf8');
    const header = JSON.parse(text.split('\n', 1)[0]);
    if (header && typeof header.cwd === 'string' && header.cwd) return header.cwd;
  } catch {}
  return null;
}

// 渐进头部读取 + 首帧解压取 cwd。opts 所需：{ fs, scan, inflate, headTries? }。
// scan(buffer) → {frames:[{start,end}], tornStart?}（session-watcher.scanZstdFrames
// 兼容形态）；inflate(frameBuf) → Buffer（zlib.zstdDecompressSync）。
// 损坏/空文件/解析失败 → null。
function readSessionCwd(filePath, opts) {
  const { fs, scan, inflate, headTries = ROOTS_HEAD_TRIES } = opts;
  let st;
  try { st = fs.statSync(filePath); } catch { return null; }
  if (!st.isFile() || st.size === 0) return null;
  const size = st.size;
  const tryHead = (n) => {
    const nRead = Math.min(n, size);
    let fd;
    try { fd = fs.openSync(filePath, 'r'); } catch { return null; }
    try {
      const buf = Buffer.alloc(nRead);
      const got = fs.readSync(fd, buf, 0, nRead, 0);
      if (got <= 0) return null;
      return buf.subarray(0, got);
    } catch { return null; } finally {
      try { fs.closeSync(fd); } catch {}
    }
  };
  for (const n of headTries) {
    // 头部档位已覆盖整个文件：再试头部与全量读取等价，直接走末尾全量分支。
    if (n >= size) break;
    const buf = tryHead(n);
    if (!buf) return null;
    let frames;
    try { frames = scan(buf); } catch { return null; }
    if (frames && Array.isArray(frames.frames) && frames.frames.length > 0 && frames.frames[0].end <= buf.length) {
      const cwd = inflateSessionCwd(buf.subarray(frames.frames[0].start, frames.frames[0].end), inflate);
      if (cwd) return cwd;
    }
  }
  // 兜底：全量读取（小文件/首帧异常放大）。
  let buf;
  try { buf = fs.readFileSync(filePath); } catch { return null; }
  let frames;
  try { frames = scan(buf); } catch { return null; }
  if (!frames || !Array.isArray(frames.frames) || frames.frames.length === 0) return null;
  return inflateSessionCwd(buf.subarray(frames.frames[0].start, frames.frames[0].end), inflate);
}

// 索引 JSON → 规范化对象；版本不符/结构损坏 → null。
function decodeRootsIndex(text) {
  try {
    const o = JSON.parse(text);
    if (!o || o.v !== ROOTS_INDEX_VERSION || !o.entries || typeof o.entries !== 'object' || Array.isArray(o.entries)) return null;
    return { v: ROOTS_INDEX_VERSION, updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0, entries: o.entries };
  } catch { return null; }
}

// 读取磁盘索引；文件缺失/损坏 → 空索引（不抛异常）。
function loadRootsIndex(file, fs, pathMod) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const idx = decodeRootsIndex(text);
    if (idx) return idx;
  } catch {}
  return { v: ROOTS_INDEX_VERSION, updatedAt: 0, entries: {} };
}

// 原子写索引（tmp + rename）；失败清理 tmp 并返回 false（不抛异常）。
function saveRootsIndex(file, index, fs, pathMod) {
  index.updatedAt = Date.now();
  const tmp = file + '.tmp-' + process.pid + '-' + (++saveSeq);
  try {
    fs.writeFileSync(tmp, JSON.stringify(index), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    return false;
  }
}

module.exports = {
  ROOTS_INDEX_VERSION,
  ROOTS_HEAD_TRIES,
  readSessionCwd,
  inflateSessionCwd,
  decodeRootsIndex,
  loadRootsIndex,
  saveRootsIndex,
};