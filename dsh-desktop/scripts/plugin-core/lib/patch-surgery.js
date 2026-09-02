'use strict';

// ---------------------------------------------------------------------------
// plugin-core 补丁层文本手术（patch-surgery）：cordis.patch.yml 全部读写
// 的唯一实现。合并并修正历史三份实现（scripts/plugin-manager-patch.js、
// profile-patch-heal.js、patch-row-heal.js + companion-profile.js 的补丁段）：
//
//   · loader id 正则全仓统一（含点号），修复「点号 id 能写不能愈」漂移；
//   · 所有改写保持原文件 EOL（CRLF 输入不再被全文改写为 LF）；
//   · idNameRe 支持单引号/双引号/无引号 name 形态（包改名自愈不再漏修）；
//   · removeBundledRowDuplicates 的 id 级去重由调用方注入 bundleEntryIds
//     （guard 侧已接线 collectBundleEntryIds，修复死代码盲区）。
//
// 契约：除 parsePatchRows 外的每个函数都以「原文本 → { text/patch, ... }」
// 纯函数形态工作（不落盘、不持有路径）；写入由调用方经 fs-atomic 的
// writeFileAtomic + WriteGate 完成。无修改时返回原文本（零写入）。
// ---------------------------------------------------------------------------

const { LOADER_ID_RE } = require('./ids');
const { escRegExp, detectEol, splitLines, joinLines, preserveEol, yamlQuote } = require('./text');
const { writeFileAtomic } = require('./fs-atomic');

// 新 patch 文件的头部（历史两种入口逐字一致）。
const PATCH_HEADER = '# dsh web profile patch（由 DSH Desktop 维护）\n';

// billion-context-dsh（compaction-acp）与默认 compaction-basic 互斥的禁用块。
const ACP_DISABLE_BLOCK = '\n# billion-context-dsh：禁用 preset realm 的 compaction-basic（ACP 模型驱动后端接管压缩决策）\n- id: compaction-basic\n  disabled: true\n';

// 桌面宠物（harness-pet）默认关闭的禁用块。
const PET_DISABLE_BLOCK = '\n# harness-pet：桌面宠物默认关闭（设置 → 插件 → 管理 可一键开启）\n- id: harness-pet\n  disabled: true\n';

// billion-context-dsh（compaction-acp）自身默认关闭的禁用块（harness-pet 同款）。
// 用户反馈模型驱动压缩在占用率未及 1/4 时仍频繁压缩，改为默认关闭；需要时在
// 设置 → 插件 → 管理 一键开启。禁用顶层条目一票否决 bundle 自身 cordis.patch.yml
// 的 insert 注册（loader disabled 覆盖语义），内核默认 compaction-basic 随即接管。
const ACP_SELF_DISABLE_BLOCK = '\n# billion-context-dsh（compaction-acp）：模型驱动压缩默认关闭（频繁自动压缩反馈；设置 → 插件 → 管理 可一键开启）\n- id: compaction-acp\n  disabled: true\n';

// 顶层条目 id 行（缩进 0-2）：统一字符集，含点号。
const ID_ROW_RE = /^(\s*)-\s*id:\s*([A-Za-z0-9][A-Za-z0-9_.-]*)/;
// 任意缩进的条目 id 行（insert 块内层 / 顶层共用）。
const ANY_ID_ROW_RE = /^([\t ]*)-\s*id:\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?![A-Za-z0-9_.-])/;

// ---------------------------------------------------------------------------
// 行级解析（inventory / heal 共用）
// ---------------------------------------------------------------------------

/**
 * 把 patch 文本解析为结构化的行集合（纯文本扫描，YAML 损坏时仍尽力解析，
 * 比 js-yaml 全有全无更适合管理场景）。
 * @param {string} text cordis.patch.yml 原文
 * @returns {{ top: Array<{id:string,name:string,disabled:boolean,removed:boolean,hasConfig:boolean}>,
 *            inserts: Array<{id:string,name:string,disabled:boolean,removed:boolean,hasConfig:boolean}> }}
 */
function parsePatchRows(text) {
  const top = [];
  const inserts = [];
  const lines = splitLines(text);
  let current = null; // { bucket, row }
  const flush = () => {
    if (!current) return;
    current.bucket.push(current.row);
    current = null;
  };
  for (const line of lines) {
    const m = ANY_ID_ROW_RE.exec(line);
    if (m) {
      flush();
      const indent = m[1].replace(/\t/g, '  ').length;
      const row = { id: m[2], name: '', disabled: false, removed: false, hasConfig: false };
      current = { bucket: indent >= 4 ? inserts : top, row };
      continue;
    }
    if (!current) continue;
    const indent = (line.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length;
    // 回到更浅层或新的同级块：本条目结束。
    const isSiblingBlock = /^[\t ]*- (?:id|insert)\s*:/.test(line);
    if (isSiblingBlock && indent < 4) { flush(); continue; }
    const nm = /^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
    if (nm) current.row.name = nm[1];
    else if (/^\s*disabled:\s*(true|false)\s*$/i.test(line)) current.row.disabled = /true/i.test(line);
    else if (/^\s*removed:\s*(true|false)\s*$/i.test(line)) current.row.removed = /true/i.test(line);
    else if (/^\s*config\s*:/.test(line)) current.row.hasConfig = true;
  }
  flush();
  return { top, inserts };
}

/** 提取全部条目 id（顶层 + insert 内层，去重；与历史 patchRowIds 语义兼容）。 */
function patchRowIds(text) {
  const ids = [];
  const seen = new Set();
  for (const line of splitLines(text)) {
    const m = ANY_ID_ROW_RE.exec(line);
    if (m && !seen.has(m[2])) {
      seen.add(m[2]);
      ids.push(m[2]);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 开关 / 卸载（历史 plugin-manager-patch.js，唯一实现 + EOL 保持）
// ---------------------------------------------------------------------------

// 顶层用户层条目（缩进 0-2 空格）+ 完整子树（含行尾换行）。
// 子树用非贪婪 [\s\S]*? 匹配，并以「下一同级 - id: / - insert: / 注释 / 文件尾」
// 前瞻收口，避免贪婪续行组把同一 insert 块内后续兄弟条目一并吞掉（issue #66）。
function topLevelEntryRe(id) {
  return new RegExp('(?:^|\\n)([ \\t]{0,2})- id:\\s*' + escRegExp(id) + '(?![ \\t]*[A-Za-z0-9_.-])[^\\n]*\\n([\\s\\S]*?)(?=(?:\\n[ \\t]{0,2}- id:)|(?:\\n[ \\t]{0,2}- insert:)|(?:\\n#)|\\s*$)', 'g');
}

// insert 块内的内层条目（缩进 >= 4）+ 完整子树（含行尾换行）。
function insertInnerEntryRe(id) {
  return new RegExp('(?:^|\\n)[ \\t]+- id:\\s*' + escRegExp(id) + '(?![ \\t]*[A-Za-z0-9_.-])[^\\n]*\\n([\\s\\S]*?)(?=(?:\\n[ \\t]+- id:)|(?:\\n[ \\t]{0,2}- id:)|(?:\\n[ \\t]{0,2}- insert:)|\\s*$)', 'g');
}

// 本模块写入的标记注释行（整行，含行尾换行）。零宽 lookbehind 锚定行首，
// 连续多行同类注释能逐条匹配（历史消费型行首锚点会隔行跳过）。
function markerCommentRe(id) {
  return new RegExp('(?:^|(?<=\\n))# [^\\n]*关闭 ' + escRegExp(id) + '[^\\n]*(?:\\n|$)', 'g');
}

function uninstallCommentRe(id) {
  return new RegExp('(?:^|(?<=\\n))# [^\\n]*卸载 ' + escRegExp(id) + '[^\\n]*(?:\\n|$)', 'g');
}

/** 清理被掏空的孤立 `- insert:` 空块。 */
function dropEmptyInsertBlocks(out) {
  return out.replace(/(?:^|\n)- insert:\s*\n(?![ \t]+-)/g, (m) => (m[0] === '\n' ? '\n' : ''));
}

/**
 * 卸载/恢复标记手术：
 *   卸载 —— 与「关闭」同款登记点手术（移出 insert 块、孤儿块清理、确保顶层
 *           disabled: true），再在顶层条目补 `removed: true`（卸载标记，
 *           同步器据此跳过文件复制，避免下次启动「复活」）。
 *   恢复 —— 移除 removed 行；无 config 则整个条目移除（配套插件下次启动由
 *           同步器重新 insert + 复制文件；基础层插件由基础 patch 重新提供）。
 * @param {string} text cordis.patch.yml 原文
 * @param {string} id 插件 id
 * @param {boolean} removed true=卸载，false=恢复
 * @param {string} [name] 包名（追加新条目时使用）
 * @returns {string} 修改后的文本（幂等；无变化时返回原文本）
 */
function setPluginRemoved(text, id, removed, name) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof id !== 'string' || !id) throw new TypeError('id must be a non-empty string');
  if (!LOADER_ID_RE.test(id)) throw new TypeError('id 含非法字符（仅允许字母/数字/下划线/点/连字符）: ' + id);
  // EOL 保持：内部统一按 LF 手术（正则以 \n 为界），输出按原 EOL 还原——
  // CRLF 文件不再被局部手术留下混合换行。
  const original = text;
  const normalized = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  let out = normalized;
  const pkgName = typeof name === 'string' && name ? name : id;

  if (removed) {
    // 1) 与禁用同款：移出 insert 块 + 孤儿块清理
    out = out.replace(insertInnerEntryRe(id), (m) => (m[0] === '\n' ? '\n' : ''));
    out = dropEmptyInsertBlocks(out);
    // 2) 顶层条目：确保 disabled: true + removed: true（false 值一律翻转为 true，
    //    否则手写 `disabled: false`/`removed: false` 会让卸载后条目仍参与组合/
    //    被同步器复活）
    const topRe = topLevelEntryRe(id);
    if (topRe.test(out)) {
      topRe.lastIndex = 0;
      out = out.replace(topRe, (block) => {
        if (/(?:^|\n)[ \t]{0,2}removed\s*:\s*false\b/i.test(block)) {
          block = block.replace(/(\n[ \t]{0,2}removed\s*:\s*)false\b/i, '$1true');
        } else if (!/(?:^|\n)[ \t]{0,2}removed\s*:/i.test(block)) {
          block = block.replace(/\n$/, '') + '\n  removed: true\n';
        }
        if (/(?:^|\n)[ \t]{0,2}disabled\s*:\s*false\b/i.test(block)) {
          block = block.replace(/(\n[ \t]{0,2}disabled\s*:\s*)false\b/i, '$1true');
        } else if (!/(?:^|\n)[ \t]{0,2}disabled\s*:/i.test(block)) {
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
    return out === normalized ? original : preserveEol(original, out);
  }

  // 恢复：移除 removed/disabled 行；无 config 则整个条目移除（含卸载注释）
  out = out.replace(topLevelEntryRe(id), (m) => {
    const withoutFlags = m
      .replace(/\n[ \t]{0,2}removed\s*:\s*true[^\n]*/gi, '')
      .replace(/\n[ \t]{0,2}disabled\s*:\s*(?:true|false)[^\n]*/gi, '');
    if (/(?:^|\n)[ \t]{0,2}config\s*:/.test(withoutFlags)) return withoutFlags;
    return m[0] === '\n' ? '\n' : '';
  });
  out = out.replace(uninstallCommentRe(id), '');
  return out === normalized ? original : preserveEol(original, out);
}

/**
 * 开关手术：写入/移除用户层 disabled 条目（纯文本，保持格式与注释）。
 *   关闭 —— 先从任何 `- insert:` 块内移除该 id 的内层条目（避免 loader 双登记
 *           崩溃），再保证存在一个顶层 `- id: <id>` 条目且带 `disabled: true`；
 *   启用 —— 移除顶层条目的 disabled 行；条目无 config 时整个条目移除。
 * @param {string} text cordis.patch.yml 原文
 * @param {string} id 插件 id
 * @param {boolean} enabled true=启用，false=关闭
 * @param {string} [name] 包名（追加新条目时写入 name 行；缺省用 id 占位）
 * @returns {string} 修改后的文本（幂等；无变化时返回原文本）
 */
function togglePluginInPatch(text, id, enabled, name) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof id !== 'string' || !id) throw new TypeError('id must be a non-empty string');
  if (!LOADER_ID_RE.test(id)) throw new TypeError('id 含非法字符（仅允许字母/数字/下划线/点/连字符）: ' + id);
  // EOL 保持：内部统一 LF，输出按原 EOL 还原（与 setPluginRemoved 同契约）。
  const original = text;
  const normalized = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  let out = normalized;
  const pkgName = typeof name === 'string' && name ? name : id;

  if (!enabled) {
    // 1) 从 insert 块内移除内层条目（同一 id 只保留一个登记点）
    out = out.replace(insertInnerEntryRe(id), (m) => (m[0] === '\n' ? '\n' : ''));
    // 1.5) 清理被掏空的孤立 `- insert:` 空块
    out = dropEmptyInsertBlocks(out);
    // 2) 顶层条目：存在则确保 disabled: true；不存在则追加
    const topRe = topLevelEntryRe(id);
    if (topRe.test(out)) {
      topRe.lastIndex = 0;
      out = out.replace(topRe, (block) => {
        // 只认 0-2 空格缩进的 disabled/name 行（本模块写入的格式），
        // 不碰 config 块内更深缩进的同名键。
        // `disabled: false` 与「无 disabled 行」同义：必须翻转为 true，
        // 否则手写 false 会让「关闭」静默失效（插件保持启用）。
        if (/(?:^|\n)[ \t]{0,2}disabled\s*:\s*true\b/i.test(block)) return block;
        if (/(?:^|\n)[ \t]{0,2}disabled\s*:\s*false\b/i.test(block)) {
          return block.replace(/(\n[ \t]{0,2}disabled\s*:\s*)false\b/i, '$1true');
        }
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
    return out === normalized ? original : preserveEol(original, out);
  }

  // 启用：顶层条目移除 disabled 行（0-2 空格缩进）；无 config 则整个条目移除；
  // 连带移除本模块的标记注释（避免反复开关时注释堆积）。
  out = out.replace(topLevelEntryRe(id), (m) => {
    const withoutDisabled = m.replace(/\n[ \t]{0,2}disabled\s*:\s*(?:true|false)[^\n]*/gi, '');
    if (/(?:^|\n)[ \t]{0,2}config\s*:/.test(withoutDisabled)) return withoutDisabled;
    return m[0] === '\n' ? '\n' : '';
  });
  out = out.replace(markerCommentRe(id), '');
  return out === normalized ? original : preserveEol(original, out);
}

// ---------------------------------------------------------------------------
// 重复注册去重 / 块级移除（历史 profile-patch-heal.js，唯一实现 + 统一 id 正则）
// ---------------------------------------------------------------------------

/**
 * 把文本切分为顶层条目块。顶层条目 = 行首（列 0）以 `- ` 开头的行，
 * 其后到下一个顶层条目之前的所有行属于该块。块的 insert 属性表示
 * 块首行为 `- insert:`（注册列表块）。
 * @param {string[]} lines 文件按行切分（已去行尾符）
 * @returns {{begin:number,end:number,lines:string[],insert:boolean}[]}
 */
function topLevelBlocks(lines) {
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^-(\s|$)/.test(lines[i])) starts.push(i);
  }
  const blocks = [];
  for (let s = 0; s < starts.length; s += 1) {
    const begin = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1] : lines.length;
    blocks.push({
      begin,
      end,
      lines: lines.slice(begin, end),
      insert: /^-\s*insert\s*:/.test(lines[begin]),
    });
  }
  return blocks;
}

/** 修复后文本只剩注释/空行时补 `[]`，保证文件仍是合法顶层数组。 */
function ensurePatchArray(lines) {
  if (!lines.some((l) => /^-(\s|$)/.test(l))) lines.push('[]');
  return lines;
}

/**
 * 移除「重复注册」的 loader 条目（issue #17 存量自愈）。语义与历史实现
 * 逐字一致（详见历史 profile-patch-heal.js 注释），差异仅在：id 字符集含
 * 点号、输出保持原 EOL。
 * @param {string} text cordis.patch.yml 原文
 * @returns {{ text: string, removed: string[] }}
 */
function dedupePatchEntries(text) {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const blocks = topLevelBlocks(lines);
  const registered = new Set();
  const removed = [];
  const out = [];
  if (blocks.length > 0 && blocks[0].begin > 0) out.push(...lines.slice(0, blocks[0].begin));
  for (const block of blocks) {
    if (!block.insert) {
      out.push(...block.lines);
      continue;
    }
    const kept = [block.lines[0]];
    let blockDupCount = 0;
    let i = 1;
    while (i < block.lines.length) {
      const m = ANY_ID_ROW_RE.exec(block.lines[i]);
      if (!m) {
        kept.push(block.lines[i]);
        i += 1;
        continue;
      }
      const id = m[2];
      if (registered.has(id)) {
        removed.push(id);
        blockDupCount += 1;
        i += 1;
        // 删除该注册行及其完整子树：缩进大于 id 行的所有后续行都属于本条目
        //（含 config 内嵌套 YAML 列表项），到缩进 ≤ id 行处停下。
        const indent = m[1].replace(/\t/g, '  ').length;
        while (i < block.lines.length) {
          const l = block.lines[i];
          const li = (l.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
          if (l.trim() === '' || li > indent) {
            i += 1;
            continue;
          }
          break;
        }
        continue;
      }
      registered.add(id);
      kept.push(block.lines[i]);
      i += 1;
    }
    if (blockDupCount > 0 && kept.length === 1) continue;
    out.push(...kept);
  }
  if (removed.length === 0) return { text, removed: [] };
  return { text: joinLines(ensurePatchArray(out), eol), removed };
}

/**
 * 移除「已迁移为 bundle 的插件」在 patch 层残留的旧注册条目（双登记自愈）。
 * 语义与历史实现逐字一致（详见历史 profile-patch-heal.js 注释）。
 * @param {string} text cordis.patch.yml 原文
 * @param {string[]} ids 需要从 patch 层移除的 loader id 集合
 * @returns {{ text: string, removed: string[] }}
 */
function dropBlocksByIds(text, ids) {
  const removal = new Set((ids || []).filter((i) => typeof i === 'string' && i));
  if (removal.size === 0) return { text, removed: [] };
  const eol = detectEol(text);
  const lines = splitLines(text);
  const blocks = topLevelBlocks(lines);
  if (blocks.length === 0) return { text, removed: [] };
  const removed = [];
  const out = [];
  if (blocks[0].begin > 0) out.push(...lines.slice(0, blocks[0].begin));
  for (const block of blocks) {
    const idRows = block.lines
      .map((line, idx) => ({ line, idx, m: ANY_ID_ROW_RE.exec(line) }))
      .filter((r) => r.m !== null)
      .map((r) => ({ ...r, id: r.m[2] }));
    const hitIds = idRows.filter((r) => removal.has(r.id)).map((r) => r.id);
    if (hitIds.length === 0) {
      out.push(...block.lines);
      continue;
    }
    if (!block.insert) {
      const bodyLines = block.lines.slice(1).filter((l) => l.trim() !== '');
      const nameOnly = bodyLines.length > 0 && bodyLines.every((l) => /^\s*name\s*:/.test(l));
      if (nameOnly) {
        removed.push(...hitIds);
        continue;
      }
      out.push(...block.lines);
      continue;
    }
    if (hitIds.length === idRows.length) {
      removed.push(...hitIds);
      continue;
    }
    const keep = block.lines.map((line) => ({ line, drop: false }));
    for (const r of idRows) {
      if (!removal.has(r.id)) continue;
      removed.push(r.id);
      const indent = (r.line.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
      keep[r.idx].drop = true;
      let j = r.idx + 1;
      while (j < block.lines.length) {
        const l = block.lines[j];
        const li = (l.match(/^\s*/) || [''])[0].replace(/\t/g, '  ').length;
        if (l.trim() === '' || li > indent) {
          keep[j].drop = true;
          j += 1;
          continue;
        }
        break;
      }
    }
    for (const k of keep) if (!k.drop) out.push(k.line);
  }
  if (removed.length === 0) return { text, removed: [] };
  return { text: joinLines(ensurePatchArray(out), eol), removed };
}

// ---------------------------------------------------------------------------
// 行级配置自愈（历史 patch-row-heal.js，唯一实现 + EOL 保持）
// ---------------------------------------------------------------------------

/** 把 config 对象序列化为 patch 行 YAML 行（baseIndent = 行内 `- id:` 缩进）。 */
function configLinesFor(config, baseIndent = 4) {
  const step = ' '.repeat(baseIndent + 2);
  const step2 = ' '.repeat(baseIndent + 4);
  let out = `${step}config:\n`;
  for (const [k, v] of Object.entries(config || {})) {
    out += `${step2}${k}: ${JSON.stringify(v)}\n`;
  }
  return out;
}

/**
 * 把行的 config 块缩进对齐到自身 `- id:` 行（config 须在 id 缩进 + 2，键在 + 4）。
 * 幂等；返回可能修改后的 patch。
 */
function normalizeRowConfigIndent(patch, id) {
  if (typeof patch !== 'string' || patch === '' || !id) return patch;
  const esc = escRegExp(String(id));
  const rowRe = new RegExp(`^([\\t ]*)- id: ${esc}\\b`);
  const eol = detectEol(patch);
  const lines = splitLines(patch);
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = rowRe.exec(lines[i]);
    if (!m) continue;
    const idIndent = m[1].replace(/\t/g, '  ').length;
    const wantConfig = ' '.repeat(idIndent + 2) + 'config:';
    for (let j = i + 1; j < lines.length; j++) {
      const cur = lines[j];
      const t = cur.trim();
      if (t === '' || /^#/.test(t)) continue;
      if (/^[\t ]*- id:/.test(cur) || t === 'insert:') break;
      const curIndent = (cur.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length;
      if (curIndent <= idIndent) break;
      if (!/^[\t ]*config:/.test(cur) || t !== 'config:') continue;
      if (cur !== wantConfig) {
        const diff = curIndent - (idIndent + 2);
        lines[j] = wantConfig;
        for (let k = j + 1; k < lines.length; k++) {
          const kl = lines[k];
          if (kl.trim() === '' || /^#/.test(kl)) continue;
          const ki = (kl.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length;
          if (ki <= idIndent + 2) break;
          lines[k] = ' '.repeat(ki - diff) + kl.trimStart();
        }
        changed = true;
      }
      break;
    }
  }
  return changed ? joinLines(lines, eol) : patch;
}

/** 确保每个 soul-md 行携带 config.path（幂等）。 */
function healSoulMdPatchRow(patch, config = { path: 'soul.md' }) {
  const healed = [];
  if (typeof patch !== 'string' || patch === '') return { patch, healed };
  const normalized = normalizeRowConfigIndent(patch, 'soul-md');
  if (normalized !== patch) healed.push('soul-md');
  patch = normalized;
  const rowRe = /(^[\t ]*- id: soul-md\b[^\n]*\n[\t ]*name: ['"]?[^'"\n]+['"]?\n)(?![\t ]*config:)/gm;
  const eol = detectEol(patch);
  let out = patch.replace(rowRe, (m) => m + configLinesFor(config, (m.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length).replace(/\n/g, eol));
  if (out !== patch) healed.push('soul-md');
  return { patch: out, healed };
}

/** 给已存在但缺 config 块的行补 config（dsh-pet 同族自愈，幂等）。 */
function healRowConfig(patch, id, config) {
  const healed = [];
  if (typeof patch !== 'string' || patch === '' || !id || !config) return { patch, healed };
  const normalized = normalizeRowConfigIndent(patch, id);
  if (normalized !== patch) healed.push(id);
  patch = normalized;
  const eol = detectEol(patch);
  const rowRe = new RegExp(
    `(^[\\t ]*- id: ${escRegExp(String(id))}\\b[^\\n]*\\n[\\t ]*name: ['"]?[^'"\\n]+['"]?\\n)(?![\\t ]*config:)`,
    'gm'
  );
  const out = patch.replace(rowRe, (m) => m + configLinesFor(config, (m.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length).replace(/\n/g, eol));
  if (out !== patch) healed.push(id);
  return { patch: out, healed };
}

// ---------------------------------------------------------------------------
// bundle 双登记去重（历史 patch-row-heal.js 下半段，id 级去重已接线）
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

/** 收集一个 bundle 包自身 cordis.patch.yml 声明的全部 loader id（缺失/损坏不贡献）。 */
function bundlePatchEntryIds(bundleDir) {
  const ids = new Set();
  if (!bundleDir) return ids;
  try {
    const pkgPath = path.join(bundleDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return ids;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const b = pkg && pkg.dsh && pkg.dsh.bundle;
    let patchRel = 'cordis.patch.yml';
    if (typeof b === 'string') patchRel = b;
    else if (b && typeof b.patch === 'string') patchRel = b.patch;
    const patch = fs.readFileSync(path.join(bundleDir, patchRel), 'utf8');
    for (const id of patchRowIds(patch)) ids.add(id);
  } catch { /* 包/补丁缺失或损坏 → 不贡献任何 id */ }
  return ids;
}

/** 全部 profile bundle 包声明 id 的并集（覆盖 git/fork/link 安装、包名与 overlay 行不一致）。 */
function collectBundleEntryIds(bundleNames, profileNodeModules) {
  const ids = new Set();
  for (const name of bundleNames || []) {
    const dir = name ? path.join(profileNodeModules, ...String(name).split('/')) : '';
    for (const id of bundlePatchEntryIds(dir)) ids.add(id);
  }
  return ids;
}

/**
 * 移除与 profile bundle 自身装配重复的 insert 块（双登记 → duplicate loader
 * entry id 崩溃）。name 级（历史）+ id 级（bundleEntryIds，本次接线）双重判定。
 * @returns {{ patch: string, removed: string[] }}
 */
function removeBundledRowDuplicates(patch, rowIds, bundleNames, bundleEntryIds) {
  const removed = [];
  if (typeof patch !== 'string' || patch === ''
    || (!bundleNames || !bundleNames.length) && (!bundleEntryIds || !bundleEntryIds.size)) {
    return { patch, removed };
  }
  const declaredIds = bundleEntryIds && bundleEntryIds.size ? bundleEntryIds : new Set();
  const nameTargets = new Set(Object.entries(rowIds || {})
    .filter(([, pkg]) => (bundleNames || []).includes(pkg))
    .map(([id]) => id));
  const isDup = (id) => (id !== null && declaredIds.has(id)) || (id !== null && nameTargets.has(id));
  const eol = detectEol(patch);
  const lines = splitLines(patch);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-\s*insert:/.test(line)) {
      let id = null;
      const mid = /^\s*-\s*id:\s*([A-Za-z0-9][A-Za-z0-9_.-]*)\s*$/.exec(lines[i + 1] || '');
      if (mid) id = mid[1];
      if (isDup(id)) {
        removed.push(id);
        let j = i + 1;
        while (j < lines.length && !/^-\s*insert:/.test(lines[j]) && /^#/.test(lines[j]) === false && /^\s+\S/.test(lines[j])) j++;
        i = j - 1;
        continue;
      }
    }
    out.push(line);
  }
  let text = joinLines(out, eol).replace(/\n{3,}/g, eol + eol);
  if (!text.endsWith('\n')) text += '\n';
  return { patch: text, removed };
}

// ---------------------------------------------------------------------------
// 语法自愈 / 标记提取 / 默认禁用 / 旧市场清理（历史 companion-profile +
// plugin-sync 的补丁段，唯一实现）
// ---------------------------------------------------------------------------

/** 移除与列表混存的顶层 []（bare array 形态自愈）。 */
function healPatchListSyntax(text) {
  const bareArray = /^\s*\[\]\s*$/m.test(text);
  const hasEntries = /^\s*-\s+(?:id|insert)\s*:/m.test(text);
  if (bareArray && hasEntries) {
    return { text: text.replace(/^\s*\[\]\s*$\n?/m, ''), healed: true };
  }
  return { text, healed: false };
}

/** 从 patch 文本提取「卸载标记」id（纯文本扫描，YAML 损坏时仍可用）。
 *  `removed: true` 值大小写不敏感（issue #87 手写 `True` 历史契约），
 *  与 parsePatchRows 的解析口径一致。 */
function removedPluginIdsFromPatch(patch) {
  const ids = new Set();
  const text = String(patch || '');
  const entryRe = /(?:^|\n)([ \t]{0,2})- id:[ \t]*([A-Za-z0-9][A-Za-z0-9_.-]*)([\s\S]*?)(?=(?:\n[ \t]{0,2}- id:)|(?:\n[ \t]{0,2}- insert:)|\s*$)/g;
  let m;
  while ((m = entryRe.exec(text)) !== null) {
    if (/(?:^|\n)[ \t]{0,2}removed[ \t]*:[ \t]*true\b/i.test(m[3])) ids.add(m[2]);
  }
  return ids;
}

/** 移除旧插件市场（@deepseek-ai/dsh-plugin-marketplace）的 insert 条目（幂等）。 */
function removeLegacyMarketplacePatchLines(patch) {
  const before = patch;
  const text = patch.replace(/^\s*-\s*insert:\s*$\n^\s*-\s*id:\s*plugin-marketplace\s*$\n^\s*name:\s*['"]@deepseek-ai\/dsh-plugin-marketplace['"]\s*$\n?/gm, '');
  return { patch: text, changed: text !== before };
}

/**
 * 撤销历史自动写入的 compaction-basic 禁用块（billion-context-dsh 默认关闭后，
 * 内核默认压缩需恢复）。仅精确删除本模块 ACP_DISABLE_BLOCK 写入的那一段（含其
 * 专属注释行），用户手写的 compaction-basic 条目一律不动。幂等：块不在位则
 * 零改写。兼容 [] 形态（无前导换行的 trim 形态）。
 * @param {string} patch cordis.patch.yml 原文
 * @returns {{ patch: string, changed: boolean }}
 */
function removeAcpBasicDisableBlock(patch) {
  if (typeof patch !== 'string' || patch === '') return { patch, changed: false };
  const original = patch;
  const normalized = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  let out = normalized;
  // 常规追加形态：块以前导换行起，整段删除后留一个换行。
  out = out.split(ACP_DISABLE_BLOCK).join('\n');
  // [] / 空文件形态：ensureDisabledPatchEntry 写入的是 block.trim()（无前导换行）。
  const trimmed = ACP_DISABLE_BLOCK.trim();
  if (out.includes(trimmed)) out = out.split(trimmed).join('');
  // 连续空行收敛，保持文件整洁。
  out = out.replace(/\n{3,}/g, '\n\n');
  if (out === normalized) return { patch: original, changed: false };
  return { patch: preserveEol(original, out), changed: true };
}


/**
 * 幂等写入默认禁用条目（compaction-basic / harness-pet）。
 * @returns {{ patch: string, changed: boolean }}
 */
function ensureDisabledPatchEntry(patch, idPattern, block) {
  if (idPattern.test('\n' + patch)) return { patch, changed: false };
  if (/^\s*\[\]\s*$/m.test(patch)) return { patch: patch.replace(/\[\]/m, block.trim()), changed: true };
  if (patch.trim() === '') return { patch: PATCH_HEADER + block.trim(), changed: true };
  return { patch: patch.replace(/\s*$/, '\n') + block, changed: true };
}

/**
 * 判定 patch 标量值是否需要 YAML 引号包裹（#155 根因二 / #153 第 2 条同源）：
 * `@deepseek-ai/...` 裸包名是 YAML 的 indicator 起始（`@`），js-yaml 对
 * `- id: @deepseek-ai/x` 直接报「bad indentation of a mapping entry」，
 * 内核装配该 overlay 时解析失败 → 启动即崩（0.5.3 崩溃环的第二根因）。
 * 安全裸标量子集 = 字母/数字/下划线/点/连字符（loader id 字符集超集）：
 * 健康文件（全为这类 id）零改写；含 `@`/`/`/特殊字符的值才补引号。
 */
function needsYamlScalarQuote(value) {
  if (typeof value !== 'string' || value === '') return false;
  if (/^['"]/.test(value)) return false; // 已引号
  // YAML 块标量指示符（`|` / `>` 及其裁剪/缩进变体）不是标量值：
  // 引号化会改变语义（块标量 → 字面串），绝不误伤。
  if (/^[|>][-+0-9]*$/.test(value)) return false;
  // YAML flow 集合指示符（`[` `{` 起始，及闭合 `]` `}` `,`）不是标量：
  // `id: [` 是损坏的 flow 序列——引号化成 `id: '['` 会把它从「解析失败」
  // 变成「合法但语义错的标量」，掩盖 healProfilePatch/healHomePatch 的
  // 「解析失败 → 备份 .broken- → 重置」恢复路径（#155 修复的误伤回归）。
  // 这类值必须保持原样，让 yaml.load 抛错走备份恢复，而非被引号「救活」。
  if (/^[[\]{},]/.test(value)) return false;
  return !/^[A-Za-z0-9_.-]+$/.test(value);
}

/**
 * 按需 YAML 引号化：#155 根因二——`@deepseek-ai/...` 裸包名是 YAML indicator
 * 起始（js-yaml「bad indentation」），内核装配即崩；安全 id（字母/数字/
 * 下划线/点/连字符，loader id 字符集超集）保持裸标量（健康文件零改写）。
 * 已带引号的值原样返回。single-quote 转义（yamlQuote 语义：单引号加倍）。
 */
function yamlQuoteIfNeeded(value) {
  if (!needsYamlScalarQuote(value)) return String(value);
  return yamlQuote(value);
}

/**
 * 把 patch/overlay 文本中的 `id:` / `name:` 裸标量按 YAML 安全规则补引号
 * （#155 根因二幂等修复）。纯文本变换：只改需要引号的行；已引号行跳过；
 * 健康文件零改写（零写入幂等）；EOL 保持。
 * @param {string} text cordis.patch.yml / *.overlay.yml 原文
 * @returns {{ text: string, changed: boolean }}
 */
function quotePatchScalarValues(text) {
  if (typeof text !== 'string' || text === '') return { text, changed: false };
  const original = text;
  const normalized = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  const out = splitLines(normalized).map((line) => {
    // 值 = 首个非空 token（\S+，可含 @ 与 /）+ 可选行尾注释（# 前须有空白）。
    const m = /^([ \t]*(?:-?[ \t]*)?)(id|name)[ \t]*:[ \t]*(\S+)((\s+#.*)?)$/.exec(line);
    if (!m) return line;
    if (!needsYamlScalarQuote(m[3])) return line;
    return m[1] + m[2] + ': ' + yamlQuote(m[3]) + (m[4] || '');
  });
  const joined = joinLines(out, '\n');
  if (joined === normalized) return { text: original, changed: false };
  return { text: preserveEol(original, joined), changed: true };
}

/**
 * 把非 bundle 配套插件注册进 profile patch 层（幂等，语义与历史 companion-profile
 * 逐字一致；idNameRe 支持三种引号形态——修复双引号/无引号 name 改名漏修）。
 * @returns {{ patch: string, changed: boolean, dropped: string[], updated: string[], added: string[] }}
 */
function registerCompanionPatchEntries(patch, opts) {
  const { plugins, bundleNames, missingNames, removedIds, onDrop, onEntry } = opts;
  // EOL 保持：内部统一 LF，输出按原 EOL 还原。
  const original = String(patch);
  const text0 = original.includes('\r\n') ? original.replace(/\r\n/g, '\n') : original;
  let text = text0;
  let changed = false;
  const dropped = [];
  const updated = [];
  const added = [];

  const bundleIds = new Set();
  for (const p of plugins) {
    if (bundleNames.has(p.name)) bundleIds.add(p.id);
  }
  if (bundleIds.size > 0 && text.includes('- id:')) {
    const migration = dropBlocksByIds(text, [...bundleIds]);
    if (migration.removed.length > 0) {
      text = migration.text;
      changed = true;
      const ids = [...new Set(migration.removed)];
      dropped.push(...ids);
      if (onDrop) onDrop('已把 bundle 插件移出 profile patch（避免双登记）: ' + ids.join(', '));
    }
  }
  if (missingNames.size > 0 && text.includes('- id:')) {
    const missingIds = plugins.filter((p) => missingNames.has(p.name)).map((p) => p.id);
    if (missingIds.length > 0) {
      const drop = dropBlocksByIds(text, missingIds);
      if (drop.removed.length > 0) {
        text = drop.text;
        changed = true;
        dropped.push(...drop.removed);
        if (onDrop) onDrop('已把源缺失插件移出 profile patch（避免注册不存在的包）: ' + [...new Set(drop.removed)].join(', '));
      }
    }
  }
  for (const p of plugins) {
    if (removedIds && removedIds.has(p.id)) continue;
    if (bundleNames.has(p.name)) continue;
    if (missingNames.has(p.name)) continue;
    const reId = escRegExp(p.id);
    // 条目行锚点（issue #116）：顶层条目缩进 0-2、insert 内层条目缩进 4，且必须
    // 带列表符 `- `。历史实现是「任意缩进 + 可省略 `-`」的宽匹配——补丁层里任何
    // 深度的 `id: <配套id>` 映射键（用户/官方插件的 config 块）或嵌套列表项都会
    // 被误判为「已注册」而静默跳过：文件照常复制但永不登记，客户端因此看不到
    // 任何预装插件（先有官方 dsh 使用史的 profile 更可能带这类条目）。
    const entryRow = '(?:^|\\n)(?:[ \\t]{0,2}|[ \\t]{4})- id:\\s*';
    // 引号三形态：'x' / "x" / x。分组：1=前缀、2=引号、3=名（替换时 $2 复用）。
    const idNameRe = new RegExp('(' + entryRow + reId + '(?![A-Za-z0-9_.-])[^\\n]*\\n[ \\t]*name:\\s*)([\'"]?)([^\'"\\n]*)\\2');
    const m = text.match(idNameRe);
    if (m) {
      if (m[3] !== p.name) {
        text = text.replace(idNameRe, '$1$2' + p.name + '$2');
        changed = true;
        updated.push(p.id);
        if (onEntry) onEntry('已更新补丁条目 ' + p.id + ': ' + m[3] + ' → ' + p.name);
      }
      continue;
    }
    if (new RegExp(entryRow + reId + '(?![A-Za-z0-9_.-])').test(text)) {
      continue;
    }
    const block = `- insert:\n    - id: ${p.id}\n      name: '${p.name}'\n`;
    if (/^\s*\[\]\s*$/m.test(text)) text = text.replace(/\[\]/m, block);
    else if (text.trim() === '') text = PATCH_HEADER + block;
    else text = text.replace(/\s*$/, '\n') + block;
    changed = true;
    added.push(p.id);
    if (onEntry) onEntry('已添加补丁条目 ' + p.id + ' → ' + p.name);
  }
  return { patch: text === text0 ? original : preserveEol(original, text), changed, dropped, updated, added };
}

// ---------------------------------------------------------------------------
// 无效条目体检 + 一键清理（插件管理页横幅；本段含受控落盘，是「纯文本函数」
// 契约的显式例外：扫描只读，删除仅在用户显式点击后执行，且必先备份）
// ---------------------------------------------------------------------------

// npm 包名形态（与 sidecar cli.js packageDir 同口径）：形态不认识的 name
// （相对路径/URL/变量等）一律跳过判定——宁漏勿误。
const PKG_NAME_RE = /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/i;

/**
 * 包目录是否可在任一候选根解析到（存在 package.json 才算在位）：
 * 每个根先试「全名路径」（node_modules 语义），scope 包再试「去 scope 短名」
 * （assets/plugins 等非 node_modules 根按短名落盘的兜底面）。
 */
function packageResolvable(name, roots) {
  const rel = String(name).split('/').filter(Boolean);
  if (rel.length === 0) return false;
  for (const root of roots || []) {
    if (!root || typeof root !== 'string') continue;
    try {
      if (fs.existsSync(path.join(root, ...rel, 'package.json'))) return true;
    } catch { /* 不可读按缺席处理 */ }
    if (rel.length > 1 && rel[0].startsWith('@')) {
      try {
        if (fs.existsSync(path.join(root, rel[rel.length - 1], 'package.json'))) return true;
      } catch { /* 同上 */ }
    }
  }
  return false;
}

/** 备份文件时间戳（本地时间 YYYYMMDD-HHmmss，与既有 .bak-<ts> 家族同风格）。 */
function deadBackupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/**
 * 无效条目体检（只读，插件管理页横幅数据源）：
 *   a) 死条目——条目带合法 npm 形态的 name: 且该包在全部候选根都解析不到
 *      （removed: true 墓碑条目跳过：卸载链靠它支持「恢复」，绝不判死）；
 *   b) 疑似陈旧——disabled: true 的 id 不在 collect() 全量插件 id 集合
 *      （opts.knownIds 缺省则整条规则跳过）；只透出，不进一键清理。
 * patch 文件缺失/不可读按「无死条目」降级（体检不得把管理页弄挂）。
 * @param {string} patchFile cordis.patch.yml 绝对路径
 * @param {{ searchRoots?: string[], knownIds?: Set<string>|string[] }} [opts]
 * @returns {{ ok: boolean, patchExists: boolean, dead: Array<{id:string,name:string,disabled:boolean}>, stale: Array<{id:string,name:string,disabled:boolean}> }}
 */
function listDeadEntries(patchFile, opts) {
  const dead = [];
  const stale = [];
  let text = '';
  try { text = fs.readFileSync(patchFile, 'utf8'); } catch { return { ok: true, patchExists: false, dead, stale }; }
  const searchRoots = ((opts && Array.isArray(opts.searchRoots)) ? opts.searchRoots : [])
    .filter((r) => typeof r === 'string' && r);
  let known = null;
  if (opts && opts.knownIds) known = opts.knownIds instanceof Set ? opts.knownIds : new Set(opts.knownIds);
  let rows;
  try { rows = parsePatchRows(text); } catch { rows = { top: [], inserts: [] }; }
  const reported = new Set();
  for (const row of [...(rows.top || []), ...(rows.inserts || [])]) {
    if (!row || typeof row.id !== 'string' || !row.id || row.removed) continue;
    if (reported.has(row.id)) continue; // 顶层/insert 双登记只报一次
    reported.add(row.id);
    const hasName = typeof row.name === 'string' && row.name !== '';
    // a) 包名解析不到（全根）→ 死条目（进一键清理集）
    if (hasName && PKG_NAME_RE.test(row.name) && !packageResolvable(row.name, searchRoots)) {
      dead.push({ id: row.id, name: row.name, disabled: row.disabled === true });
      continue;
    }
    // b) 陈旧禁用（id 不在 collect 全量集合）→ 只透出，不自动清理
    if (known && row.disabled === true && !known.has(row.id)) {
      stale.push({ id: row.id, name: hasName ? row.name : '', disabled: true });
    }
  }
  return { ok: true, patchExists: true, dead, stale };
}

/**
 * 一键清理：删除指定 id 的完整条目子树（顶层 / insert 内层均可，含 name/
 * disabled/config 与更深层级），并清掉本模块写入的「关闭/卸载」标记注释。
 * 落盘路径：copyFile 备份为 `cordis.patch.yml.bak-dead-<时间戳>` →
 * writeFileAtomic（fs-atomic 唯一实现：临时文件 + rename 原子替换，含
 * Windows EPERM 重试）。幂等：id 已不在文件中 → 零写入（不备份不改文件）。
 * 调用方（cli.js / 页面）必须保证 ids 来自 listDeadEntries 的 dead 集——
 * 本函数绝不自行判定、绝不自动删除。
 * @param {string} patchFile cordis.patch.yml 绝对路径
 * @param {string[]} ids 待清理条目 id
 * @returns {{ changed: boolean, removed: string[], backup: string|null, error?: string }}
 */
function removeDeadEntriesById(patchFile, ids) {
  const removal = new Set((Array.isArray(ids) ? ids : [ids])
    .filter((i) => typeof i === 'string' && i && LOADER_ID_RE.test(i)));
  if (removal.size === 0) return { changed: false, removed: [], backup: null };
  let text;
  try { text = fs.readFileSync(patchFile, 'utf8'); } catch (err) {
    return { changed: false, removed: [], backup: null, error: '读取补丁失败: ' + String((err && err.message) || err) };
  }
  // 行级删除：EOL 保持（与 toggle/setRemoved 同契约，内部统一 LF 手术）。
  const eol = detectEol(text);
  const lines = splitLines(text);
  const out = [];
  const removed = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = ANY_ID_ROW_RE.exec(lines[i]);
    if (m && removal.has(m[2])) {
      if (!removed.includes(m[2])) removed.push(m[2]);
      const indent = m[1].replace(/\t/g, '  ').length;
      i += 1;
      // 连带删除缩进更深的子树行（name/disabled/config 及嵌套列表）与块内空行，
      // 到缩进 ≤ id 行处停下（与 dedupePatchEntries 的子树口径一致）。
      while (i < lines.length) {
        const l = lines[i];
        const li = (l.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '  ').length;
        if (l.trim() === '' || li > indent) { i += 1; continue; }
        break;
      }
      i -= 1; // 抵消外层 for 的自增（当前行是下一个未处理行）
      continue;
    }
    out.push(lines[i]);
  }
  if (removed.length === 0) return { changed: false, removed: [], backup: null };
  // 条目已删：清掉本模块的标记注释（反复开关/卸载残留，不得随清理堆积）。
  let joined = joinLines(out, eol);
  for (const id of removed) {
    joined = joined.replace(markerCommentRe(id), '').replace(uninstallCommentRe(id), '');
  }
  // 被掏空的孤立 `- insert:` 空块清理（与开关/卸载手术同款）。尾部先补换行：
  // 清空后的块可能以 `- insert:` 收尾（无换行），原正则以 `\n` 收口会漏掉。
  if (!joined.endsWith('\n')) joined += '\n';
  joined = dropEmptyInsertBlocks(joined);
  // 全部条目被清空时补 `[]`，保证仍是合法顶层数组（复用既有自愈）。
  let outText = joinLines(ensurePatchArray(splitLines(joined)), eol);
  outText = outText.replace(/\n{3,}/g, eol + eol); // 删除后残留的连续空行收敛
  const stamp = deadBackupStamp();
  const backup = patchFile + '.bak-dead-' + stamp;
  try {
    fs.copyFileSync(patchFile, backup);
    writeFileAtomic(patchFile, outText);
  } catch (err) {
    return { changed: false, removed: [], backup: null, error: '清理写入失败: ' + String((err && err.message) || err) };
  }
  return { changed: true, removed, backup };
}

module.exports = {
  PATCH_HEADER,
  ACP_DISABLE_BLOCK,
  ACP_SELF_DISABLE_BLOCK,
  PET_DISABLE_BLOCK,
  LOADER_ID_RE,
  parsePatchRows,
  patchRowIds,
  togglePluginInPatch,
  setPluginRemoved,
  dedupePatchEntries,
  dropBlocksByIds,
  topLevelBlocks,
  ensurePatchArray,
  configLinesFor,
  normalizeRowConfigIndent,
  healSoulMdPatchRow,
  healRowConfig,
  bundlePatchEntryIds,
  collectBundleEntryIds,
  removeBundledRowDuplicates,
  healPatchListSyntax,
  removedPluginIdsFromPatch,
  removeLegacyMarketplacePatchLines,
  ensureDisabledPatchEntry,
  removeAcpBasicDisableBlock,
  needsYamlScalarQuote,
  quotePatchScalarValues,
  yamlQuoteIfNeeded,
  // #155 根因二：sidecar safe-overlay 复用 YAML 单引号安全化（@ 开头包名）。
  yamlQuote,
  registerCompanionPatchEntries,
  // 无效条目体检 + 一键清理（插件管理页横幅；历史导入路径 scripts/plugin-manager-patch.js 一并再导出）。
  listDeadEntries,
  removeDeadEntriesById,
};
