'use strict';

// ---------------------------------------------------------------------------
// 预设槽文件枚举（单一实现，安装与自愈共用）。
//
// 为什么收口：预设目录的内核口径（@deepseek-ai/dsh-agent-presets）允许一个预设
// 携带任意深的子目录——内核自带的出厂预设 cordis 就有 presets/cordis/skills/
// <name>/SKILL.md，composition 里用 `new URL('skills/', baseUrl)` 引用该目录，
// 由 skill-filesystem 在运行时读取。所以「只拷顶层文件」的实现迟早会静默丢资源
// （内核 health check 只看 name: 行，目录类引用不会被标成 broken，用户看到的是
// 预设能选但技能列表空掉）。历史上安装器与自愈各写一份枚举，正是这类偏差的温床
// ——这里只留一份，递归 + 相对路径。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

/**
 * 共享模块目录名：不是预设槽（前导下划线不匹配内核 PRESET_ID，发现层会跳过），
 * 但承载 `../_preset/*.mjs` 相对引用，必须与预设槽一起安装/补写。
 */
const SHARED_PRESET_DIR = '_preset';

/** 预设槽清单（目录名，升序；根不存在或不可读时返回 []）。 */
function listPresetSlots(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * 一个预设槽内的全部文件，递归到底。
 *
 * 返回**相对槽根**的路径（正斜杠分隔，升序），调用方用 {@link slotFileAt} 拼回
 * 绝对路径。排除面：node_modules（槽内不该出现，出现即是被污染的依赖树）与符号
 * 链接（Dirent.isFile() 对软链为 false，与内核按普通文件读取的口径一致）。
 * @param {string} dir 槽目录绝对路径
 * @returns {string[]} 升序相对路径；目录不可读时返回 []
 */
function listPresetSlotFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // 读不动的子目录：按「无文件」处理，由调用方计数容忍
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const relChild = rel ? rel + '/' + entry.name : entry.name;
      const absChild = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(absChild, relChild);
      else if (entry.isFile()) out.push(relChild);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** 把 {@link listPresetSlotFiles} 的相对路径拼到某个槽根下（跨平台分隔符）。 */
function slotFileAt(baseDir, relPath) {
  return path.join(baseDir, ...String(relPath).split('/'));
}

module.exports = {
  SHARED_PRESET_DIR,
  listPresetSlots,
  listPresetSlotFiles,
  slotFileAt,
};
