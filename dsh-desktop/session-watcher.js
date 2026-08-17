'use strict';

// Watches dsh session logs (<DSH_HOME>/sessions/**/session.jsonl.zstd) and
// fires onTurnEnd when a TOP-LEVEL session's agent turn finishes.
//
// On-disk format (dsh-session-persistence-jsonl): the log is concatenated
// zstd frames; each frame holds JSONL records. The first record of the first
// frame is the session header; event rows may pack delta runs into
// 'text-chunks' / 'reasoning-chunks' / 'tool-call-chunks' storage rows.
// A 'turn/end' event marks the end of the agent's run.
//
// Decoding mirrors the persistence backend's public-API path exactly:
// structurally scan complete frame ranges, then zstdDecompressSync each
// frame (node:zlib — same codec dsh itself uses). No third-party deps.
//
// 资源模型（v2，根治随会话数线性增长的持续轮询）：
//   · 每个会话文件挂一个 fs.watch（Windows 下文件写入会触发事件）——
//     内容增长时立即增量解码，通知延迟由「每 3 秒轮询」级变为事件级；
//   · 兜底清扫每 10s 只做 stat（捕获 fs.watch 漏报/文件被整体替换），
//     目录全量遍历每 30s 一次（发现新会话/清理消失的会话与监视器）。
//   600 会话实测：原设计 3s 全量 stat + 5s 全量遍历 ≈ 每 3 秒 40-46ms +
//   每 5 秒 54-85ms（约 3% 单核持续）；v2 稳态 ≈ stat 4ms/s + 遍历
//   2.5ms/s（约 0.7% 单核），且随会话数增长斜率降为原来的 ~1/4。
//   fs.watch 漏报/文件替换的极端情形由 10s 兜底清扫收敛（通知最坏延迟
//   10s，正常路径为事件级、比原设计更快）。

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ZSTD_MAGIC = 4247762216; // 28 B5 2F FD little-endian

const STAT_SWEEP_MS = 10000; // 兜底 stat 清扫（捕获 fs.watch 漏报/文件替换）
const WALK_SWEEP_MS = 30000; // 目录对账（发现新会话、清理消失的监视器）

// Structural zstd frame scanner (ported from dsh-session-persistence-jsonl).
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      // Bytes before the next frame magic should not exist in a healthy log;
      // stop scanning and keep what we have.
      return { frames, tornStart: start };
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) return { frames, tornStart: start };
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag);
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) return { frames, tornStart: start };
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return { frames };
}

function decodeFrame(buf) {
  return zlib.zstdDecompressSync(buf).toString('utf8');
}

// Expand one JSONL row into its events (storage rows pack many chunk events).
function expandRow(line) {
  let row;
  try { row = JSON.parse(line); } catch { return []; }
  if (!row || typeof row !== 'object') return [];
  switch (row.type) {
    case 'text-chunks':
    case 'reasoning-chunks':
      return Array.isArray(row.data && row.data.texts) ? row.data.texts : [];
    case 'tool-call-chunks':
      return Array.isArray(row.data && row.data.args) ? row.data.args : [];
    default:
      return [row];
  }
}

class SessionWatcher {
  constructor({ sessionsDir, onTurnEnd, log, statSweepMs, walkSweepMs }) {
    this.sessionsDir = sessionsDir;
    this.onTurnEnd = onTurnEnd || (() => {});
    this.log = log || (() => {});
    this.files = new Map(); // absPath -> { consumed, lastSize, header, title, baseline }
    this.dirCache = { at: 0, files: [] };
    this.timer = null;
    this.walkTimer = null;
    this.watchers = new Map(); // absPath -> FSWatcher
    this.statSweepMs = statSweepMs === undefined ? STAT_SWEEP_MS : statSweepMs;
    this.walkSweepMs = walkSweepMs === undefined ? WALK_SWEEP_MS : walkSweepMs;
  }

  start() {
    // 重复调用防护：接口不幂等，二次 start 会再挂两个 interval 而不清旧句柄。
    if (this.timer || this.walkTimer) return;
    // 首扫延后一拍（先让窗口绘制），且分批处理，避免启动时主进程被大量
    // 会话日志的全量解码卡死。
    setImmediate(() => this.scan(4));
    // 兜底 stat 清扫：捕获 fs.watch 漏报与「整文件替换（rename）」等事件
    // 盲区；正常增长路径由每文件的 fs.watch 事件即时处理。
    this.timer = setInterval(() => this.scan(), this.statSweepMs);
    if (this.timer.unref) this.timer.unref();
    // 目录对账：发现新会话、摘除已消失会话与其监视器。
    this.walkTimer = setInterval(() => this.refreshWatchList(), this.walkSweepMs);
    if (this.walkTimer.unref) this.walkTimer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.walkTimer) clearInterval(this.walkTimer);
    this.walkTimer = null;
    for (const w of this.watchers.values()) {
      try { w.close(); } catch {}
    }
    this.watchers.clear();
  }

  // 目录清单缓存 25s：普通 stat 清扫（10s 一次）直接复用清单，全量遍历
  // 只发生在 30s 对账（force）与首扫，避免频繁递归整个 sessions 树。
  listLogs(force = false) {
    try {
      const now = Date.now();
      if (!force && now - this.dirCache.at < 25000) return this.dirCache.files;
      if (!fs.existsSync(this.sessionsDir)) return [];
      const out = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name === 'session.jsonl.zstd') out.push(p);
        }
      };
      walk(this.sessionsDir);
      this.dirCache = { at: now, files: out };
      return out;
    } catch (err) {
      this.log('watch', 'listLogs 失败: ' + err.message);
      return this.dirCache.files || [];
    }
  }

  /** 给一个会话文件挂监视器；已挂或失败则跳过（兜底清扫兜住）。 */
  attachWatch(file) {
    if (this.watchers.has(file)) return;
    try {
      const w = fs.watch(file, (eventType) => this.onFileEvent(file, eventType));
      w.on('error', () => {
        try { w.close(); } catch {}
        if (this.watchers.get(file) === w) this.watchers.delete(file);
      });
      this.watchers.set(file, w);
    } catch { /* 文件可能刚消失；下次对账重试 */ }
  }

  /**
   * fs.watch 事件：立即增量处理该文件（process 为同步函数，无并发问题）。
   * rename（删除/整文件替换）时强制重新基线：size 不变的同尺寸替换在
   * 「大小比对」下不可见，但 rename 事件是替换的强信号，重基线只做一次
   * 帧边界扫描 + 头部解码，代价可忽略。
   */
  onFileEvent(file, eventType) {
    try {
      if (eventType === 'rename') {
        const rec = this.files.get(file);
        if (rec) {
          rec.consumed = 0; rec.header = null; rec.title = null; rec.baseline = false; rec.hasTurnEvents = false;
          rec.lastSize = -1; // 强制重基线一次：同尺寸整文件替换在「大小比对」下不可见，rename 是替换的强信号
        }
      }
      this.process(file);
    } catch (err) { this.log('watch', '处理失败 ' + file + ': ' + err.message); }
  }

  /** 目录对账：刷新文件清单、为新文件挂监视器、清理已消失文件的监视器。 */
  refreshWatchList() {
    const files = this.listLogs(true);
    const alive = new Set(files);
    for (const file of files) this.attachWatch(file);
    for (const [file, w] of this.watchers) {
      if (alive.has(file)) continue;
      try { w.close(); } catch {}
      this.watchers.delete(file);
    }
  }

  scan(maxChanged = Infinity) {
    let any = false;
    let changed = 0;
    for (const file of this.listLogs()) {
      try {
        const grew = this.process(file);
        if (grew) {
          any = true;
          changed += 1;
          if (changed >= maxChanged) break;
        }
      } catch (err) { this.log('watch', '处理失败 ' + file + ': ' + err.message); }
    }
    return any;
  }

  /** 读取文件自 offset 起的尾部字节（增量读取，避免每次全量读盘）。 */
  readTail(file, offset, size) {
    const len = size - offset;
    const tail = Buffer.allocUnsafe(len);
    const fd = fs.openSync(file, 'r');
    try {
      let pos = 0;
      while (pos < len) {
        const n = fs.readSync(fd, tail, pos, len - pos, offset + pos);
        if (n <= 0) break;
        pos += n;
      }
      return tail.subarray(0, pos);
    } finally {
      fs.closeSync(fd);
    }
  }

  process(file) {
    let st;
    try { st = fs.statSync(file); } catch { this.files.delete(file); return false; }
    let rec = this.files.get(file);
    if (!rec) {
      rec = { consumed: 0, lastSize: 0, header: null, title: null, baseline: false, hasTurnEvents: false };
      this.files.set(file, rec);
    }
    if (st.size <= rec.consumed && rec.baseline) return false; // 无新字节

    // 文件被截断/重写（如 repair 脚本）→ 重新基线。
    if (st.size < rec.consumed) {
      rec.consumed = 0; rec.header = null; rec.title = null; rec.baseline = false; rec.hasTurnEvents = false;
      rec.lastSize = 0;
    }

    const first = !rec.baseline;
    const readFrom = rec.consumed;
    let tail;
    try { tail = this.readTail(file, readFrom, st.size); } catch { return false; }

    // 尾部不是帧边界（被重写/拼接异常）→ 归零重新基线；但长度与上次判定
    // 一致且仍不是帧边界时（坏内容没有进展），按已消费处理，避免对不变的
    // 坏文件每 10s 兜底清扫都全量重读重基线（fs.watch 的 rename 事件会在
    // 整文件替换时强制重基线，正常修复路径不受影响）。
    if (!first && tail.length >= 4 && tail.readUInt32LE(0) !== ZSTD_MAGIC) {
      if (rec.lastSize === st.size) {
        rec.consumed = st.size;
        rec.lastSize = st.size;
        return false;
      }
      rec.consumed = 0; rec.header = null; rec.title = null; rec.baseline = false; rec.hasTurnEvents = false;
      rec.lastSize = st.size;
      return this.process(file);
    }

    const { frames } = scanZstdFrames(tail);

    // 首次见到该会话（基线）：只解析头部与最后一帧边界，不逐帧解码历史——
    // 历史事件本就不触发通知，跳过全量解压可避免启动卡顿。
    if (first) {
      if (frames.length > 0) {
        try {
          const text = decodeFrame(tail.subarray(frames[0].start, frames[0].end));
          const h = JSON.parse(text.split('\n')[0]);
          if (h && h.type === 'session') rec.header = h;
        } catch { /* 头部损坏则下次重试 */ }
        rec.consumed = readFrom + frames[frames.length - 1].end;
      }
      // 没有完整帧则不推进（tornStart 提示未写满）。
      rec.baseline = true;
      rec.lastSize = st.size;
      return true; // 计为"做了重活"（供分批限流）
    }

    // 增量：只解码 consumed 之后的新完整帧。
    let turnEnds = 0;
    let assistantMessages = 0;
    let consumed = readFrom;
    for (const f of frames) {
      let text;
      try { text = decodeFrame(tail.subarray(f.start, f.end)); } catch { break; }
      for (const line of text.split('\n')) {
        if (!line) continue;
        for (const ev of expandRow(line)) {
          if (!ev || typeof ev !== 'object') continue;
          if (ev.type === 'session/title' && ev.data && typeof ev.data.title === 'string') rec.title = ev.data.title;
          if (ev.type === 'turn/start' || ev.type === 'turn/end') rec.hasTurnEvents = true;
          if (ev.type === 'turn/end') turnEnds += 1;
          if (ev.type === 'assistant/message') assistantMessages += 1;
        }
      }
      consumed = readFrom + f.end;
    }
    rec.consumed = consumed;
    rec.lastSize = st.size;

    // 通知语义：会话出现 turn 事件后按 turn/end 计数，否则按 assistant/message 兜底。
    const count = rec.hasTurnEvents ? turnEnds : assistantMessages;
    if (count > 0) this.emit(rec, count);
    return count > 0 || consumed > readFrom;
  }

  emit(rec, count) {
    const h = rec.header || {};
    if (h.delegationDepth > 0) return; // subagent logs are noise for toasts
    let title = 'DSH 任务完成';
    let body;
    if (rec.title) {
      title = rec.title;
    }
    const cwdBase = h.cwd ? path.basename(h.cwd) : null;
    const shortId = h.id ? h.id.slice(-8) : null;
    body = [cwdBase, shortId ? '会话 ' + shortId : null].filter(Boolean).join(' · ');
    body += (count > 1 ? '（' + count + ' 轮任务完成）' : '');
    try { this.onTurnEnd({ title, body, sessionId: h.id, cwd: h.cwd }); }
    catch (err) { this.log('watch', 'onTurnEnd 回调异常: ' + err.message); }
  }
}

module.exports = { SessionWatcher, scanZstdFrames, expandRow };
