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
// id 边界用负向断言（id 字符集 [A-Za-z0-9_.-]，`\b` 对 -/. 是非法词边界，
// 会误匹配前缀如 terminal→terminal-tab）；续行组前瞻排除同缩进兄弟
// `- id:`（贪婪续行会把同块后续兄弟条目整块吞掉，造成误删）。
function topLevelEntryRe(id) {
  return new RegExp('(?:^|\\n)([ \\t]{0,2})- id:\\s*' + escRegExp(id) + '(?![A-Za-z0-9_.-])[^\\n]*\\n(?:[ \\t]+(?![ \\t]*- id:)[^\\n]*\\n)*', 'g');
}

// insert 块内的内层条目（缩进 >= 4）+ 续行（含行尾换行）。
function insertInnerEntryRe(id) {
  return new RegExp('(?:^|\\n)[ \\t]+- id:\\s*' + escRegExp(id) + '(?![A-Za-z0-9_.-])[^\\n]*\\n(?:[ \\t]+(?![ \\t]*- id:)[^\\n]*\\n)*', 'g');
}

// 本模块写入的标记注释行（整行，含行尾换行）。
// 用零宽 lookbehind 锚定行首：连续多行同类注释能逐条匹配，
// 不会被「消费型行首锚点」隔行跳过（那是注释堆积自愈失效的根因）。
function markerCommentRe(id) {
  return new RegExp('(?:^|(?<=\\n))# [^\\n]*关闭 ' + escRegExp(id) + '[^\\n]*(?:\\n|$)', 'g');
}

// 卸载标记注释行（整行，含行尾换行）。
function uninstallCommentRe(id) {
  return new RegExp('(?:^|(?<=\\n))# [^\\n]*卸载 ' + escRegExp(id) + '[^\\n]*(?:\\n|$)', 'g');
}

/**
 * 卸载/恢复标记手术：
 *   卸载 —— 同「关闭」的登记点手术（移出 insert 块、孤儿块清理、确保顶层条目
 *           disabled: true），再在顶层条目补 `removed: true`（本模块的卸载标记，
 *           同步器据此跳过文件复制，避免下次启动「复活」）。
 *   恢复 —— 移除 removed 行；无 config 则整个条目移除（配套插件下次启动由
 *           同步器重新 insert + 复制文件；基础层插件由基础 patch 重新提供）。
 * @param {string} text    cordis.patch.yml 原文
 * @param {string} id      插件 id
 * @param {boolean} removed true=卸载，false=恢复
 * @param {string} [name]  包名（追加新条目时使用）
 */
function setPluginRemoved(text, id, removed, name) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof id !== 'string' || !id) throw new TypeError('id must be a non-empty string');
  if (!ID_RE.test(id)) throw new TypeError('id 含非法字符（仅允许字母/数字/下划线/点/连字符）: ' + id);
  let out = text;
  const pkgName = typeof name === 'string' && name ? name : id;

  if (removed) {
    // 1) 与禁用同款：移出 insert 块 + 孤儿块清理
    out = out.replace(insertInnerEntryRe(id), (m) => (m[0] === '\n' ? '\n' : ''));
    out = out.replace(/(?:^|\n)- insert:\s*\n(?![ \t]+-)/g, (m) => (m[0] === '\n' ? '\n' : ''));
    // 2) 顶层条目：确保 disabled: true + removed: true
    const topRe = topLevelEntryRe(id);
    if (topRe.test(out)) {
      topRe.lastIndex = 0;
      out = out.replace(topRe, (block) => {
        if (!/(?:^|\n)[ \t]{0,2}removed\s*:/.test(block)) {
          block = block.replace(/\n$/, '') + '\n  removed: true\n';
        }
        if (!/(?:^|\n)[ \t]{0,2}disabled\s*:/.test(block)) {
          if (/(?:^|\n)[ \t]{0,2}name\s*:/.test(block)) {
            block = block.replace(/(?:\n[ \t]{0,2}name\s*:[^\n]*)/, (m) => m + '\n  disabled: true');
          } else {
            block = block.replace(/\n$/, '') + '\n  disabled: true\n';
          }
        }
        return block;
      });
    } else {
      // 先清历史遗留注释（恢复/卸载反复操作不堆积），再追加「注释 + 条目」
      out = out.replace(uninstallCommentRe(id), '');
      out = out.replace(markerCommentRe(id), '');
      const block = '\n# 插件管理（设置页「插件」栏）：卸载 ' + id + '\n- id: ' + id + '\n  name: ' + yamlQuote(pkgName) + '\n  disabled: true\n  removed: true\n';
      out = out.replace(/\s*$/, '') + block;
    }
    return out;
  }

  // 恢复：移除 removed/disabled 行；无 config 则整个条目移除（含卸载注释）
  out = out.replace(topLevelEntryRe(id), (m) => {
    const withoutFlags = m
      .replace(/\n[ \t]{0,2}removed\s*:\s*true[^\n]*/g, '')
      .replace(/\n[ \t]{0,2}disabled\s*:\s*(?:true|false)[^\n]*/g, '');
    if (/(?:^|\n)[ \t]{0,2}config\s*:/.test(withoutFlags)) return withoutFlags;
    return m[0] === '\n' ? '\n' : '';
  });
  out = out.replace(uninstallCommentRe(id), '');
  return out;
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

module.exports = { togglePluginInPatch, setPluginRemoved };
