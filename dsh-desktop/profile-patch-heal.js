'use strict';

// profile cordis.patch.yml 的「重复 loader 条目」识别与自愈核心（纯函数、无
// electron 依赖，便于 node:test 单测）。
//
// 背景（issue #17）：旧版本（如 v0.3.4）的插件安装路径会向 cordis.patch.yml
// 写入与桌面端配套插件相同的 `- insert: - id: balance` 条目，同一 id 被
// 注册两次。cordis loader 装配时抛
//   duplicate loader entry id: balance
//   或 failed to apply loader entry <hash> (@scope/pkg): list slot ... already
//   has an entry with id ... at priority 0
// 且该存量状态无法自愈，用户「进不来主界面」。
//
// 语义边界（依据 dsh-app-boot 的 applyEntryPatches 与 cordis.patch.yml 文件头
// 注释）：patch 顶层数组包含三类条目——insert 注册列表、id 定向 config 覆盖、
// disabled 禁用。只有 insert 列表内的行是「注册」；config/disabled 覆盖条目
// 不注册任何东西，`duplicate loader entry id` 只可能来自注册行。因此自愈
// 只允许删「注册行」，绝不触碰 config/disabled 覆盖条目（用户配置数据）。
//
// 这里提供：
//   · dedupePatchEntries —— 注册行级去重：同一 id 的第二次及以后注册行
//     （连同其同缩进兄弟行，如 name/config）被移除，保留首次注册；insert
//     块内部分重复时只删重复行、保留新注册；config/disabled/定向 insert
//     块永不改动；无重复时零写入；
//   · dropBlocksByIds —— bundle 迁移自愈：移除命中移除集的注册行（insert
//     块内行级删除、整块命中时整块删除）；顶层的 name-only 直注册行（旧版
//     遗留、无 config/disabled）整块移除；config/disabled 覆盖条目原样保留；
//   · parseFailedLoaderIds —— 识别 loader 失败日志中的三种 id 形态
//     （旧 hash 形态 / duplicate loader entry id: X 形态 / 括号包名形态）；
//   · mapPackagesToPatchIds —— 把括号中的包名映射回 patch 条目 id
//     （供安全启动 overlay 兜底禁用）。

const idRowRe = /^(\s*)-\s*id:\s*([A-Za-z0-9_-]+)/;

/**
 * 把文本切分为顶层条目块。顶层条目 = 行首（列 0）以 `- ` 开头的行，
 * 其后到下一个顶层条目之前的所有行属于该块。块的 insert 属性表示
 * 块首行为 `- insert:`（注册列表块）；其余（`- id: X` 直条目等）为
 * 非注册块。
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

/**
 * 输出兜底：若修复后的文本只剩注释/空行（没有任何顶层条目），补一个空
 * 数组 `[]`，保证文件仍是合法的顶层数组（YAML 可解析为 []），避免被
 * 下次启动误判为「解析失败」而重置。
 * @param {string[]} lines 修复后的行集合
 * @returns {string[]} 补兜底后的行集合
 */
function ensurePatchArray(lines) {
  if (!lines.some((l) => /^-(\s|$)/.test(l))) lines.push('[]');
  return lines;
}

/**
 * 移除「重复注册」的 loader 条目（issue #17 存量自愈）。
 * 只针对 insert 注册块做行级去重：同一 id 的第二次及以后注册行（连同其
 * 同缩进兄弟行）被移除，保留首次注册；insert 块内部分重复时只删重复行、
 * 保留新注册。config 覆盖、disabled 禁用、定向 insert（`- id: X` +
 * `insert:`）等非注册条目永不改动。
 * @param {string} text cordis.patch.yml 原文
 * @returns {{ text: string, removed: string[] }} 修复后的文本与被移除的重复 id；
 *   无重复时返回原文本与空数组（零写入）。
 */
function dedupePatchEntries(text) {
  const lines = text.split(/\r?\n/);
  const blocks = topLevelBlocks(lines);
  const registered = new Set();
  const removed = [];
  const out = [];
  if (blocks.length > 0 && blocks[0].begin > 0) out.push(...lines.slice(0, blocks[0].begin));
  for (const block of blocks) {
    if (!block.insert) {
      // 非注册块（config 覆盖 / disabled / 定向 insert / 无 id 条目）：
      // 绝不删除。
      out.push(...block.lines);
      continue;
    }
    // insert 注册块：行级去重，只删「重复注册」行及其同缩进兄弟行。
    const kept = [block.lines[0]];
    let blockDupCount = 0;
    let i = 1;
    while (i < block.lines.length) {
      const m = idRowRe.exec(block.lines[i]);
      if (!m) {
        // 非 id 行（name 等兄弟行、嵌套列表值、空行）：跟随其前一行保留。
        kept.push(block.lines[i]);
        i += 1;
        continue;
      }
      const id = m[2];
      if (registered.has(id)) {
        removed.push(id);
        blockDupCount += 1;
        i += 1;
        const indent = m[1].length;
        while (i < block.lines.length) {
          const l = block.lines[i];
          const li = /^\s*/.exec(l)[0].length;
          if (l.trim() === '' || (li > indent && !/^\s*-\s+/.test(l))) {
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
    // 本块确有重复注册行被删且只剩块头（`- insert:`）→ 丢弃空块；
    // 无重复的块（含 `- insert: []`）原样保留（保证零写入）。
    if (blockDupCount > 0 && kept.length === 1) continue;
    out.push(...kept);
  }
  if (removed.length === 0) return { text, removed: [] };
  return { text: ensurePatchArray(out).join('\n'), removed };
}

/**
 * 移除「已迁移为 bundle 的插件」在 patch 层残留的旧注册条目（双登记自愈）。
 * 旧版本客户端把某些配套插件当非 bundle 写入 cordis.patch.yml（insert 块）；
 * 插件升级为 bundle（经 dsh.profile.bundles 装配）后，残留注册行会让
 * cordis loader 抛 `duplicate loader entry id: X` 且整树加载失败（更新后
 * 首次启动崩溃的根因）。
 *
 * 处理规则：
 *   · insert 注册块声明的 id 全部命中移除集 → 整块删除；
 *   · insert 注册块内仅部分 id 命中 → 只删除命中的「- id: X」行及其同缩进
 *     兄弟行（name 等），其余注册原样保留 —— 绝不整块误删；
 *   · 顶层的纯注册直条目（除 id 行外只有 name 行，旧版遗留）→ 整块移除；
 *   · config 覆盖 / disabled 禁用 / 携带任意自定义键的覆盖条目是用户配置，
 *     绝不删除；
 *   · 其余内容（注释/空行/非命中条目）原样保留。
 * 无命中时返回原文本（零写入）。
 * @param {string} text cordis.patch.yml 原文
 * @param {string[]} ids 需要从 patch 层移除的 loader id 集合
 * @returns {{ text: string, removed: string[] }} 修复后的文本与被移除的 id
 */
function dropBlocksByIds(text, ids) {
  const removal = new Set((ids || []).filter((i) => typeof i === 'string' && i));
  if (removal.size === 0) return { text, removed: [] };
  const lines = text.split(/\r?\n/);
  const blocks = topLevelBlocks(lines);
  if (blocks.length === 0) return { text, removed: [] };
  const removed = [];
  const out = [];
  if (blocks[0].begin > 0) out.push(...lines.slice(0, blocks[0].begin));
  for (const block of blocks) {
    const idRows = block.lines
      .map((line, idx) => ({ line, idx, m: idRowRe.exec(line) }))
      .filter((r) => r.m !== null)
      .map((r) => ({ ...r, id: r.m[2] }));
    const hitIds = idRows.filter((r) => removal.has(r.id)).map((r) => r.id);
    if (hitIds.length === 0) {
      out.push(...block.lines);
      continue;
    }
    if (!block.insert) {
      // 非 insert 块：仅当是「旧版遗留的纯注册直条目」——除 id 行外只有
      // name 行（无 config/disabled/insert 等任何其它键）——才允许整块
      // 移除；其余形态（config 覆盖、disabled 禁用、定向 insert、携带任意
      // 自定义键的覆盖条目）都是用户配置，绝不删除。
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
      // 全部命中：整块删除。
      removed.push(...hitIds);
      continue;
    }
    // 部分命中：行级删除命中的「- id: X」注册行及其同缩进兄弟行（name 等），
    // 保留块内其余注册。兄弟行判定：缩进大于 id 行、且不以「- 」开头。
    const keep = block.lines.map((line) => ({ line, drop: false }));
    for (const r of idRows) {
      if (!removal.has(r.id)) continue;
      removed.push(r.id);
      const indent = /^\s*/.exec(r.line)[0].length;
      keep[r.idx].drop = true;
      let j = r.idx + 1;
      while (j < block.lines.length) {
        const l = block.lines[j];
        const li = /^\s*/.exec(l)[0].length;
        if (l.trim() === '' || (li > indent && !/^\s*-\s+/.test(l))) {
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
  return { text: ensurePatchArray(out).join('\n'), removed };
}

/**
 * 从 dsh-web.log 尾部识别 loader 失败条目 id。覆盖三种形态：
 *   1. failed to apply loader entry <hash> (@scope/pkg): ...（旧形态，hash 是
 *      条目实例 id，对 overlay 无用但保留兼容）；
 *   2. duplicate loader entry id: X（cordis-plugin-loader 的重复注册 TypeError）；
 *   3. 括号中的包名 @scope/pkg（交由 mapPackagesToPatchIds 映射回 patch id）。
 * @param {string} text 日志文本
 * @returns {string[]} 去重后的 id/包名 token 列表
 */
function parseFailedLoaderIds(text) {
  const ids = new Set();
  const hashRe = /failed to apply loader entry\s+([A-Za-z0-9_-]+)\s*\(/g;
  let m;
  while ((m = hashRe.exec(text)) !== null) {
    if (m[1] !== 'include') ids.add(m[1]);
  }
  const dupRe = /duplicate loader entry id:\s*([A-Za-z0-9_-]+)/g;
  while ((m = dupRe.exec(text)) !== null) ids.add(m[1]);
  const pkgRe = /failed to apply loader entry[\s\S]{0,120}?\((@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\)/g;
  while ((m = pkgRe.exec(text)) !== null) ids.add(m[1]);
  return [...ids];
}

/**
 * 把 loader 日志中的包名（@scope/pkg）映射回 cordis.patch.yml 条目 id。
 * 按「- id: X 之后紧邻的 name: '包名'」扫描；一个包名可能对应多个条目
 * （重复注册场景），全部返回供 overlay 一并禁用。
 * @param {string} patchText cordis.patch.yml 原文
 * @param {string[]} packages 包名列表（可含 @scope/）
 * @returns {string[]} 匹配到的 patch 条目 id
 */
function mapPackagesToPatchIds(patchText, packages) {
  const wanted = new Set((packages || []).filter((p) => typeof p === 'string' && p));
  if (wanted.size === 0) return [];
  const ids = [];
  const entryRe = /(?:^|\n)\s*-\s*id:\s*([A-Za-z0-9_-]+)([\s\S]*?)(?=(?:\n\s*-\s*id:)|\n\s*-\s+(?:insert|id)|\s*$)/g;
  let m;
  while ((m = entryRe.exec(patchText)) !== null) {
    const id = m[1];
    const body = m[2];
    const nameRe = /(?:^|\n)\s*name:\s*['"]?(@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)['"]?/g;
    let nm;
    while ((nm = nameRe.exec(body)) !== null) {
      if (wanted.has(nm[1])) ids.push(id);
    }
  }
  return ids;
}

module.exports = { dedupePatchEntries, dropBlocksByIds, parseFailedLoaderIds, mapPackagesToPatchIds };
