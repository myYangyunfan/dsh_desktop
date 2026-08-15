'use strict';

// profile manifest bundles 自愈核心（纯函数、无 electron 依赖，便于 node:test 单测）。
//
// 背景（issue #16）：旧版本（0.3.3/0.3.4，即 #13 的 bug 场景）会把
// profiles/web/package.json 的 dsh.profile.bundles 写成「只有配套 bundle、
// 缺少核心 bundles」的坏状态。dsh 启动时核心服务（webServer/subprocess/
// settings/llm 等）无人提供，插件树无法激活（N entries did not activate），
// 且该状态在后续版本中无法自愈。
//
// 这里提供纯函数化的「校验 + 补齐」逻辑：把缺失的核心 bundles 补到列表
// 最前（保持与 dsh-app-boot PROFILE_TEMPLATES.web 一致的先后顺序），
// 其余条目（含用户自行添加的）原样保留；无需修复时返回 null（零写入）。

// 与 dsh-app-boot 的 PROFILE_TEMPLATES.web 一致的核心 bundles（先后顺序有意义）。
const CORE_BUNDLE_NAMES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

/**
 * 补齐 bundles 中缺失的核心 bundles。
 * @param {Array} bundles 现有 dsh.profile.bundles 数组（可能含非字符串条目，原样保留）
 * @param {Array<string>} resolvableCores 当前 dsh 安装中可解析的核心 bundle 名；
 *   只接受出现在 CORE_BUNDLE_NAMES 中的名字，解析不到的名字绝不写入。
 * @returns {{ next: Array, added: string[] } | null} 有缺失时返回补好后的新数组
 *   与新增项；无缺失（或无可解析核心）时返回 null，调用方零写入。
 */
function ensureCoreBundles(bundles, resolvableCores) {
  const usable = [...new Set(
    (Array.isArray(resolvableCores) ? resolvableCores : []).filter((c) => CORE_BUNDLE_NAMES.includes(c))
  )];
  const added = usable.filter((c) => !bundles.includes(c));
  if (added.length === 0) return null;
  return { next: [...added, ...bundles], added };
}

module.exports = { ensureCoreBundles, CORE_BUNDLE_NAMES };
