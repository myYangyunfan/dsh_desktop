'use strict';
// ---------------------------------------------------------------------------
// 纯文本手术：web profile 的 cordis.patch.yml 中某个插件的用户层 disabled 条目
// 开关。不改写文件其它内容/注释（保留格式与用户手写条目）。
//
//   关闭 —— 先从任何 `- insert:` 块内移除该 id 的内层条目（避免 loader 双登记
//           崩溃），再保证存在一个顶层 `- id: <id>` 条目且带 `disabled: true`；
//           顶层条目已存在（如 llm-deepseek）则就地补 disabled 行。
//   启用 —— 移除顶层条目的 disabled 行；条目没有 config 时整个条目移除
//           （配套插件下次启动由壳的 syncCompanionPlugins 重新 insert）。
// ---------------------------------------------------------------------------

function escRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// loader 条目 id 的白名单：普通标识符（连字符/下划线/点）。防注入：
// id 会被拼进正则与 YAML 文本，禁止空白、引号、冒号等特殊字符。
const ID_RE = /^[A-Za-z0-9_.-]+$/;

/** YAML 单引号串转义：单引号加倍（''）。 */
function yamlQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// 顶层用户层条目（缩进 0-2 空格）+ 全部续行（含行尾换行）。
function topLevelEntryRe(id) {
  return new RegExp('(?:^|\\n)([ \\t]{0,2})- id:\\s*' + escRegExp(id) + '\\b[^\\n]*\\n(?:[ \\t]+[^\\n]*\\n)*', 'g');
}

// insert 块内的内层条目（缩进 >= 4）+ 续行（含行尾换行）。
function insertInnerEntryRe(id) {
  return new RegExp('(?:^|\\n)[ \\t]+- id:\\s*' + escRegExp(id) + '\\b[^\\n]*\\n(?:[ \\t]+[^\\n]*\\n)*', 'g');
}

// 本模块写入的标记注释行（整行，含行尾换行）。
// 用零宽 lookbehind 锚定行首：连续多行同类注释能逐条匹配，
// 不会被「消费型行首锚点」隔行跳过（那是注释堆积自愈失效的根因）。
function markerCommentRe(id) {
  return new RegExp('(?:^|(?<=\\n))# [^\\n]*关闭 ' + escRegExp(id) + '[^\\n]*(?:\\n|$)', 'g');
}

/**
 * @param {string} text     cordis.patch.yml 原文
 * @param {string} id       插件 id（如 terminal / llm-deepseek）
 * @param {boolean} enabled true=启用（移除 disabled 覆盖），false=关闭
 * @param {string} [name]   插件包名（追加新条目时写入 name 行；缺省用 id 占位）
 * @returns {string} 修改后的文本（幂等；无变化时返回原文本）
 */
function togglePluginInPatch(text, id, enabled, name) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof id !== 'string' || !id) throw new TypeError('id must be a non-empty string');
  if (!ID_RE.test(id)) throw new TypeError('id 含非法字符（仅允许字母/数字/下划线/点/连字符）: ' + id);
  let out = text;
  const pkgName = typeof name === 'string' && name ? name : id;

  if (!enabled) {
    // 1) 从 insert 块内移除内层条目（同一 id 只保留一个登记点）
    out = out.replace(insertInnerEntryRe(id), (m) => (m[0] === '\n' ? '\n' : ''));
    // 1.5) 清理被掏空的孤立 `- insert:` 空块（后续不再是缩进条目）
    out = out.replace(/(?:^|\n)- insert:\s*\n(?![ \t]+-)/g, (m) => (m[0] === '\n' ? '\n' : ''));
    // 2) 顶层条目：存在则确保 disabled: true；不存在则追加
    const topRe = topLevelEntryRe(id);
    if (topRe.test(out)) {
      topRe.lastIndex = 0;
      out = out.replace(topRe, (block) => {
        // 只认 0-2 空格缩进的 disabled/name 行（本模块写入的格式），
        // 不碰 config 块内更深缩进的同名键。
        if (/(?:^|\n)[ \t]{0,2}disabled\s*:/.test(block)) return block;
        if (/(?:^|\n)[ \t]{0,2}name\s*:/.test(block)) {
          return block.replace(/(?:\n[ \t]{0,2}name\s*:[^\n]*)/, (m) => m + '\n  disabled: true');
        }
        return block.replace(/\n$/, '') + '\n  disabled: true\n';
      });
    } else {
      // 追加前先清掉历史遗留的标记注释（上一次启用只删条目、注释残留时
      // 会重复堆积），再追加一份「注释 + 条目」，保证多次开关不叠加。
      out = out.replace(markerCommentRe(id), '');
      const block = '\n# 插件管理（设置页「插件」栏）：关闭 ' + id + '\n- id: ' + id + '\n  name: ' + yamlQuote(pkgName) + '\n  disabled: true\n';
      out = out.replace(/\s*$/, '') + block;
    }
    return out;
  }

  // 启用：顶层条目移除 disabled 行（0-2 空格缩进）；无 config 则整个条目移除；
  // 连带移除本模块的标记注释（避免反复开关时注释堆积）。
  out = out.replace(topLevelEntryRe(id), (m) => {
    const withoutDisabled = m.replace(/\n[ \t]{0,2}disabled\s*:\s*(?:true|false)[^\n]*/g, '');
    if (/(?:^|\n)[ \t]{0,2}config\s*:/.test(withoutDisabled)) return withoutDisabled;
    return m[0] === '\n' ? '\n' : '';
  });
  out = out.replace(markerCommentRe(id), '');
  return out;
}

module.exports = { togglePluginInPatch };
