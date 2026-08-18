'use strict';

// A-9: 长时内存观测——纯函数部分（环形 JSONL 追加），只观测不干预。
// 采样与定时器由 main.js 持有；这里提供行级环形写（尾部保留，超限截断）。

const MEMORY_WATCH_MAX_LINES = 2000;

/**
 * 把一行 JSON 追加到环形 JSONL 文件：读现有行（容错）→ 尾部保留
 * maxLines-1 → 追加新行。文件损坏/缺失时直接以新行为起点。
 * @param {string} file
 * @param {object} row
 * @param {{maxLines?: number}} [opts]
 * @param {object} [fsMod]
 * @returns {boolean} 是否写入成功
 */
function ringAppendJsonl(file, row, opts, fsMod) {
  const fs = fsMod || require('node:fs');
  const maxLines = (opts && opts.maxLines) || MEMORY_WATCH_MAX_LINES;
  let text;
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const lines = raw.split(/\r?\n/).filter((l) => l && l.trim().length > 0);
      // 逐行校验 JSON：任一损坏（半写/文件损坏）→ 丢弃全部旧内容，
      // 防止损坏行污染环形文件。
      for (const l of lines) {
        try { JSON.parse(l); } catch { lines.length = 0; break; }
      }
      text = lines.slice(-(maxLines - 1)).join('\n');
      if (text) text += '\n';
    } else {
      text = '';
    }
  } catch {
    text = ''; // 读取失败：丢弃旧内容，从新行开始
  }
  let line;
  try {
    line = JSON.stringify(row);
  } catch {
    return false; // 不可序列化（如循环引用）：静默丢弃
  }
  try {
    fs.writeFileSync(file, text + line + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MEMORY_WATCH_MAX_LINES,
  ringAppendJsonl,
};