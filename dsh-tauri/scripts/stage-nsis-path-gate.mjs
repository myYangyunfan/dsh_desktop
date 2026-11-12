#!/usr/bin/env node
// stage-nsis-path-gate.mjs —— 构建期门禁：payload 里每个文件在 **makensis 源路径口径**下都得够短。
//
// 与 stage-plugin-gate.mjs 的分工（两道墙不同源，缺一不可）：
//   • stage-plugin-gate.mjs 在第一道（assets 镜像之后、node_modules 尚未进 payload 时）跑，
//     管插件面的残留依赖树 + 安装态超长；
//   • 本脚本必须在 **node_modules 镜像之后**跑（stage-payload.sh 末尾 + CI 五个架构 staging 末尾），
//     管的是打包器能不能把这棵树读进安装包——2026-10-17 v1.0.4 的 Windows x64/ARM64 就炸在这里，
//     而本机 `tauri build` 同树全绿（CI 前缀 94 字符 / 本机 55，差 39 字符：本机永远量不到）。
//     详见 dsh-desktop/scripts/lib/payload-plugin-deps.js 的 NSIS_SOURCE_* 注释。
//
// 判据本身是纯函数，住在 payload-plugin-deps.js（单测：unit-payload-plugin-deps.test.js）；
// 这里只做走盘、按命名清单剪除、以及报错。
//
// 用法：node dsh-tauri/scripts/stage-nsis-path-gate.mjs [payload 的 dsh-desktop 目录]
// 退出码：0 合规（可能已剪除清单内文件）；1 违规（前缀对不上 / 清单外越线 / 安装态超长）。

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);

const {
  NSIS_SOURCE_PREFIX_DEFAULT,
  NSIS_SOURCE_LIMIT,
  NSIS_SOURCE_PRUNE_TREES,
  NSIS_SOURCE_PRUNE_DIR,
  INSTALL_PREFIX_DEFAULT,
  PATH_LIMIT_DEFAULT,
  nsisSourcePrefixFrom,
  nsisGateApplies,
  overlongSourceFiles,
  overlongFiles,
  longestInstallPath,
  sourcePathLength,
} = require(path.join(REPO, 'dsh-desktop', 'scripts', 'lib', 'payload-plugin-deps.js'));

/** tauri 配置目录（读盘用；前缀对账走 nsisSourcePrefixFrom，不随宿主分隔符分叉）。 */
const CONFIG_DIR_SEGS = ['dsh-tauri', 'src-tauri', 'src', 'app'];

const payloadRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, 'dsh-tauri', 'pp');

function die(msg, ...hints) {
  console.error('[nsis-gate] FATAL: ' + msg);
  for (const h of hints) console.error('[nsis-gate]        ' + h);
  process.exit(1);
}

// ---- ① 前缀对账：常量说的必须就是 tauri.conf.json 现在拼出来的那条 ----
// makensis 拿到的是 bundle.resources 的 from 串**未归一化**的字面量（`..\..\..\` 一个字符不省），
// 所以前缀 = CI workspace + 配置目录 + from 串。三处任一处改了名/挪了位，这道必须当场叫。
const confPath = path.join(REPO, ...CONFIG_DIR_SEGS, 'tauri.conf.json');
let conf;
try {
  conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
} catch (e) {
  die(`读不到 tauri.conf.json：${confPath}（${e.message}）`, '本门禁的判据起点是这份配置，缺它等于没判');
}
const resources = (conf && conf.bundle && conf.bundle.resources) || {};
const fromKey = Object.keys(resources).find((k) => resources[k] === 'dsh-desktop/');
if (!fromKey) {
  die('tauri.conf.json 的 bundle.resources 里没有映射到 "dsh-desktop/" 的 from 串',
    '安装布局的载荷根改名了？同步本门禁与 NSIS_SOURCE_PREFIX_DEFAULT 之前不要发包');
}
const expectedPrefix = nsisSourcePrefixFrom(fromKey);
if (expectedPrefix !== NSIS_SOURCE_PREFIX_DEFAULT) {
  die(`CI 源路径前缀与常量对不上（实拼 ${expectedPrefix.length} 字符，常量 ${NSIS_SOURCE_PREFIX_DEFAULT.length} 字符）`,
    `实拼：${expectedPrefix}`,
    `常量：${NSIS_SOURCE_PREFIX_DEFAULT}`,
    '要么 staging 目录/位置或 resources from 变了——按新前缀更新 payload-plugin-deps.js 的常量，',
    '要么继续走结构性修法（把 staging 再挪近配置目录并缩短目录名，一次腾出 20+ 字符余量）。');
}

// ---- ② 命名清单剪除（越线才剪，清单外越线一律 FATAL）----
if (!fs.existsSync(payloadRoot) || !fs.statSync(payloadRoot).isDirectory()) {
  die(`payload 目录不存在：${payloadRoot}`, 'staging 没跑？本门禁必须在 node_modules 镜像之后调用');
}
// 非 Windows 宿主不做剪除与长度判定：这台机器的 payload 永远不会进 makensis，
// 按 Windows 前缀量本地平台专属依赖（如 mac 的 LibreOffice.app）只会误报。
if (!nsisGateApplies(process.platform)) {
  console.log(`[nsis-gate] 非 Windows 宿主（${process.platform}）：makensis 源路径墙不适用，`
    + '已完成前缀配置对账，跳过剪除与长度检查');
  process.exit(0);
}
let pruned = 0;

// ---- ② 目录级 / 整树剪除（剪除面由 payload-plugin-deps.js 集中声明）----

// ---- ②b 目录级剪除（2026-11-12，0.2.2-rc.2 实测）----
// 同一个 descriptions 目录里，rc.2 一口气新增了大量长名 DevTools 议题说明文本，
// 逐个列名已不可维护（一次就有 91 个越线）。这些 .md 运行时按 URL 懒取、删掉不影响装载，
// 所以这里做一条**有名有姓的目录级决定**：该目录下的 .md 整批不进包。

// ---- ②c 整树剪除（2026-11-12，0.2.2-rc.2 新增 office-kit 触发）----
// rc.2 新增的 @deepseek-ai/dsh-office-kit 把 LibreOffice 整套打进来，其中 `sources/` 是
// 构建期输入（引擎源码 + *.patch），运行时用不到；它贡献了 27 个越线路径。program/ 下的
// 才是运行时资源，不在本清单里。
const NSIS_SOURCE_PRUNE_TREES_RUNTIME = NSIS_SOURCE_PRUNE_TREES;
for (const tree of NSIS_SOURCE_PRUNE_TREES_RUNTIME) {
  const abs = path.join(payloadRoot, ...tree.split("/"));
  if (!fs.existsSync(abs)) continue;
  fs.rmSync(abs, { recursive: true, force: true });
  pruned += 1;
  console.log(`[nsis-gate] 整树剪除（构建期输入，运行时不用）：${tree}`);
}
const pruneDirAbs = path.join(payloadRoot, ...NSIS_SOURCE_PRUNE_DIR.split("/"));
if (fs.existsSync(pruneDirAbs)) {
  let dirPruned = 0;
  for (const name of fs.readdirSync(pruneDirAbs)) {
    if (!name.endsWith(".md")) continue;
    const abs = path.join(pruneDirAbs, name);
    if (!fs.statSync(abs).isFile()) continue;
    fs.rmSync(abs, { force: true });
    dirPruned += 1;
  }
  pruned += dirPruned;
  console.log(`[nsis-gate] 目录级剪除 ${dirPruned} 个文件：${NSIS_SOURCE_PRUNE_DIR} 下全部 .md（DevTools 议题说明，运行时懒取）`);
}

// ---- ③ 全 payload 走盘：构建期源路径 + 安装态两条墙一起量 ----
const relFiles = [];
(function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    // 链接不当目录跟（悬空 junction 会让 cpSync 原生崩溃的同族坑；这里只量长度，按文件计）。
    if (e.isDirectory() && !e.isSymbolicLink()) { walk(full); continue; }
    relFiles.push(path.relative(payloadRoot, full).split(path.sep).join('/'));
  }
})(payloadRoot);

const overSrc = overlongSourceFiles(relFiles);
if (overSrc.length) {
  console.error(`[nsis-gate] FATAL: ${overSrc.length} 个 payload 文件在 CI 上会越过 makensis 的 ${NSIS_SOURCE_LIMIT} 字符源路径断点`
    + `（前缀 ${NSIS_SOURCE_PREFIX_DEFAULT.length} 字符；实测 258 通过 / 260 中断）：`);
  for (const r of overSrc.slice(0, 8)) console.error(`[nsis-gate]   ${r.len}  ${r.rel}`);
  console.error('[nsis-gate]        三条出路，按代价排：① 加进 NSIS_SOURCE_PRUNES（有名有姓地丢文件，只适合懒取的文本文档）；',
    '\n                   ② 缩短 staging 路径（载荷目录已缩到 `dsh-tauri/pp/`，再腾就得挪进 src-tauri、'
    + '或压短上游文件的目录层级，代价明显更高）；',
    '\n                   ③ 上游把该文件的目录层级/文件名压短。绝不放行一个「跑到一半炸」的发包——'
    + 'v1.0.4 就是这么让 Windows 资产缺了一次发布。');
  process.exit(1);
}

const overInst = overlongFiles(relFiles);
if (overInst.length) {
  console.error(`[nsis-gate] FATAL: ${overInst.length} 个 payload 文件在安装态会超过 ${PATH_LIMIT_DEFAULT} 字符`
    + `（前缀按 ${INSTALL_PREFIX_DEFAULT} 计）：`);
  for (const r of overInst.slice(0, 8)) console.error(`[nsis-gate]   ${r.len}  ${r.rel}`);
  console.error('[nsis-gate]        安装到 Program Files 之外更深目录的用户会拿不全载荷——拒绝打包');
  process.exit(1);
}

const topSrc = relFiles.reduce((acc, rel) => {
  const len = sourcePathLength(rel);
  return len > acc.len ? { rel, len } : acc;
}, { rel: '', len: 0 });
const topInst = longestInstallPath(relFiles);
console.log(`[nsis-gate] OK: ${relFiles.length} 个 payload 文件，`
  + `最长 CI 源路径 ${topSrc.len}（< 断点 ${NSIS_SOURCE_LIMIT}，剩余量 ${NSIS_SOURCE_LIMIT - topSrc.len}）＝ ${topSrc.rel}，`
  + `最长安装路径 ${topInst.len}（< ${PATH_LIMIT_DEFAULT}），按清单剪除 ${pruned} 个文件`);
