// 知识中心面板的微型 UI 套件：内联 SVG 图标集 + 零依赖 Markdown 渲染器。
//
// 两者都是"界面对标 Qoder Quest 知识中心"的地基：
//   * 图标全部是 stroke 风格的内联 SVG（lucide 形状），跟随 currentColor 与
//     主题令牌，替代此前散落的 emoji（🌳📁📄📦…在深浅色主题下观感不可控）。
//   * Markdown 渲染器逐行解析常见块（代码围栏/标题/列表/引用/表格/hr）+
//     行内标记（粗斜体/行内码/链接/[[wikilink]]），产出 React 节点而非
//     innerHTML——没有 XSS 面，也不给浏览器 bundle 增加任何 npm 依赖
//     （tsdown 的 alwaysBundle 规则会把外部包全部打进来，必须保持零依赖）。

import { createElement, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export type IconName =
  | 'knowledge' | 'cards' | 'memory' | 'wiki' | 'search' | 'refresh' | 'close'
  | 'plus' | 'chevron' | 'file' | 'folder' | 'folderOpen' | 'repo' | 'edit'
  | 'trash' | 'back' | 'status' | 'tag' | 'graph' | 'doctor' | 'sparkle'
  | 'link' | 'ingest' | 'check' | 'alert' | 'empty' | 'pause' | 'play' | 'stop'
  | 'module' | 'diff'

const PATHS: Record<IconName, ReactNode> = {
  // book-open —— 知识中心主标识
  knowledge: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
  // layers —— 知识卡片
  cards: (
    <>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </>
  ),
  // lightbulb —— 记忆
  memory: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
    </>
  ),
  // folder —— RepoWiki
  wiki: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  folderOpen: (
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  ),
  // package —— 仓库卡
  repo: (
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  edit: <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  back: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  // bar-chart —— 状态总览
  status: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  tag: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".8" />
    </>
  ),
  // network —— 依赖图谱
  graph: (
    <>
      <circle cx="12" cy="5" r="2.6" />
      <circle cx="5" cy="19" r="2.6" />
      <circle cx="19" cy="19" r="2.6" />
      <path d="m10.4 7 -4 10" />
      <path d="m13.6 7 4 10" />
      <path d="M7.6 19h8.8" />
    </>
  ),
  // activity —— 健康检查
  doctor: <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />,
  sparkle: (
    <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  ingest: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  check: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3 9-9" />
    </>
  ),
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  // inbox —— 空态
  empty: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  // pause / play / stop —— AI 扫盘的实时控制
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </>
  ),
  play: <polygon points="6 3 20 12 6 21 6 3" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  // boxes —— 模块卡（层级树的中间层）
  module: (
    <>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v5.5l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="M12 19v-5.5l4.74-2.85" />
      <path d="M17 13.5V8.32a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0L6 7" />
      <path d="M6 10.5 1.26 7.65" />
    </>
  ),
  // git-compare —— 仅扫描变更（diff）
  diff: (
    <>
      <circle cx="10" cy="12" r="3" />
      <circle cx="14" cy="18" r="3" />
      <path d="M10 9V5a2 2 0 0 1 2-2h5" />
      <path d="M4 12h2" />
      <path d="M17 5h3" />
    </>
  ),
}

export function Icon({ name, size = 15, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      className="kt-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Markdown（零依赖轻量渲染）
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 命中词高亮：把 plain 文本按 term 切开，命中片段包 <mark>。
function markText(plain: string, hl: string, keyBase: string): ReactNode[] {
  if (!plain) return []
  if (!hl) return [plain]
  const parts = plain.split(new RegExp(`(${escapeRe(hl)})`, 'gi'))
  const out: ReactNode[] = []
  parts.forEach((p, i) => {
    if (!p) return
    out.push(
      p.toLowerCase() === hl.toLowerCase() ? (
        <mark key={`${keyBase}-h${i}`} className="kt-md-mark">
          {p}
        </mark>
      ) : (
        p
      ),
    )
  })
  return out
}

// 行内标记：粗体 / 斜体 / 行内码 / [[wikilink]] / [文本](链接)。
//
// 模式串放在 inline-pattern.txt 而非源码字面量：本仓库的文件写入链路多次
// 把源文件里的正则字面量损坏（转义序列被渲染成裸控制字符），token 协议
// （!B=反斜杠、!N=换行）+ 字符串拼接从根上免疫。构建期 tsdown 会把该
// 资产内联为模块（alwaysBundle），浏览器端零额外请求、零 npm 依赖。
import INLINE_PATTERN_RAW from './inline-pattern.txt'

const BS = String.fromCharCode(92) // 反斜杠
const LF = String.fromCharCode(10) // 换行
const INLINE_SRC = String(INLINE_PATTERN_RAW).trim().split('!B').join(BS).split('!N').join(LF)

// 链接协议白名单：仅放行 http/https/mailto/obsidian，挡掉 javascript: / data: 等
// 可执行 scheme。笔记正文可能来自外部导入 / AI 回填，不可全信（webview 内点击即执行）。
function safeHref(u: string): boolean {
  const s = String(u ?? '').trim().toLowerCase()
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('mailto:') || s.startsWith('obsidian://')
}

// onWiki 为可选回调：存在时 [[wikilink]] 渲染成可点击元素（点击/回车触发
// 页内跳转），缺省时退回纯文本 span。用参数贯穿（含粗斜体递归）而非模块级
// 全局，避免并发渲染时两个 Markdown 互相串味。绝不触碰 INLINE_SRC 正则本体。
type WikiHandler = ((title: string) => void) | undefined

function inline(text: string, hl: string, keyBase: string, onWiki?: WikiHandler): ReactNode[] {
  const re = new RegExp(INLINE_SRC, 'g')
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    nodes.push(...markText(text.slice(last, m.index), hl, `${keyBase}p${i}`))
    const k = `${keyBase}i${i++}`
    if (m[1] !== undefined) nodes.push(<strong key={k}>{inline(m[1], hl, k, onWiki)}</strong>)
    else if (m[2] !== undefined) nodes.push(<em key={k}>{inline(m[2], hl, k, onWiki)}</em>)
    else if (m[3] !== undefined) nodes.push(<code key={k}>{m[3]}</code>)
    else if (m[4] !== undefined) {
      const title = String(m[4])
      nodes.push(
        onWiki ? (
          <span
            key={k}
            className="kt-md-wikilink kt-md-wikilink--link"
            role="button"
            tabIndex={0}
            title={`跳转到：${title}`}
            onClick={(e) => {
              e.stopPropagation()
              onWiki(title)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onWiki(title)
              }
            }}
          >
            {title}
          </span>
        ) : (
          <span key={k} className="kt-md-wikilink">
            {title}
          </span>
        ),
      )
    } else if (m[5] !== undefined) {
      const raw = String(m[6] ?? '')
      const href = safeHref(raw) ? raw : undefined
      nodes.push(href
        ? <a key={k} href={href} target="_blank" rel="noreferrer">{m[5]}</a>
        : <span key={k} className="kt-md-linktext">{m[5]}</span>)
    }
    last = m.index + m[0].length
  }
  nodes.push(...markText(text.slice(last), hl, `${keyBase}z`))
  return nodes
}


const RE_FENCE = /^\s{0,3}```\s*([\w+#.-]*)\s*$/
const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/
const RE_HR = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/
const RE_LI_UL = /^\s*[-*+]\s+(.*)$/
const RE_LI_OL = /^\s*\d+[.)]\s+(.*)$/
const RE_TASK = /^\[( |x|X)\]\s*(.*)$/

function isBlockStart(line: string): boolean {
  return (
    RE_FENCE.test(line) || RE_HEADING.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) ||
    RE_LI_UL.test(line) || RE_LI_OL.test(line)
  )
}

export function Markdown({
  text,
  highlight = '',
  onWikiSelect,
}: {
  text: string
  highlight?: string
  onWikiSelect?: (title: string) => void
}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let b = 0
  const hl = highlight.trim()
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const kb = `b${b++}`

    // 代码围栏
    const fence = RE_FENCE.exec(line)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++ // 收尾围栏（缺失也容错）
      blocks.push(
        <pre key={kb} className="kt-md-pre" data-lang={fence[1] || undefined}>
          <code>{buf.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // 标题（面板字号空间有限，h1/h2 收拢到同一档，由 CSS 分级）
    const h = RE_HEADING.exec(line)
    if (h) {
      const lvl = Math.min(h[1].length, 5)
      blocks.push(createElement(`h${Math.max(lvl, 2)}`, { key: kb, className: `kt-md-h kt-md-h${lvl}` }, ...inline(h[2], hl, kb, onWikiSelect)))
      i++
      continue
    }

    if (RE_HR.test(line)) {
      blocks.push(<hr key={kb} className="kt-md-hr" />)
      i++
      continue
    }

    // 引用块
    if (RE_QUOTE.test(line)) {
      const buf: string[] = []
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(RE_QUOTE.exec(lines[i])![1])
        i++
      }
      blocks.push(
        <blockquote key={kb} className="kt-md-quote">
          {buf.map((l, j) => (
            <span key={j}>{inline(l, hl, `${kb}q${j}`, onWikiSelect)}</span>
          ))}
        </blockquote>,
      )
      continue
    }

    // 列表（无序 / 有序 / 任务项，扁平一层，足够覆盖知识卡的书写习惯）
    const ul = RE_LI_UL.exec(line)
    const ol = RE_LI_OL.exec(line)
    if (ul || ol) {
      const ordered = Boolean(ol)
      const items: ReactNode[] = []
      while (i < lines.length) {
        const mm = (ordered ? RE_LI_OL : RE_LI_UL).exec(lines[i])
        if (!mm) break
        let content: ReactNode = inline(mm[1], hl, `${kb}l${items.length}`, onWikiSelect)
        const task = RE_TASK.exec(mm[1])
        if (task && !ordered) {
          content = (
            <>
              <span className={`kt-md-task${task[1].toLowerCase() === 'x' ? ' kt-md-task--done' : ''}`}>
                {task[1].toLowerCase() === 'x' ? '☑' : '☐'}
              </span>{' '}
              {inline(task[2], hl, `${kb}l${items.length}`, onWikiSelect)}
            </>
          )
        }
        items.push(<li key={items.length}>{content}</li>)
        i++
      }
      blocks.push(ordered ? <ol key={kb} className="kt-md-list">{items}</ol> : <ul key={kb} className="kt-md-list">{items}</ul>)
      continue
    }

    // 表格（表头 + |---| 分隔行才启用，其余按段落处理）
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const cells = (l: string) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
      const header = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      blocks.push(
        <div key={kb} className="kt-md-tablewrap">
          <table className="kt-md-table">
            <thead>
              <tr>{header.map((c, j) => <th key={j}>{inline(c, hl, `${kb}th${j}`, onWikiSelect)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, hl, `${kb}td${j}-${k}`, onWikiSelect)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // 段落：连续非空且非块起始的行
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    const nodes: ReactNode[] = []
    para.forEach((l, j) => {
      if (j > 0) nodes.push(<br key={`${kb}br${j}`} />)
      nodes.push(...inline(l, hl, `${kb}t${j}`, onWikiSelect))
    })
    blocks.push(<p key={kb} className="kt-md-p">{nodes}</p>)
  }
  return <div className="kt-md">{blocks}</div>
}
