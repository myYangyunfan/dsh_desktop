/**
 * The 3 built-in file viewer descriptors (markdown / html / code), exactly
 * like external plugins register theirs.
 *
 * DSH 0.1.7 ships `ui-sidebar-documentpreview`, its own code / spreadsheet /
 * office / pdf / image / html / markdown / text previews with zoom and
 * auto-refresh, so this plugin yields every READ-ONLY preview it used to own
 * and keeps only the surfaces where it is not equivalent:
 *  - `markdown` — this plugin's own renderer (front matter, embedded HTML
 *    sanitation, floating TOC), which the user prefers to the host's;
 *  - `html` — the sandboxed iframe preview plus the host-less
 *    `htmlViewerNoSandbox` / `htmlViewerDefaultUnsafe` escape hatches;
 *  - `code` — the catch-all (`exts: []`, lowest priority) that claims any
 *    file no other viewer did, and it is an EDITABLE CodeMirror with save —
 *    the host's equivalents are read-only previews.
 * The yielded ids (image / pdf / binary-download) are deliberately NOT
 * registered here; an external plugin may still claim them through this
 * service. Office previews (.docx / .xlsx / .pptx) were already not built
 * in — they live in the recommended office plugin (see plugins-viewers.ts),
 * which registers the same ids through this service.
 *
 * The heavy viewers (the CodeMirror-backed markdown/html/code) render
 * through {@link lazyChunkComponent} wrappers — their libraries are fetched
 * only when such a file is first opened (see chunk-loader.ts). The
 * descriptor metadata (id/exts/priority) is identical either way, so
 * matching semantics and external-plugin overrides are unaffected; the
 * `component` wrapper keeps the descriptor contract `(props) => ReactNode`.
 *
 * Every viewer carries the declarative settings-surface fields — `title`
 * and `icon` — so the Side card settings page can render the enable/disable
 * inventory without hardcoding (eating our own dogfood).
 */
import { IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { lazyChunkComponent } from '../lazy-chunk.tsx'
import {
  IconMarkdownOutline16,
  IconHtmlOutline16,
} from '../icons.tsx'
import type { ComponentType, ReactNode } from 'react'
import type { FileViewerDescriptor, FileViewerProps } from '../service.ts'
import { t } from '../locales.ts'
import css from '../sidebar.module.css'

/**
 * Lazy wrapper over the chunk-resident viewer component. The `pick`
 * function is module-level (stable identity — the wrapper effect depends
 * on it); the cast bridges the chunk exports record to the descriptor prop
 * shape (the view reads only its own subset of FileViewerProps).
 */
/**
 * Read-only fallback renderer for the editor chunk. `fsRead` has already put
 * the file's text in the props, so a chunk that cannot load (kernel restart
 * window, missing bundle route) degrades to a plain `<pre>` preview instead of
 * hiding the file — issue #171's "the file is always visible" half.
 */
function TextFallback(props: FileViewerProps): ReactNode {
  const content = props.content ?? ''
  return (
    <>
      {props.truncated === true && <div className={css.editorBanner}>{t('truncation')}</div>}
      <pre
        style={{
          margin: 0,
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'auto',
          font: 'var(--dsw-font-markdown-code-block-small, 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace)',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          padding: '10px 14px',
          userSelect: 'text',
        }}
      >
        {content}
      </pre>
    </>
  )
}

const LazyTextEditor = lazyChunkComponent<FileViewerProps>(
  'editor',
  (mod) => mod.TextEditor as ComponentType<FileViewerProps> | undefined,
  TextFallback,
)

/** The 3 built-in file viewer descriptors. */
export function builtinViewers(): readonly FileViewerDescriptor[] {
  return [
    {
      id: 'markdown',
      title: () => t('viewerMarkdown'),
      icon: (size: number) => <IconMarkdownOutline16 size={size} />,
      exts: ['md', 'markdown'],
      fetchStrategy: 'fsRead',
      component: (props) => <LazyTextEditor {...props} />,
    },
    {
      id: 'html',
      title: () => t('viewerHtml'),
      icon: (size: number) => <IconHtmlOutline16 size={size} />,
      exts: ['html', 'htm'],
      fetchStrategy: 'fsRead',
      // Declarative settings: the sandbox escape hatch and the default-unsafe
      // start state render under this viewer's row in the Side card settings
      // page (both warned on).
      settings: {
        toggles: [{
          key: 'htmlViewerNoSandbox',
          title: () => t('settingsHtmlSandboxTitle'),
          desc: () => t('settingsHtmlSandboxDesc'),
        }, {
          key: 'htmlViewerDefaultUnsafe',
          title: () => t('settingsHtmlDefaultUnsafeTitle'),
          desc: () => t('settingsHtmlDefaultUnsafeDesc'),
        }],
      },
      component: (props) => <LazyTextEditor {...props} />,
    },
    {
      id: 'code',
      title: () => t('viewerCode'),
      icon: (size: number) => <IconCodeOutlineRegular size={size} />,
      exts: [],
      priority: -100,
      fetchStrategy: 'fsRead',
      component: (props) => <LazyTextEditor {...props} />,
    },
  ]
}
