'use strict';

// DSH Desktop 设置页「上下文管理」→ agent 预设压缩配置改写（幂等）。
//
// 背景：自动上下文压缩（@deepseek-ai/dsh-compaction-basic）的配置
// （auto / thresholdRatio / maxTokens）只存在于各 agent 预设的
// agent.cordis.yml 里，设置页没有入口。本模块把设置页保存的值幂等地
// 写进每个含 compaction-basic 的预设文件，供主进程在启动时和保存时调用。
//
// 独立成模块（而不是内联在 main.js）：主进程文件依赖 electron，无法脱离
// 应用单独测试；本模块是纯函数，可用 node 直接单测。

const COMPACTION_MARKER = '# DSH Desktop 上下文管理设置（设置页生成，请勿手改）';

/** 默认值：与 @deepseek-ai/dsh-compaction-basic 的出厂默认一致。 */
function defaultSettings() {
  return { auto: true, thresholdRatio: 0.8, maxTokens: 8192 };
}

/**
 * 校验并规范化用户设置（容忍脏输入，非法值回退默认）。
 * @param {unknown} input
 */
function normalizeSettings(input) {
  const src = input && typeof input === 'object' ? input : {};
  const auto = src.auto !== false;
  let thresholdRatio = Number(src.thresholdRatio);
  if (!Number.isFinite(thresholdRatio) || thresholdRatio <= 0 || thresholdRatio > 1) {
    thresholdRatio = 0.8;
  }
  let maxTokens = Number(src.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1024 || maxTokens > 1048576) {
    maxTokens = 8192;
  }
  return { auto, thresholdRatio, maxTokens };
}

/**
 * 改写单个预设文件的 compaction-basic 条目：
 *   - 无 compaction-basic → 原样返回（调用方跳过）；
 *   - 已有 config（含旧版本生成的）→ 整块替换为规范块；
 *   - 无 config → 插入规范块。
 * 换行风格跟随文件本身（CRLF/LF）。
 * @param {string} content 预设 YAML 全文
 * @param {{auto: boolean, thresholdRatio: number, maxTokens: number}} settings
 * @returns {string} 改写后的内容（未变则原样返回）
 */
function patchPresetFile(content, settings) {
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  const entryRe = new RegExp(
    '^[ \\t]*- id: compaction-basic\\r?\\n' +
      "[ \\t]*name: '@deepseek-ai/dsh-compaction-basic'\\r?\\n" +
      '(?:[ \\t]*config:\\r?\\n(?:[ \\t]+(?!- id:)[^\\r\\n]*\\r?\\n)*)?',
    'm'
  );
  if (!entryRe.test(content)) return content;
  const block =
    `    - id: compaction-basic${nl}` +
    `      name: '@deepseek-ai/dsh-compaction-basic'${nl}` +
    `      config:${nl}` +
    `        ${COMPACTION_MARKER}${nl}` +
    `        auto: ${settings.auto}${nl}` +
    `        thresholdRatio: ${settings.thresholdRatio}${nl}` +
    `        maxTokens: ${settings.maxTokens}${nl}`;
  return content.replace(entryRe, block);
}

module.exports = { COMPACTION_MARKER, defaultSettings, normalizeSettings, patchPresetFile };
