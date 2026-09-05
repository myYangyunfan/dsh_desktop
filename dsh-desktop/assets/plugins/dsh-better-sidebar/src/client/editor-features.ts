/**
 * Editor feature pack (side-ed): bracket matching / code folding / find & replace.
 *
 * Self-contained by construction: it relies only on @codemirror/state +
 * @codemirror/view core machinery (ViewPlugin / Decoration / WidgetType /
 * GutterMarker / keymap — all already inside the editor chunk bundle), because
 * @codemirror/search is not part of the built chunk. The find panel is therefore
 * a hand-rolled DOM overlay hosted by a ViewPlugin, and folding is
 * indentation-based (the language-agnostic fallback editors use when no folder
 * provider exists).
 *
 * CSS is injected at runtime as one <style data-plugin-css> tag (the K28
 * file-changes-highlight pattern) instead of css-module hashing, so the class
 * names stay stable across rebuilds instead of being rewritten by the bundler.
 * Colors derive from `currentColor` + color-mix so both schemes read fine.
 *
 * The pure helpers (matchingBracketIndex / foldableBlocks / findMatchOffsets /
 * computeReplacedText) ship as `__internals` on the chunk export, so
 * scripts/test/unit-better-sidebar-editor-features.test.js can vm-evaluate the
 * shipped lib/client-editor.js and test the released bytes directly. (An earlier
 * regime hand-inlined an equivalent section between `dsh-editor-features`
 * markers in lib because the chunk could not be rebuilt; that is gone now that
 * `npm run build` works — keep it that way, having both is a duplicate
 * declaration.)
 */
import { EditorSelection, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  BlockInfo,
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

// ---------------------------------------------------------------------------
// Pure helpers (chunk __internals; unit-tested in Node)
// ---------------------------------------------------------------------------

const BRACKET_OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
const BRACKET_CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
/** Scan budget per direction: bound the worst case on pathological docs. */
const BRACKET_SCAN_LIMIT = 200_000

/** A resolved cursor-adjacent bracket pair: `bracket` + its partner `match`. */
export interface BracketPair {
  bracket: number
  match: number
}

/**
 * The bracket pair adjacent to `head`, or null: `bracket` is the offset of
 * the bracket at the cursor and `match` its partner. The char BEFORE the
 * cursor wins (cursor resting right after a bracket — editor convention),
 * then the char AT the cursor. Plain depth-counted scan: language-agnostic,
 * bounded by BRACKET_SCAN_LIMIT per direction.
 */
export function matchingBracketIndex(text: string, head: number): BracketPair | null {
  for (const pos of [head - 1, head]) {
    if (pos < 0 || pos >= text.length) continue
    const ch = text[pos]
    if (ch in BRACKET_OPEN) {
      const open = ch
      const close = BRACKET_OPEN[ch] as string
      let depth = 0
      const limit = Math.min(text.length, pos + BRACKET_SCAN_LIMIT)
      for (let i = pos + 1; i < limit; i++) {
        const c = text[i]
        if (c === open) depth++
        else if (c === close) {
          if (depth === 0) return { bracket: pos, match: i }
          depth--
        }
      }
    } else if (ch in BRACKET_CLOSE) {
      const close = ch
      const open = BRACKET_CLOSE[ch] as string
      let depth = 0
      const limit = Math.max(0, pos - BRACKET_SCAN_LIMIT)
      for (let i = pos - 1; i >= limit; i--) {
        const c = text[i]
        if (c === close) depth++
        else if (c === open) {
          if (depth === 0) return { bracket: pos, match: i }
          depth--
        }
      }
    }
  }
  return null
}

/** One foldable block: 1-based header line and 1-based last line. */
export interface FoldBlock {
  fromLine: number
  toLine: number
}

/** Step budget for foldableBlocks (never hang on pathological indentation). */
const FOLD_STEP_BUDGET = 2_000_000

/**
 * Indentation-based foldable blocks (the language-agnostic fallback). A
 * non-empty line whose following lines are all deeper-indented (blank lines
 * never interrupt, trailing blanks excluded) opens one block ending at the
 * last such line. Nested blocks are emitted per header line, so the result
 * covers every foldable level in one pass.
 */
export function foldableBlocks(text: string): FoldBlock[] {
  const lines = text.split('\n')
  const blocks: FoldBlock[] = []
  let budget = FOLD_STEP_BUDGET
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i] as string
    let base = 0
    while (base < header.length && (header[base] === ' ' || header[base] === '\t')) base++
    if (header.trim() === '') continue
    let last = i
    for (let j = i + 1; j < lines.length; j++) {
      if (budget-- <= 0) return blocks
      const s = lines[j] as string
      if (s.trim() === '') continue
      let indent = 0
      while (indent < s.length && (s[indent] === ' ' || s[indent] === '\t')) indent++
      if (indent > base) {
        last = j
        continue
      }
      break
    }
    if (last > i) blocks.push({ fromLine: i + 1, toLine: last + 1 })
  }
  return blocks
}

/** All non-overlapping match offsets of `query` in `text` ('' query → []). */
export function findMatchOffsets(text: string, query: string, caseSensitive: boolean): number[] {
  if (query === '') return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  if (needle === '') return []
  const out: number[] = []
  let at = hay.indexOf(needle)
  while (at !== -1) {
    out.push(at)
    at = hay.indexOf(needle, at + needle.length)
  }
  return out
}

/** Replace every match in one pass; returns the new text and match count. */
export function computeReplacedText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): { text: string; count: number } {
  const offsets = findMatchOffsets(text, query, caseSensitive)
  if (offsets.length === 0) return { text, count: 0 }
  const parts: string[] = []
  let prev = 0
  for (const off of offsets) {
    parts.push(text.slice(prev, off), replacement)
    prev = off + query.length
  }
  parts.push(text.slice(prev))
  return { text: parts.join(''), count: offsets.length }
}

// ---------------------------------------------------------------------------
// Runtime CSS (one <style data-plugin-css> tag, K28 pattern)
// ---------------------------------------------------------------------------

/** Idempotently inject the feature styles (theme-agnostic currentColor mixes). */
export function ensureEditorFeaturesCss(): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-better-sidebar/editor-features'
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-better-sidebar'
  style.dataset.pluginCss = id
  style.textContent = [
    '.dsh-editor-bracket-match{background:color-mix(in srgb,currentColor 16%,transparent);outline:1px solid color-mix(in srgb,currentColor 45%,transparent);border-radius:2px;}',
    '.dsh-editor-fold-gutter{width:13px;}',
    '.dsh-editor-fold-marker{cursor:pointer;opacity:.5;font-size:10px;line-height:1;padding:2px 3px 0 4px;font-family:ui-monospace,monospace;}',
    '.dsh-editor-fold-marker:hover{opacity:1;}',
    '.dsh-editor-fold-placeholder{font-style:italic;color:color-mix(in srgb,currentColor 55%,transparent);background:color-mix(in srgb,currentColor 9%,transparent);border-radius:3px;padding:0 4px;margin:0 3px;font-size:.92em;}',
    '.dsh-editor-find-panel{position:absolute;top:4px;right:18px;z-index:30;display:flex;flex-direction:column;gap:4px;padding:6px 8px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:6px;background:color-mix(in srgb,currentColor 7%,transparent);backdrop-filter:blur(8px);font-size:12px;}',
    '.dsh-editor-find-row{display:flex;align-items:center;gap:4px;}',
    '.dsh-editor-find-input{flex:1 1 130px;min-width:110px;color:inherit;background:color-mix(in srgb,currentColor 8%,transparent);border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:4px;padding:2px 6px;font:inherit;outline:none;}',
    '.dsh-editor-find-input:focus{border-color:color-mix(in srgb,currentColor 45%,transparent);}',
    '.dsh-editor-find-btn{cursor:pointer;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:4px;padding:1px 7px;font:inherit;line-height:1.5;}',
    '.dsh-editor-find-btn:hover{background:color-mix(in srgb,currentColor 12%,transparent);}',
    '.dsh-editor-find-btn[aria-pressed="true"]{background:color-mix(in srgb,currentColor 22%,transparent);font-weight:600;}',
    '.dsh-editor-find-count{min-width:52px;text-align:center;opacity:.75;font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '.dsh-editor-find-count:empty{display:none;}',
  ].join('\n')
  document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Feature 1: bracket matching
// ---------------------------------------------------------------------------

const bracketMatchMark = Decoration.mark({ class: 'dsh-editor-bracket-match' })

/** Cursor-adjacent bracket matching: rescans on selection/doc changes and
 * marks both the bracket and its partner with `dsh-editor-bracket-match`. */
export function bracketMatchExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      update(update: ViewUpdate) {
        if (!(update.selectionSet || update.docChanged)) return
        const { state } = update
        const head = state.selection.main.head
        const pair = matchingBracketIndex(state.doc.toString(), head)
        if (pair === null) {
          this.decorations = Decoration.none
          return
        }
        const from = Math.min(pair.bracket, pair.match)
        const to = Math.max(pair.bracket, pair.match)
        this.decorations = Decoration.set([
          bracketMatchMark.range(from, from + 1),
          bracketMatchMark.range(to, to + 1),
        ])
      }
    },
    { decorations: (v) => v.decorations },
  )
}

// ---------------------------------------------------------------------------
// Feature 2: indentation-based code folding
// ---------------------------------------------------------------------------

interface FoldedRange {
  from: number
  to: number
}

const dshFoldEffect = StateEffect.define<{ from: number; to: number }>()
const dshUnfoldEffect = StateEffect.define<{ from: number; to: number }>()
const dshUnfoldAllEffect = StateEffect.define<null>()

/** The folded-range placeholder: "… N lines" replacing the folded body. */
class DshFoldPlaceholder extends WidgetType {
  constructor(readonly count: number) {
    super()
  }
  override eq(other: DshFoldPlaceholder): boolean {
    return other.count === this.count
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'dsh-editor-fold-placeholder'
    span.textContent = ` … ${this.count} 行 `
    return span
  }
  override ignoreEvent(): boolean {
    return false
  }
}

/** Per-document foldable-block cache (Text instances are immutable per rev). */
const foldBlockCache = new WeakMap<object, { blocks: FoldBlock[]; byHeader: Map<number, FoldBlock> }>()

function foldIndexFor(doc: object): { blocks: FoldBlock[]; byHeader: Map<number, FoldBlock> } {
  let entry = foldBlockCache.get(doc)
  if (entry === undefined) {
    const blocks = foldableBlocks(doc.toString())
    const byHeader = new Map<number, FoldBlock>()
    for (const block of blocks) byHeader.set(block.fromLine, block)
    entry = { blocks, byHeader }
    foldBlockCache.set(doc, entry)
  }
  return entry
}

function buildFoldDeco(ranges: FoldedRange[], doc: { lineAt(pos: number): { number: number } }): DecorationSet {
  if (ranges.length === 0) return Decoration.none
  return Decoration.set(
    ranges.map((r) => {
      const count = Math.max(0, (doc.lineAt(r.to).number as number) - (doc.lineAt(r.from).number as number))
      return Decoration.replace({ widget: new DshFoldPlaceholder(count) }).range(r.from, r.to)
    }),
    true,
  )
}

/** The folded-range store: effects add/remove/clear; doc changes remap. */
const foldState = StateField.define<{ ranges: FoldedRange[]; deco: DecorationSet }>({
  create: () => ({ ranges: [], deco: Decoration.none }),
  update(value, tr) {
    let ranges = value.ranges
    let touched = false
    for (const effect of tr.effects) {
      if (effect.is(dshFoldEffect)) {
        ranges = ranges.filter((r) => r.to < effect.value.from || r.from > effect.value.to)
        ranges = [...ranges, effect.value].sort((a, b) => a.from - b.from)
        touched = true
      } else if (effect.is(dshUnfoldEffect)) {
        ranges = ranges.filter((r) => r.from !== effect.value.from || r.to !== effect.value.to)
        touched = true
      } else if (effect.is(dshUnfoldAllEffect)) {
        if (ranges.length > 0) touched = true
        ranges = []
      }
    }
    if (tr.docChanged) {
      ranges = ranges
        .map((r) => ({ from: tr.changes.mapPos(r.from), to: tr.changes.mapPos(r.to) }))
        .filter((r) => r.to > r.from)
      touched = true
    }
    return touched ? { ranges, deco: buildFoldDeco(ranges, tr.state.doc) } : value
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.deco),
})

class DshFoldMarker extends GutterMarker {
  constructor(readonly folded: boolean) {
    super()
  }
  override eq(other: DshFoldMarker): boolean {
    return other.folded === this.folded
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'dsh-editor-fold-marker'
    span.textContent = this.folded ? '▸' : '▾'
    return span
  }
}

const foldOpenMarker = new DshFoldMarker(false)
const foldFoldedMarker = new DshFoldMarker(true)

/** Fold or unfold the block whose header is the line containing `pos`. */
function toggleFoldAt(view: EditorView, pos: number): void {
  const doc = view.state.doc
  const line = doc.lineAt(pos)
  const folded = view.state.field(foldState, false)?.ranges ?? []
  const existing = folded.find((r) => doc.lineAt(r.from).number === line.number)
  if (existing !== undefined) {
    view.dispatch({ effects: dshUnfoldEffect.of({ from: existing.from, to: existing.to }) })
    return
  }
  const block = foldIndexFor(doc).byHeader.get(line.number)
  if (block === undefined) return
  view.dispatch({
    effects: dshFoldEffect.of({ from: doc.line(block.fromLine).to, to: doc.line(block.toLine).to }),
  })
}

/** The fold gutter: ▾ on foldable headers, ▸ on folded ones, click toggles. */
function foldGutterExtension(): Extension {
  return gutter({
    class: 'dsh-editor-fold-gutter',
    lineMarker(view: EditorView, line: BlockInfo): GutterMarker | null {
      // BlockInfo carries no line number — resolve through lineAt(line.from).
      const number = view.state.doc.lineAt(line.from).number
      const index = foldIndexFor(view.state.doc)
      if (!index.byHeader.has(number)) return null
      const folded = view.state.field(foldState, false)?.ranges ?? []
      const isFolded = folded.some((r) => view.state.doc.lineAt(r.from).number === number)
      return isFolded ? foldFoldedMarker : foldOpenMarker
    },
    lineMarkerChange(update: ViewUpdate): boolean {
      if (update.docChanged) return true
      const before = update.startState.field(foldState, false)
      const after = update.state.field(foldState, false)
      return before !== after
    },
    domEventHandlers: {
      mousedown(view: EditorView, line: BlockInfo): boolean {
        toggleFoldAt(view, line.from)
        return true
      },
    },
  })
}

/** Fold / unfold the block at the cursor (Ctrl-Shift-[ / ], Mod-Alt on mac). */
function foldCommand(view: EditorView, fold: boolean): boolean {
  const head = view.state.selection.main.head
  if (fold) {
    toggleFoldAt(view, head)
  } else {
    const doc = view.state.doc
    const line = doc.lineAt(head).number
    const folded = view.state.field(foldState, false)?.ranges ?? []
    const hit = folded.find((r) => doc.lineAt(r.from).number === line || (r.from <= head && r.to >= head))
    if (hit !== undefined) view.dispatch({ effects: dshUnfoldEffect.of(hit) })
  }
  return true
}

/** Full folding feature: field + gutter + fold/unfold keymap. */
export function foldExtension(): Extension {
  return [
    foldState,
    foldGutterExtension(),
    keymap.of([
      // The upstream foldKeymap chords (Ctrl-Shift-[ / ] with the mac
      // Mod-Alt variant) — canonical, and free of any defaultKeymap clash.
      { key: 'Ctrl-Shift-[', mac: 'Mod-Alt-[', run: (view) => foldCommand(view, true) },
      { key: 'Ctrl-Shift-]', mac: 'Mod-Alt-]', run: (view) => foldCommand(view, false) },
    ]),
  ]
}

// ---------------------------------------------------------------------------
// Feature 3: find & replace (hand-rolled panel; no @codemirror/search)
// ---------------------------------------------------------------------------

interface FindPanelState {
  open: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  offsets: number[]
  index: number
}

/** The find & replace overlay: Mod-f opens, F3 / Shift-F3 navigate, Enter /
 * Shift-Enter inside the inputs navigate, Escape closes. Live match count;
 * replace current + replace all. Pure scan via findMatchOffsets. */
export function findPanelExtension(): Extension {
  ensureEditorFeaturesCss()
  const plugin = ViewPlugin.fromClass(
    class DshFindPanel {
      private view: EditorView
      private panel: HTMLDivElement | null = null
      private queryInput: HTMLInputElement | null = null
      private replaceInput: HTMLInputElement | null = null
      private countLabel: HTMLSpanElement | null = null
      private state: FindPanelState = {
        open: false,
        query: '',
        replacement: '',
        caseSensitive: false,
        offsets: [],
        index: 0,
      }
      constructor(view: EditorView) {
        this.view = view
      }
      update(update: ViewUpdate) {
        if (this.state.open && update.docChanged) this.recompute()
      }
      destroy() {
        this.closePanel()
      }
      private ensureDom(): void {
        if (this.panel !== null) return
        const panel = document.createElement('div')
        panel.className = 'dsh-editor-find-panel'
        const row1 = document.createElement('div')
        row1.className = 'dsh-editor-find-row'
        const caseBtn = document.createElement('button')
        caseBtn.type = 'button'
        caseBtn.className = 'dsh-editor-find-btn'
        caseBtn.textContent = 'Aa'
        caseBtn.title = '区分大小写'
        caseBtn.setAttribute('aria-pressed', String(this.state.caseSensitive))
        caseBtn.addEventListener('click', () => {
          this.state.caseSensitive = !this.state.caseSensitive
          caseBtn.setAttribute('aria-pressed', String(this.state.caseSensitive))
          this.recompute()
        })
        const query = document.createElement('input')
        query.className = 'dsh-editor-find-input'
        query.placeholder = '查找'
        query.spellcheck = false
        query.value = this.state.query
        query.addEventListener('input', () => {
          this.state.query = query.value
          this.state.index = 0
          this.recompute()
        })
        query.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            this.navigate(event.shiftKey ? -1 : 1)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            this.closePanel()
            this.view.focus()
          }
        })
        const count = document.createElement('span')
        count.className = 'dsh-editor-find-count'
        const prev = document.createElement('button')
        prev.type = 'button'
        prev.className = 'dsh-editor-find-btn'
        prev.textContent = '◀'
        prev.title = '上一个 (Shift+F3)'
        prev.addEventListener('click', () => this.navigate(-1))
        const next = document.createElement('button')
        next.type = 'button'
        next.className = 'dsh-editor-find-btn'
        next.textContent = '▶'
        next.title = '下一个 (F3)'
        next.addEventListener('click', () => this.navigate(1))
        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'dsh-editor-find-btn'
        close.textContent = '×'
        close.title = '关闭 (Esc)'
        close.addEventListener('click', () => {
          this.closePanel()
          this.view.focus()
        })
        row1.append(caseBtn, query, count, prev, next, close)
        const row2 = document.createElement('div')
        row2.className = 'dsh-editor-find-row'
        const replace = document.createElement('input')
        replace.className = 'dsh-editor-find-input'
        replace.placeholder = '替换为'
        replace.spellcheck = false
        replace.value = this.state.replacement
        replace.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            this.closePanel()
            this.view.focus()
          }
        })
        replace.addEventListener('input', () => {
          this.state.replacement = replace.value
        })
        const replaceBtn = document.createElement('button')
        replaceBtn.type = 'button'
        replaceBtn.className = 'dsh-editor-find-btn'
        replaceBtn.textContent = '替换'
        replaceBtn.title = '替换当前'
        replaceBtn.addEventListener('click', () => this.replaceCurrent())
        const replaceAllBtn = document.createElement('button')
        replaceAllBtn.type = 'button'
        replaceAllBtn.className = 'dsh-editor-find-btn'
        replaceAllBtn.textContent = '全部'
        replaceAllBtn.title = '全部替换'
        replaceAllBtn.addEventListener('click', () => this.replaceAll())
        row2.append(replace, replaceBtn, replaceAllBtn)
        panel.append(row1, row2)
        this.view.dom.appendChild(panel)
        this.panel = panel
        this.queryInput = query
        this.replaceInput = replace
        this.countLabel = count
      }
      openPanel(): void {
        this.ensureDom()
        this.state.open = true
        this.panel!.style.display = 'flex'
        this.recompute()
        this.queryInput!.focus()
        this.queryInput!.select()
      }
      closePanel(): void {
        this.state.open = false
        this.panel?.remove()
        this.panel = null
        this.queryInput = null
        this.replaceInput = null
        this.countLabel = null
      }
      /** Re-scan the document and refresh the counter (no selection change). */
      private recompute(): void {
        this.state.offsets = findMatchOffsets(
          this.view.state.doc.toString(),
          this.state.query,
          this.state.caseSensitive,
        )
        if (this.state.index >= this.state.offsets.length) this.state.index = Math.max(0, this.state.offsets.length - 1)
        if (this.countLabel !== null) {
          this.countLabel.textContent =
            this.state.query === ''
              ? ''
              : this.state.offsets.length === 0
                ? '0 个结果'
                : `${this.state.index + 1}/${this.state.offsets.length}`
        }
      }
      private navigate(delta: number): void {
        if (this.state.offsets.length === 0) return
        const total = this.state.offsets.length
        this.state.index = (this.state.index + delta + total) % total
        const at = this.state.offsets[this.state.index] as number
        const end = at + this.state.query.length
        this.view.dispatch({ selection: EditorSelection.range(at, end), scrollIntoView: true })
        if (this.countLabel !== null) this.countLabel.textContent = `${this.state.index + 1}/${total}`
      }
      private replaceCurrent(): void {
        this.recompute()
        if (this.state.offsets.length === 0) return
        const sel = this.view.state.selection.main
        const at = this.state.offsets[this.state.index] as number
        if (!(sel.from === at && sel.to === at + this.state.query.length)) {
          this.navigate(0)
          return
        }
        this.view.dispatch({
          changes: { from: at, to: at + this.state.query.length, insert: this.state.replacement },
        })
        // update() recomputes on docChanged; park the index on the same spot.
        this.state.index = Math.min(this.state.index, Math.max(0, this.state.offsets.length - 1))
      }
      private replaceAll(): void {
        if (this.state.query === '') return
        const { text, count } = computeReplacedText(
          this.view.state.doc.toString(),
          this.state.query,
          this.state.replacement,
          this.state.caseSensitive,
        )
        if (count === 0) return
        this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } })
        this.state.index = 0
      }
      /** Public surface reached through view.plugin(...) (DshFindPanelInternals). */
      navigatePublic(delta: number): void {
        this.navigate(delta)
      }
      closeAndRefocus(): void {
        this.closePanel()
        this.view.focus()
      }
    },
  )
  return [
    plugin,
    keymap.of([
      {
        key: 'Mod-f',
        preventDefault: true,
        run: (view) => {
          // Fish the plugin instance out of the view's plugin set.
          const p = view.plugin(plugin)
          if (p === null) return false
          ;(p as DshFindPanelInternals).openPanel()
          return true
        },
      },
      {
        key: 'F3',
        preventDefault: true,
        run: (view) => {
          const p = view.plugin(plugin) as DshFindPanelInternals | null
          if (p === null || !p.state.open) return false
          p.navigatePublic(1)
          return true
        },
      },
      {
        key: 'Shift-F3',
        preventDefault: true,
        run: (view) => {
          const p = view.plugin(plugin) as DshFindPanelInternals | null
          if (p === null || !p.state.open) return false
          p.navigatePublic(-1)
          return true
        },
      },
      {
        key: 'Escape',
        run: (view) => {
          const p = view.plugin(plugin) as DshFindPanelInternals | null
          if (p === null || !p.state.open) return false
          p.closeAndRefocus()
          return true
        },
      },
    ]),
  ]
}

/** The panel-facing surface the keymap reaches through `view.plugin(...)`. */
interface DshFindPanelInternals {
  readonly state: FindPanelState
  openPanel(): void
  navigatePublic(delta: number): void
  closeAndRefocus(): void
}

/** Aggregate: bracket matching + folding + find & replace. Wire it into the
 * editor's extension list BEFORE the default keymap so Mod-f / Escape win. */
export function editorFeatures(): Extension {
  return [bracketMatchExtension(), foldExtension(), findPanelExtension()]
}
