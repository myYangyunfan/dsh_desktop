'use strict';

// 修复 issue #36：dsh-client-ui-primitives 的 Menu 弹层（portal 模式）在条目
// 很多（如 8 个壳内置 Agent 预设 + npm 自带预设 + 用户安装的预设叠加）时
// 没有高度上限：place() 用列表完整高度做视口夹紧
//   y = min(max(y, 12), vh - lh - 12)
// 列表比视口还高时 vh - lh - 12 为负，弹层被推到视口上方，顶部条目（标准
// 模式等）被裁掉且无法滚动/触达（用户反馈「预设多了上面的会不显示」）。
//
// 修复（幂等、anchor 不匹配时跳过且绝不损坏文件）：
//  1. 给 portal 列表加内联 max-height（min(视口高-24px, 560px)）+ overflow-y
//     auto——列表自身可滚动，任何视口高度下都完整可用；
//  2. place() 的 y 夹紧按「封顶后的高度」计算，保证弹层始终完整落在视口内。
//
// 用法：
//   node scripts/patch-menu-viewport.js [<node_modules 根目录>]
// 同时导出 patchMenuViewport(nmRoot, log) 供 main.js 启动补丁与 after-pack.js
// 打包补丁复用（覆盖内置副本 / profile fallback / agent overlay）。

const fs = require('node:fs');
const path = require('node:path');
// 原子写与 main.js / 其它补丁脚本共用同一实现（scripts/lib/patch-io.js）。
const { writeFileAtomic } = require('./lib/patch-io');

const MARKER = 'dsh-desktop patch (issue #36)';

const OLD_Y_CLAMP = 'if (lh > 0) y = Math.min(Math.max(y, MARGIN), vh - lh - MARGIN);';
const NEW_Y_CLAMP = [
  '// dsh-desktop patch (issue #36): 列表高度按视口封顶（见下方 maxHeight），',
  '// y 夹紧按封顶后的高度计算，弹层永远完整落在视口内。',
  'if (lh > 0) y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - Math.min(lh, vh - 2 * MARGIN) - MARGIN));',
].join('\n');

const OLD_STYLE = 'style: portal ? fixedPos ?? MEASURE_STYLE : void 0,';
const NEW_STYLE = 'style: portal ? { ...(fixedPos ?? MEASURE_STYLE), maxHeight: "min(calc(100vh - 24px), 560px)", overflowY: "auto" } : void 0,';

function patchFile(file, log = () => {}) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('menu-viewport 补丁: 读取失败 ' + file + ': ' + err.message);
    return false;
  }
  if (src.includes(MARKER)) {
    log('menu-viewport 补丁: 已应用，跳过 ' + file);
    return false;
  }
  if (!src.includes(OLD_Y_CLAMP) || !src.includes(OLD_STYLE)) {
    log('menu-viewport 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file);
    return false;
  }
  src = src.replace(OLD_Y_CLAMP, NEW_Y_CLAMP).replace(OLD_STYLE, NEW_STYLE);
  src = '// ' + MARKER + ': Menu portal 列表视口封顶（issue #36）\n' + src;
  try {
    writeFileAtomic(file, src);
    log('menu-viewport 补丁: 已应用 ' + file);
    return true;
  } catch (err) {
    log('menu-viewport 补丁: 写入失败 ' + file + ': ' + err.message);
    return false;
  }
}

/**
 * 对某个 node_modules 根目录应用 issue #36 补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @returns {number} 实际发生修改的文件数
 */
function patchMenuViewport(nmRoot, log = () => {}) {
  const file = path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-primitives', 'lib', 'index.js');
  if (!fs.existsSync(file)) return 0;
  return patchFile(file, log) ? 1 : 0;
}

module.exports = { patchMenuViewport, MARKER };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchMenuViewport(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
