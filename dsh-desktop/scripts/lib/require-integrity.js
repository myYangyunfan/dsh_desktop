'use strict';

// A-13: 打包产物 require 完整性校验（纯函数，无 electron-builder 依赖）。
//
// 历史事故：main.js 新增 require('./scripts/patch-open-project-dir') 但安装版
// scripts/ 缺该文件 → Electron 加载期崩溃（"Cannot find module"），且热更新
// 同步漏文件时同样中招。本模块在校验目标目录（打包产物或安装版 app 目录）
// 中解析应用自有脚本的全部相对 require：缺失即报出，调用方决定 throw
// （after-pack 钩子 → 拒绝产出废包）还是仅日志（冒烟脚本）。
//
// 只查应用自有脚本的相对 require（./ ../ 开头）；node_modules 解析归打包器。

const fs = require('node:fs');
const path = require('node:path');

/** 收集一段源码中的相对 require（./x、../y，含 ' 与 " 两种引号形态）。 */
function collectRelativeRequires(srcText) {
  const out = [];
  const re = /\brequire\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(srcText)) !== null) out.push(m[2]);
  return out;
}

/** 相对 require 的目标是否可解析（裸路径 / +.js / 目录 index.js / 目录 package.json）。 */
function requireTargetExists(dir, req) {
  const target = path.resolve(dir, req);
  if (fs.existsSync(target)) return true;
  if (fs.existsSync(target + '.js')) return true;
  if (fs.existsSync(path.join(target, 'index.js'))) return true;
  if (fs.existsSync(path.join(target, 'package.json'))) return true;
  return false;
}

/**
 * 校验 appDir 下 main.js/preload.js + scripts/ + scripts/lib/ 的全部相对 require。
 * @param {string} appDir 应用根（resources/app 或仓库 dsh-desktop）
 * @returns {{checked: string[], missing: string[]}}
 */
function integrityCheck(appDir) {
  const missing = [];
  const checked = [];
  const seen = new Set();
  const rel = (p) => (p.startsWith(appDir) ? p.slice(appDir.length) : p);
  const check = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    checked.push(rel(file));
    for (const req of collectRelativeRequires(text)) {
      if (!requireTargetExists(path.dirname(file), req)) {
        missing.push(rel(file) + ' → ' + req);
      }
    }
  };
  for (const r of [path.join(appDir, 'main.js'), path.join(appDir, 'preload.js')]) {
    if (fs.existsSync(r)) check(r);
  }
  for (const sub of ['scripts', 'scripts/lib']) {
    const dir = path.join(appDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) {
      if (n.endsWith('.js')) check(path.join(dir, n));
    }
  }
  return { checked, missing };
}

module.exports = { collectRelativeRequires, requireTargetExists, integrityCheck };