// 知识中心 surface styles, kept as a string so the client bundle has no CSS
// build pipeline to depend on. Injected once at runtime by KnowledgeTree.tsx.
//
// Layout（对标 Qoder Quest 知识中心的三段式）：
//   panel = header（顶栏）+ layout（rail 左导航 280px ｜ main 右内容区）。
//   面板整体精确覆盖中间对话列（由 KnowledgeTree.tsx 的几何 effect 量尺定位；
//   CSS 默认全幅覆盖作为兜底）。
//
// Colors: every value uses dsh theme aliases (--dsw-alias-* / --dsw-specific-*
// / --dsw-static-*) instead of hardcoded hexes, so the panel automatically
// matches the harness UI in both light and dark themes.

export const CARDian_CSS = `
/* ============ 基础：触发钮 ============ */
.cardian-kt-trigger {
  box-sizing: border-box; cursor: pointer;
  width: calc(100% + 8px); height: 34px;
  color: var(--dsw-alias-label-primary); background: transparent; border: none; border-radius: 12px;
  flex: none; align-items: center; gap: 8px; margin: 4px -4px; padding: 6px 2px 6px 10px;
  font-family: inherit; font-size: 14px; line-height: 22px; display: flex; overflow: hidden;
  transition: background .12s, color .12s; outline: none;
}
.cardian-kt-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-trigger[data-on='1'] {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%, transparent);
}
.cardian-kt-trigger[data-rail='1'] {
  border-radius: 50%; justify-content: center; gap: 0;
  width: 36px; height: 36px; margin: 8px 0 10px; padding: 0;
}
.cardian-kt-trigger-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ============ 面板骨架 ============ */
.cardian-kt-panel {
  position: absolute; top: 0; bottom: 0; left: 0; right: 0;
  z-index: 21; pointer-events: auto;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px;
}
.kt-icon { display: block; flex: none; }
.cardian-kt-flex { flex: 1; }

/* ---- 顶栏 ---- */
/* padding-right 比 padding-left 大 36px：面板右缘与宿主右侧栏/窗口控件切换钮
   重合，右上角操作钮组（新建/刷新/关闭）整体左移，避免被宿主浮动按钮遮挡。 */
.cardian-kt-header {
  display: flex; align-items: center; gap: 10px; flex: none;
  height: 54px; padding: 0 40px 0 16px; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cardian-kt-logo {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 9px; flex: none;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
}
.cardian-kt-title { font-weight: 650; font-size: 15px; white-space: nowrap; }
.cardian-kt-vault {
  font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 99px; padding: 2px 10px;
}

/* ---- 错误横幅 ---- */
.cardian-kt-banner {
  flex: none; margin: 10px 16px 0; padding: 9px 12px; display: flex; gap: 8px;
  align-items: flex-start; border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);
  color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5;
}
.cardian-kt-banner-text { flex: 1; word-break: break-word; }
.cardian-kt-banner-close {
  flex: none; border: none; background: transparent; color: inherit;
  cursor: pointer; padding: 2px; display: flex;
}

/* ============ 双栏布局 ============ */
.cardian-kt-layout { flex: 1; display: flex; min-height: 0; }

/* ---- 左栏 ---- */
.cardian-kt-rail {
  width: 280px; flex: none; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 4%, var(--dsw-alias-bg-base));
}
.cardian-kt-searchwrap {
  flex: none; display: flex; align-items: center; gap: 7px; margin: 12px 12px 8px;
  padding: 0 10px; height: 32px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-tertiary); transition: border-color .12s;
}
.cardian-kt-searchwrap:focus-within { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-search {
  flex: 1; min-width: 0; border: none; background: transparent; color: inherit;
  font-size: 12.5px; outline: none; font-family: inherit; padding: 0;
}
.cardian-kt-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.cardian-kt-search-clear {
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; display: flex; padding: 2px;
}
.cardian-kt-search-clear:hover { color: var(--dsw-alias-label-primary); }

.cardian-kt-nav { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 0 8px; }
.cardian-kt-nav-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 9px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
  font-family: inherit; font-size: 13px; text-align: left;
  transition: background .12s, color .12s;
}
.cardian-kt-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-nav-item--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); font-weight: 600;
}
.cardian-kt-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cardian-kt-nav-count {
  flex: none; font-size: 10.5px; font-weight: 500; min-width: 20px; text-align: center;
  color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 99px; padding: 1px 7px;
}
.cardian-kt-nav-item--active .cardian-kt-nav-count {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 18%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}

.cardian-kt-rail-tree {
  flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 8px;
}
.cardian-kt-hint { padding: 14px 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); text-align: center; line-height: 1.6; }

.cardian-kt-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 2px 8px; }
.cardian-kt-chip-f {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 11px; border-radius: 99px;
  padding: 2px 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: inherit; transition: color .12s, border-color .12s, background .12s;
}
.cardian-kt-chip-f:hover { color: var(--dsw-alias-label-primary); }
.cardian-kt-chip-f--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.cardian-kt-chip-n { opacity: 0.65; margin-left: 3px; font-size: 10px; }

/* ---- 知识树 ---- */
.cardian-kt-tree-node, .cardian-kt-tree-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  border: none; background: transparent; color: inherit; cursor: pointer;
  border-radius: 8px; min-height: 29px; padding: 0 8px 0 0; text-align: left;
  box-sizing: border-box; font-family: inherit; font-size: 12.5px; overflow: hidden;
}
.cardian-kt-tree-node:hover, .cardian-kt-tree-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-tree-node { color: var(--dsw-alias-label-secondary); }
.cardian-kt-tree-node .cardian-kt-tree-title { font-weight: 600; color: var(--dsw-alias-label-primary); }
.cardian-kt-chev {
  display: inline-flex; flex: none; width: 14px; justify-content: center;
  color: var(--dsw-alias-label-tertiary); transition: transform .14s ease;
}
.cardian-kt-chev--open { transform: rotate(90deg); }
.cardian-kt-tree-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cardian-kt-tree-count {
  flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); margin-right: 4px;
}
.cardian-kt-tree-meta { flex: none; font-size: 10px; opacity: 0.55; margin-right: 4px; }
.cardian-kt-tree-item { color: var(--dsw-alias-label-secondary); }
.cardian-kt-tree-item .kt-icon { color: var(--dsw-alias-label-tertiary); }
.cardian-kt-tree-item--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
/* 层级树（总览 → 模块 → 文件）：分支行 = 展开钮 + 节点 + 可选「打开此卡」小钮。 */
.cardian-kt-tree-branch { display: flex; align-items: center; gap: 2px; }
.cardian-kt-tree-branch > .cardian-kt-tree-node { flex: 1; min-width: 0; }
.cardian-kt-tree-branch--card > .cardian-kt-tree-node .cardian-kt-tree-title { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-tree-openbtn {
  flex: none; display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-right: 4px; padding: 0; border-radius: 6px;
  border: none; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-tertiary); font-family: inherit;
  opacity: 0; transition: opacity .12s, background .12s, color .12s;
}
.cardian-kt-tree-branch:hover .cardian-kt-tree-openbtn { opacity: 1; }
.cardian-kt-tree-openbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-tree-badge {
  flex: none; font-size: 9.5px; line-height: 1; padding: 3px 5px; border-radius: 5px; margin-right: 4px;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
}
.cardian-kt-tree-badge:not(:first-of-type) { opacity: 0.85; }

/* ---- 左栏底部：深度洞察 ---- */
.cardian-kt-rail-foot {
  flex: none; border-top: 1px solid var(--dsw-alias-border-l1);
  padding: 8px; display: flex; flex-direction: column; gap: 1px;
}
.cardian-kt-rail-foot-label {
  font-size: 10.5px; color: var(--dsw-alias-label-tertiary); margin: 2px 10px 5px;
  text-transform: uppercase; letter-spacing: .06em;
}
.cardian-kt-nav-item--flat { padding: 6px 10px; font-size: 12.5px; }

/* ---- 右栏 ---- */
.cardian-kt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.cardian-kt-scroll { flex: 1; overflow-y: auto; }
.cardian-kt-page { max-width: 840px; margin: 0 auto; padding: 20px 32px 56px; box-sizing: border-box; }
.cardian-kt-h3 {
  font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-tertiary);
  letter-spacing: .04em; margin: 26px 0 10px; text-transform: uppercase;
}

/* ============ 总览 ============ */
.cardian-kt-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cardian-kt-stat {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  padding: 16px; border-radius: 14px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: inherit; font-family: inherit; transition: border-color .12s, background .12s, transform .12s;
}
.cardian-kt-stat:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-stat--active {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
}
.cardian-kt-stat--static { cursor: default; }
.cardian-kt-stat-icon {
  display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border-radius: 10px; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
}
.cardian-kt-stat-num { font-size: 24px; font-weight: 700; line-height: 1; letter-spacing: -.01em; }
.cardian-kt-stat-label { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ---- 仓库网格 ---- */
.cardian-kt-repo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.cardian-kt-repo-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit;
  font-family: inherit; transition: border-color .12s, background .12s, transform .12s;
}
.cardian-kt-repo-card:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: var(--dsw-alias-interactive-bg-hover);
}
.cardian-kt-repo-icon { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); display: flex; }
.cardian-kt-repo-name {
  font-weight: 600; font-size: 13px; margin-top: 4px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-repo-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary); }

/* ---- 最近更新条目卡 ---- */
.cardian-kt-entry-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.cardian-kt-entry-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit;
  font-family: inherit; transition: border-color .12s, background .12s;
}
.cardian-kt-entry-card:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-entry-card-title {
  font-size: 13px; font-weight: 600; line-height: 1.45; max-width: 100%;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cardian-kt-entry-card-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary); }

/* ---- 空态 ---- */
.cardian-kt-empty {
  margin-top: 48px; padding: 36px 20px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 16px;
}
.cardian-kt-empty-icon { display: inline-flex; color: var(--dsw-alias-label-tertiary); margin-bottom: 10px; }
.cardian-kt-empty-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.cardian-kt-empty-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 1.7; margin: 0 auto; max-width: 420px; }

/* ============ 详情 ============ */
.cardian-kt-crumb { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; min-width: 0; }
.cardian-kt-back {
  display: inline-flex; align-items: center; gap: 5px; flex: none; border: none;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
  font-size: 12px; font-family: inherit; padding: 5px 9px; border-radius: 8px;
}
.cardian-kt-back:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-crumb-sep { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.cardian-kt-crumb-text {
  font-size: 12.5px; color: var(--dsw-alias-label-tertiary); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-article { animation: kt-fade .16s ease; }
@keyframes kt-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cardian-kt-article-title { font-size: 22px; font-weight: 700; line-height: 1.35; margin: 0 0 10px; letter-spacing: -.01em; }
.cardian-kt-article-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.cardian-kt-chip {
  font-size: 11px; background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary); border-radius: 99px; padding: 3px 10px;
  max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-chip--tag { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-lead {
  font-size: 13.5px; color: var(--dsw-alias-label-secondary); line-height: 1.7; margin: 0 0 14px;
  padding-left: 12px; border-left: 3px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
}
.cardian-kt-matches { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); margin-bottom: 8px; }

/* ---- 关联知识 ---- */
.cardian-kt-rel { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 14px; }
.cardian-kt-rel-label {
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: .05em; margin: 0 0 8px;
}
.cardian-kt-rel-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-rel-chip {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font-size: 12px; font-family: inherit;
  border-radius: 8px; padding: 4px 10px; max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: all .12s;
}
.cardian-kt-rel-chip:hover {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 50%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 8%, transparent);
}

/* ============ Markdown 正文 ============ */
.kt-md { font-size: 13.5px; line-height: 1.75; color: var(--dsw-alias-label-primary); }
.kt-md-p { margin: 0 0 12px; white-space: pre-wrap; overflow-wrap: break-word; }
.kt-md-h { font-weight: 680; line-height: 1.4; margin: 22px 0 10px; }
.kt-md-h1, .kt-md-h2 { font-size: 17px; padding-bottom: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.kt-md-h3 { font-size: 15px; }
.kt-md-h4 { font-size: 13.5px; }
.kt-md-h5 { font-size: 13px; }
.kt-md-list { margin: 0 0 12px; padding-left: 22px; display: flex; flex-direction: column; gap: 4px; }
.kt-md-list li::marker { color: var(--dsw-alias-label-tertiary); }
.kt-md-task { color: var(--dsw-alias-label-tertiary); }
.kt-md-task--done { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.kt-md-quote {
  margin: 0 0 14px; padding: 8px 14px; border-radius: 0 10px 10px 0;
  border-left: 3px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
  color: var(--dsw-alias-label-secondary);
}
.kt-md-quote span { display: block; }
.cardian-kt-pre, .kt-md-pre {
  white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  background: var(--dsw-alias-markdown-code-block); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; padding: 12px 14px; margin: 0 0 14px; overflow-x: auto;
}
.kt-md-code {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.92em;
  background: var(--dsw-alias-markdown-code-block); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px; padding: 1px 5px;
}
.kt-md-wikilink {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 9%, transparent);
  border-radius: 5px; padding: 1px 5px;
}
.kt-md-wikilink--link {
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 40%, transparent);
  transition: background .12s, border-color .12s;
}
.kt-md-wikilink--link:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 18%, transparent);
  border-bottom-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.kt-md-wikilink--link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  outline-offset: 1px;
}
.kt-md-mark, .cardian-kt-mark {
  background: color-mix(in srgb, var(--dsw-static-yellowish-500, #ffd24f) 42%, transparent);
  color: inherit; border-radius: 3px; padding: 0 1px;
}
.kt-md a { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); text-decoration: none; }
.kt-md a:hover { text-decoration: underline; }
.kt-md-hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 18px 0; }
.kt-md-tablewrap { overflow-x: auto; margin: 0 0 14px; }
.kt-md-table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.kt-md-table th, .kt-md-table td {
  border: 1px solid var(--dsw-alias-border-l1); padding: 6px 10px; text-align: left; vertical-align: top;
}
.kt-md-table th { background: var(--dsw-alias-interactive-bg-hover); font-weight: 600; }

/* ============ 表单 ============ */
.cardian-kt-form {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; align-items: start;
  animation: kt-fade .16s ease;
}
.cardian-kt-form-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.cardian-kt-form-field--wide { grid-column: 1 / -1; }
.cardian-kt-form-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.cardian-kt-form-required { color: var(--dsw-alias-state-error-secondary, var(--dsw-alias-state-error-primary)); font-style: normal; }
.cardian-kt-form-input, .cardian-kt-form-textarea {
  width: 100%; box-sizing: border-box; padding: 8px 11px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-input-major);
  color: inherit; font-size: 13px; outline: none; font-family: inherit;
  transition: border-color .12s;
}
.cardian-kt-form-input:focus, .cardian-kt-form-textarea:focus {
  border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.cardian-kt-form-textarea { resize: vertical; line-height: 1.6; min-height: 64px; }
.cardian-kt-form-textarea[name='content'] { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.cardian-kt-form-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

/* ============ 按钮 ============ */
.cardian-kt-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: inherit; cursor: pointer; font-size: 12.5px; font-family: inherit;
  padding: 6px 14px; border-radius: 9px; transition: background .12s, border-color .12s;
}
.cardian-kt-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-btn--primary {
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  border-color: transparent; color: var(--dsw-static-neutral-00);
}
.cardian-kt-btn--primary:hover { filter: brightness(1.06); background: var(--dsw-alias-button-info-hover); }
.cardian-kt-btn--danger {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-btn--danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent); }
.cardian-kt-btn:disabled { opacity: 0.5; cursor: default; }
.cardian-kt-iconbtn {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; transition: background .12s, color .12s;
}
.cardian-kt-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-iconbtn:disabled { opacity: 0.4; cursor: default; }
.cardian-kt-iconbtn--danger:hover {
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
}
.cardian-kt-btn:focus-visible, .cardian-kt-iconbtn:focus-visible, .cardian-kt-nav-item:focus-visible,
.cardian-kt-tree-item:focus-visible, .cardian-kt-tree-node:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  outline-offset: 1px;
}

/* ---- 删除确认条 ---- */
.cardian-kt-confirm {
  flex: none; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);
  padding: 10px 16px; display: flex; align-items: center; gap: 10px;
}
.cardian-kt-confirm-text { flex: 1; font-size: 12px; margin: 0; word-break: break-word; color: var(--dsw-alias-state-error-primary); }
.cardian-kt-confirm-actions { flex: none; display: flex; gap: 8px; }

/* ---- 崩溃横幅 ---- */
.cardian-kt-crash {
  position: absolute; inset: 0; z-index: 25; pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: 24px; text-align: center;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px;
}
.cardian-kt-crash-title { font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
.cardian-kt-crash-text {
  max-width: 560px; max-height: 40vh; overflow: auto; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.6; margin: 0; padding: 10px 12px; border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  color: var(--dsw-alias-state-error-primary); text-align: left;
}
.cardian-kt-crash-actions { display: flex; gap: 8px; }

/* ============ 工作区沉淀 dock ============ */
.cardian-kt-project-dock {
  margin-top: 26px; padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.cardian-kt-project-dock-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cardian-kt-project-dock-title {
  display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 650;
  color: var(--dsw-alias-label-primary);
}
.cardian-kt-project-dock-hint {
  font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-tertiary); margin: 0 0 4px;
}
.cardian-kt-ws-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
  transition: background .12s;
}
.cardian-kt-ws-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-ws-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cardian-kt-ws-title {
  display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600;
  color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-ws-path {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-ws-action {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); cursor: pointer;
  font-size: 12px; font-family: inherit; padding: 5px 12px; border-radius: 8px; flex-shrink: 0;
  transition: background .12s, border-color .12s;
}
.cardian-kt-ws-action:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
}
.cardian-kt-ws-action:disabled { opacity: 0.5; cursor: default; }
.cardian-kt-ws-action--danger {
  color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2));
}
.cardian-kt-ws-action--danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
.cardian-kt-ws-state {
  flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 52px; text-align: right;
}
.cardian-kt-ws-progress { flex-shrink: 0; width: 170px; display: flex; flex-direction: column; gap: 4px; }
.cardian-kt-ws-progress-meta {
  font-size: 10px; color: var(--dsw-alias-label-tertiary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-bar {
  height: 6px; border-radius: 99px; background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  overflow: hidden;
}
.cardian-kt-bar-fill {
  height: 100%; border-radius: 99px;
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  transition: width 0.25s ease;
}
.cardian-kt-ws-ai {
  flex-shrink: 0; max-width: 260px; display: flex; align-items: flex-start; gap: 5px;
  font-size: 11px; line-height: 1.45; color: var(--dsw-alias-label-secondary);
}
.cardian-kt-ws-ai-icon { flex-shrink: 0; display: flex; margin-top: 1px; }
.cardian-kt-ws-ai-text { overflow: hidden; text-overflow: ellipsis; }

/* ============ AI 扫盘建库 ============ */
/* ---- 入口 CTA（wiki 总览顶部）---- */
.cardian-kt-scan-cta {
  display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap;
  margin-top: 18px; padding: 14px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 30%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
}
.cardian-kt-scan-cta-main {
  flex: 1; min-width: 260px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  text-align: left; cursor: pointer; font-family: inherit; border-radius: 11px; padding: 12px 14px;
  color: var(--dsw-alias-label-primary);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  transition: background .12s, filter .12s;
}
.cardian-kt-scan-cta-main:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 20%, transparent); }
.cardian-kt-scan-cta-main:disabled { opacity: 0.55; cursor: default; }
.cardian-kt-scan-cta-label { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 650; }
.cardian-kt-scan-cta-sub { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); font-weight: 400; }
.cardian-kt-scan-cta-side { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; justify-content: center; }
.cardian-kt-scan-cta-model { font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 240px; line-height: 1.5; }

/* ---- 进度卡（分阶段 + 暂停/继续/停止）---- */
.cardian-kt-scanprog {
  margin-top: 12px; padding: 14px 16px; border-radius: 14px; animation: kt-fade .16s ease;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-interactive-bg-hover);
  display: flex; flex-direction: column; gap: 8px;
}
.cardian-kt-scanprog--running { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog--paused { border-color: color-mix(in srgb, var(--dsw-alias-state-warning-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)) 55%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog--error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.cardian-kt-scanprog-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; }
.cardian-kt-scanprog-state { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.cardian-kt-scanprog > .cardian-kt-bar { height: 7px; }
.cardian-kt-stages { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-stage {
  font-size: 11px; border-radius: 99px; padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary); white-space: nowrap;
}
.cardian-kt-stage--done { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 40%, transparent); }
.cardian-kt-stage--active {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  font-weight: 600;
}
.cardian-kt-stage--pending { opacity: 0.6; }
.cardian-kt-scanprog-cur {
  margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-scanprog-stats { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.cardian-kt-scanprog-diff, .cardian-kt-scanprog-note { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.6; }
.cardian-kt-scanprog-error { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.cardian-kt-scanprog-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }

/* ---- 扫盘向导 overlay ---- */
.cardian-kt-scan-overlay {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: flex-start; justify-content: center;
  padding: 56px 24px 24px; overflow-y: auto; box-sizing: border-box;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent);
  backdrop-filter: blur(2px);
}
.cardian-kt-scan {
  width: 100%; max-width: 560px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px;
  margin: auto 0; padding: 20px 22px; border-radius: 16px; animation: kt-fade .16s ease;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  color: var(--dsw-alias-label-primary); font-size: 13px;
}
.cardian-kt-scan-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cardian-kt-scan-title { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 680; }
.cardian-kt-scan-note { margin: 0; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-scan-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.cardian-kt-scan-field--sm { flex: 0 0 108px; }
.cardian-kt-scan-row { display: flex; gap: 12px; flex-wrap: wrap; }
.cardian-kt-scan-label { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); letter-spacing: .02em; }
.cardian-kt-scan-input {
  width: 100%; box-sizing: border-box; font-family: inherit; font-size: 12.5px; line-height: 1.5;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; padding: 7px 10px; outline: none;
}
.cardian-kt-scan-input:focus { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 60%, transparent); }
select.cardian-kt-scan-input { cursor: pointer; appearance: none; }
.cardian-kt-scan-help { font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-scan-ws { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-scan-actions { display: flex; justify-content: flex-end; gap: 10px; }
/* 向导里的工作区快捷钮：复用 .cardian-kt-chip 外观，补上 button 需要的交互样式 */
button.cardian-kt-chip {
  display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent;
  cursor: pointer; font-family: inherit; max-width: 100%; transition: background .12s, border-color .12s, color .12s;
}
button.cardian-kt-chip:hover { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)); }
.cardian-kt-chip--active {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
}

/* ============ 洞察 ============ */
.cardian-kt-insight-card {
  margin-top: 16px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; display: flex; flex-direction: column; gap: 6px; animation: kt-fade .16s ease;
}
.cardian-kt-insight-line { font-size: 12.5px; line-height: 1.7; margin: 0; color: var(--dsw-alias-label-secondary); word-break: break-word; }
.cardian-kt-tagcloud { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.cardian-kt-bar-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; min-width: 0; }
.cardian-kt-bar-name {
  flex: none; width: 150px; font-size: 12px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-bar-track {
  flex: 1; height: 8px; border-radius: 99px; min-width: 40px;
  background: var(--dsw-alias-interactive-bg-hover); overflow: hidden;
}
.cardian-kt-bar-value {
  display: block; height: 100%; border-radius: 99px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 65%, transparent),
    var(--dsw-alias-brand-primary-new-colorprimary-new-color));
  transition: width .3s ease;
}
.cardian-kt-bar-num { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); width: 64px; text-align: right; }
.cardian-kt-doctor-head {
  display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 650; margin: 0 0 8px;
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-doctor-head--ok { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)); }
.cardian-kt-level {
  display: inline-block; font-size: 10px; font-weight: 600; border-radius: 5px;
  padding: 1px 6px; margin-right: 8px; text-transform: uppercase;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary);
}
.cardian-kt-level--error {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-level--warn {
  background: color-mix(in srgb, #f5a623 16%, transparent);
  color: #b76e10;
}

/* ---- 依赖图谱（纯 SVG 力导向，零依赖） ---- */
.cardian-kt-graph-card { gap: 12px; }
.cardian-kt-graph-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cardian-kt-graph-head .cardian-kt-insight-line {
  display: flex; align-items: center; gap: 6px; font-weight: 650; color: var(--dsw-alias-label-primary);
}
.cardian-kt-graph-tip { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-graph {
  width: 100%; overflow: hidden; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 3%, var(--dsw-alias-bg-base));
}
.cardian-kt-graph-svg { display: block; width: 100%; height: auto; max-height: 480px; }
.cardian-kt-graph-edge {
  stroke: color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, transparent);
  stroke-width: 1.2; transition: stroke .14s, opacity .14s;
}
.cardian-kt-graph-edge--hi { stroke: var(--dsw-alias-brand-primary-new-colorprimary-new-color); stroke-width: 1.8; }
.cardian-kt-graph-edge--dim { opacity: 0.15; }
.cardian-kt-graph-node { cursor: pointer; transition: opacity .14s; }
.cardian-kt-graph-node--dim { opacity: 0.32; }
.cardian-kt-graph-dot {
  fill: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 82%, var(--dsw-alias-bg-base));
  stroke: var(--dsw-alias-bg-base); stroke-width: 1.5; transition: fill .14s;
}
.cardian-kt-graph-node:hover .cardian-kt-graph-dot,
.cardian-kt-graph-node--active .cardian-kt-graph-dot {
  fill: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  stroke: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 30%, var(--dsw-alias-bg-base));
}
.cardian-kt-graph-node:focus { outline: none; }
.cardian-kt-graph-node:focus-visible .cardian-kt-graph-dot {
  stroke: var(--dsw-alias-brand-primary-new-colorprimary-new-color); stroke-width: 2.5;
}
.cardian-kt-graph-label {
  font-size: 9.5px; fill: var(--dsw-alias-label-secondary); pointer-events: none; font-family: inherit;
  paint-order: stroke; stroke: var(--dsw-alias-bg-base); stroke-width: 2.5px; stroke-linejoin: round;
}
.cardian-kt-graph-node--active .cardian-kt-graph-label {
  fill: var(--dsw-alias-brand-primary-new-colorprimary-new-color); font-weight: 600;
}

/* ---- 筛选后空态 ---- */
.cardian-kt-filter-empty {
  margin-top: 22px; padding: 22px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.cardian-kt-filter-empty-text { font-size: 12.5px; color: var(--dsw-alias-label-tertiary); margin: 0; }

/* ============ 细节 ============ */
.cardian-kt-rail-tree::-webkit-scrollbar, .cardian-kt-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.cardian-kt-rail-tree::-webkit-scrollbar-thumb, .cardian-kt-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent);
  border-radius: 99px; border: 3px solid transparent; background-clip: content-box;
}
.cardian-kt-rail-tree::-webkit-scrollbar-thumb:hover, .cardian-kt-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 45%, transparent);
  background-clip: content-box;
}

@media (max-width: 980px) {
  .cardian-kt-rail { width: 224px; }
  .cardian-kt-page { padding: 16px 20px 48px; }
  .cardian-kt-stats { grid-template-columns: 1fr; }
  .cardian-kt-form { grid-template-columns: 1fr; }
}
`
