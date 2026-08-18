'use strict';

// A-12: 设置写入侧防御——settings.yaml 写后校验（轻量 YAML 解析 + 必需段
// 存在性），失败时自动回写「最近一次通过校验」的备份内容。
//
// dsh web 的 settings 服务负责写 settings.yaml，壳侧不直接写；本模块提供
// 纯函数供壳侧 watch+防抖后调用：读文件 → 校验 → 通过则更新备份缓存，
// 失败则从备份回写并报告。回写用 tmp+rename 原子写；Windows 下目标文件
// 被占用（dsh 正在写）时回写抛错由调用方静默处理。

const DEFAULT_REQUIRED_SECTIONS = ['agent-default-model'];

/**
 * 轻量 YAML 校验：yaml 可用时走完整解析（js-yaml 方言），不可用时降级为
 * 行级必需段存在检查（settings 服务仍可辨读的形态）。
 * @param {string} text
 * @param {{yaml?: {load: Function}|Function, requiredSections?: string[]}} [opts]
 * @returns {{ok: boolean, error?: string, missing?: string[]}}
 */
function validateSettingsYaml(text, opts) {
  const requiredSections = (opts && opts.requiredSections) || DEFAULT_REQUIRED_SECTIONS;
  const yaml = opts && opts.yaml;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'settings.yaml 为空' };
  }
  if (yaml) {
    let parsed;
    try {
      // 兼容 {load} 对象与裸函数两种注入形态（main.js loadDshYamlDialect
      // 返回 {load}；测试可注入 (t) => t）。
      parsed = typeof yaml === 'function' ? yaml(text) : yaml.load(text);
    } catch (err) {
      return { ok: false, error: 'YAML 解析失败: ' + String((err && err.message) || err) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'settings.yaml 顶层不是对象' };
    }
    const missing = requiredSections.filter((s) => parsed[s] === undefined);
    if (missing.length > 0) {
      return { ok: false, missing, error: '缺少必需配置段: ' + missing.join(', ') };
    }
    return { ok: true };
  }
  // 降级：行级检查（^段名:），多行签名中的段也认可。
  const missing = requiredSections.filter((s) => {
    const re = new RegExp('(^|\\n)[ \\t]*' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:');
    return !re.test(text);
  });
  if (missing.length > 0) {
    return { ok: false, missing, error: '缺少必需配置段: ' + missing.join(', ') };
  }
  return { ok: true };
}

/**
 * 处理一次 settings.yaml 变更：校验通过 → 更新备份；失败 → 有备份则回写
 * （tmp+rename 原子写），无备份仅报告。
 * @param {string} file
 * @param {{backupFile: string, yaml?: object|Function, requiredSections?: string[], fs?: object}} opts
 * @returns {{ok: boolean, changed: boolean, recovered?: boolean, error?: string}}
 */
function guardSettingsChange(file, opts) {
  const fs = opts.fs || require('node:fs');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ok: true, changed: false, error: undefined, readError: String((err && err.message) || err) };
  }
  const check = validateSettingsYaml(text, opts);
  if (check.ok) {
    try {
      // 备份也走 tmp+rename 原子写，避免半写损坏后回写坏内容（与回写同语义）。
      fs.mkdirSync(require('node:path').dirname(opts.backupFile), { recursive: true });
      const tmpFile = opts.backupFile + '.tmp-' + process.pid;
      fs.writeFileSync(tmpFile, text, 'utf8');
      fs.renameSync(tmpFile, opts.backupFile);
    } catch {}
    return { ok: true, changed: false };
  }
  let backupText = null;
  try {
    backupText = fs.readFileSync(opts.backupFile, 'utf8');
  } catch {}
  if (backupText === null) {
    return { ok: false, changed: false, recovered: false, error: check.error };
  }
  try {
    // tmp+rename 原子回写（与 writeFileAtomic 同语义，避免半写）。
    const tmpFile = opts.backupFile + '.tmp-' + process.pid;
    fs.writeFileSync(tmpFile, backupText, 'utf8');
    fs.renameSync(tmpFile, file);
    return { ok: false, changed: true, recovered: true, error: check.error };
  } catch (err) {
    return { ok: false, changed: false, recovered: false, error: check.error + '（回写失败: ' + String((err && err.message) || err) + '）' };
  }
}

module.exports = {
  DEFAULT_REQUIRED_SECTIONS,
  validateSettingsYaml,
  guardSettingsChange,
};