'use strict';
// One-off diagnostic: decompress a dsh session log (concatenated zstd frames)
// and locate seq discontinuities, mirroring dsh's own reader.
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const { scanZstdFrames } = require('../session-watcher'); // 帧扫描器唯一实现（历史三份副本已收口）

const file = process.argv[2];
const buf = fs.readFileSync(file);
console.log(`file=${file} bytes=${buf.length}`);

const { frames, tornStart } = scanZstdFrames(buf);
console.log(`frames=${frames.length} tornStart=${tornStart === undefined ? 'none' : tornStart}`);

const rows = []; // {line, seq, type, time, raw}
let lineNo = 0;
for (const [fi, { start, end }] of frames.entries()) {
  let text;
  try {
    text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
  } catch (e) {
    console.log(`frame#${fi} decode FAILED: ${e.message}`);
    continue;
  }
  for (const line of text.split('\n')) {
    if (!line) continue;
    lineNo += 1;
    let row;
    try { row = JSON.parse(line); } catch { rows.push({ line: lineNo, seq: null, type: 'PARSE-ERR', time: null, raw: line.slice(0, 120) }); continue; }
    if (!row || typeof row !== 'object') { rows.push({ line: lineNo, seq: null, type: String(row), time: null, raw: line.slice(0, 120) }); continue; }
    rows.push({
      line: lineNo,
      seq: typeof row.seq === 'number' ? row.seq : null,
      type: row.type,
      time: row.time ?? row.data?.time ?? row.data?.timestamp ?? null,
      frame: fi,
    });
  }
}
console.log(`totalLines=${rows.length}`);

const seqOf = (r) => r.seq;
console.log('\n--- first 6 rows ---');
for (const r of rows.slice(0, 6)) console.log(JSON.stringify(r));
console.log('--- last 6 rows ---');
for (const r of rows.slice(-6)) console.log(JSON.stringify(r));
console.log('--- rows around line 13210 ---');
for (const r of rows.slice(13198, 13222)) console.log(JSON.stringify(r));

console.log('\n--- seq discontinuities ---');
let prev = null, prevLine = 0, count = 0;
for (const r of rows) {
  if (r.seq !== null) {
    if (prev !== null && r.seq !== prev + 1) {
      console.log(`line ${prevLine}->${r.line}: seq ${prev} -> ${r.seq}  type=${r.type} frame=${r.frame}`);
      if (++count >= 40) { console.log('... (capped)'); break; }
    }
    prev = r.seq; prevLine = r.line;
  }
}
if (count === 0) console.log('none');
console.log(`\nlastSeenSeq=${prev} at line ${prevLine}`);
