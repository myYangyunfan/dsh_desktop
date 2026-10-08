import type { Context } from '../context-types.ts';
import './layout.css';
/** Services required before mounting (provided by the client runtime; the
 *  locale service backs the sidebar's copy — see locales.ts). `modules`
 *  (rc.8+) is the client module system the chunk loader resolves its
 *  externals through; `connection` (0.1.2-alpha.2+) is the Remote transport's
 *  recovery lifecycle the side chat's disconnect banner reads — Cordis guards
 *  service access without inject.
 *
 *  `remote` / `remote.session` (0.1.7) are the Host Remote namespace the
 *  "open in app" adapter calls (`canOpenWorkspacePath` /
 *  `workspacePathApplications` / `openWorkspacePath`). BOTH entries are
 *  required: Cordis validates the nested property access
 *  (`ctx.get('remote').session`) against the inject list, and a missing
 *  entry throws `cannot get property "remote.session" without inject` —
 *  which, thrown from a render path, blanks the whole sidebar panel. */
export declare const inject: string[];
/**
 * Error boundary over the sidebar tree (root scope): a render error in the
 * sidebar SHELL itself must never blank the page silently — the shared
 * RenderBoundary shows a dismissible error strip and logs the stack. The
 * per-tab scope (Sidebar.tsx) catches viewer/editor crashes first; this root
 * boundary stays as the last resort for Workbench/shell errors.
 */
/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions).
 */
export declare function apply(ctx: Context): void;
