#!/usr/bin/env node
// stage-plugin-gate.mjs —— 内置线交付门禁：payload 的 assets/plugins 只带正件、不带超长路径。
//
// 谁调用：`dsh-tauri/scripts/stage-payload.sh`（assets 镜像之后、插件数门禁之前），
// CI 的五个架构 staging 同口径。判据本身是纯函数，住在
// `dsh-desktop/scripts/lib/payload-plugin-deps.js`（单测：unit-payload-plugin-deps.test.js），
// 这里只做走盘、删除与报错——与「网络与文件编排留在调用方」的约定一致。
//
// 用法：node dsh-tauri/scripts/stage-plugin-gate.mjs [payload 的 dsh-desktop 目录]
// 退出码：0 合规（可能已剪除残留）；1 违规（缺目录 / 仍有 .pnpm / 有超长路径）。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);

const { COMPANION_PLUGINS, companionDirName } = require(path.join(REPO, 'dsh-desktop', 'scripts', 'lib', 'companion-plugins.js'));
const { residueNodeModules, overlongFiles, longestInstallPath, INSTALL_PREFIX_DEFAULT, PATH_LIMIT_DEFAULT } =
  require(path.join(REPO, 'dsh-desktop', 'scripts', 'lib', 'payload-plugin-deps.js'));

const payloadRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, 'dsh-tauri', 'package-payload', 'dsh-desktop');
const pluginsRoot = path.join(payloadRoot, 'assets', 'plugins');

function die(msg, hint) {
  console.error('[gate] FATAL: ' + msg);
  if (hint) console.error('[gate]        ' + hint);
  process.exit(1);
}

if (!fs.existsSync(pluginsRoot) || !fs.statSync(pluginsRoot).isDirectory()) {
  die(`payload 里没有 assets/plugins —— 内置线要求整树随包: ${pluginsRoot}`,
    '检查 stage 的 assets 镜像行有没有被重新加上 //XD plugins、或镜像后又补了 rm');
}

const dirs = fs.readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

// ---- ① 残留依赖树剪除：与同步面共用 shipsNodeModules 这一份声明 ----
const withNm = dirs.filter((d) => fs.existsSync(path.join(pluginsRoot, d, 'node_modules')));
const doomed = residueNodeModules(COMPANION_PLUGINS, withNm, companionDirName);
for (const rel of doomed) {
  const abs = path.join(pluginsRoot, rel);
  const n = (() => {
    let c = 0;
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else c += 1;
      }
    })(abs);
    return c;
  })();
  fs.rmSync(abs, { recursive: true, force: true });
  console.log(`[gate] 剪除未声明随包的残留依赖树 ${rel}（${n} 个文件）—— 正件判据 = shipsNodeModules`);
}

// ---- ② .pnpm 存储必须已被清干净（stage 的 find 先跑；这里是反证位）----
const stillPnpm = [];
(function scan(dir, depth) {
  if (depth > 6) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name === '.pnpm') { stillPnpm.push(path.relative(payloadRoot, path.join(dir, e.name))); continue; }
    scan(path.join(dir, e.name), depth + 1);
  }
})(pluginsRoot, 0);
if (stillPnpm.length) {
  die(`payload 仍留有 .pnpm 存储（${stillPnpm.length} 处）`, 'robocopy 跟 junction 展开后 NSIS 会在 >260 字符处中断建包');
}

// ---- ③ 超长路径：按最坏安装前缀算，缺件即拒（绝不放行一个「装到一半崩」的包）----
const relFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else relFiles.push('assets/plugins/' + path.relative(pluginsRoot, full).split(path.sep).join('/'));
  }
})(pluginsRoot);

const over = overlongFiles(relFiles);
if (over.length) {
  console.error(`[gate] FATAL: ${over.length} 个插件文件在安装态会超过 ${PATH_LIMIT_DEFAULT} 字符`
    + `（前缀按 ${INSTALL_PREFIX_DEFAULT} 计）：`);
  for (const r of over.slice(0, 8)) console.error(`[gate]   ${r.len}  ${r.rel}`);
  console.error('[gate]        NSIS 的 File 指令会在 >260 字符处 failed opening file 中断建包——拒绝打包');
  process.exit(1);
}

const top = longestInstallPath(relFiles);
console.log(`[gate] OK: ${dirs.length} 个插件目录 / ${relFiles.length} 个文件进包，`
  + `最长安装路径 ${top.len} 字符（< ${PATH_LIMIT_DEFAULT}），剪除残留 node_modules ${doomed.length} 处`);
