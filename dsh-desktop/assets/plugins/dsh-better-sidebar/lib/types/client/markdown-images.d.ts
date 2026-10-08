/**
 * Markdown-preview local-image resolution. The shared `MarkdownText` (from
 * @deepseek-ai/dsh-client-ui-primitives) only renders absolute http(s) image
 * URLs — relative links are disabled for chat security — so a local image in
 * a previewed `.md` (`![alt](./img.png)`, an absolute `/cwd/img.png`, or a
 * reference definition) would otherwise fall back to its alt text. This
 * dependency-free helper rewrites those destinations into absolute
 * `/sidebar/file` media URLs (prefixed with the GUI's own origin) so
 * `MarkdownText` accepts them; the host media route then serves the bytes,
 * still restricted to files under the session cwd.
 */
import type { SessionScope } from './api.ts';
/**
 * Rewrite markdown image destinations that point at local files into
 * absolute `/sidebar/file` media URLs. Relative destinations resolve against
 * the opened file's directory (normalizing `.`/`..` segments); absolute
 * local paths pass through. Remote (http/https/data/mailto) and `#`-anchor
 * destinations are left untouched for `MarkdownText`. Reference-style images
 * (`![x][id]` + `[id]: url`) are covered by rewriting their definition lines.
 *
 * Code spans (`` `...` ``) and fenced code blocks (``` ```...``` ```) are
 * masked before rewriting so documentation that demonstrates `![alt](./img.png)`
 * is not mutated into a `/sidebar/file` URL. Reference definitions are only
 * rewritten when their label is actually referenced by an image (collapsed
 * `[![][id]]`, full `![alt][id]`, or shortcut `![]` referencing the next
 * definition) — a plain link `[text][id]` must not have its destination
 * redirected to the media route.
 * @param text - The raw markdown source (inline + reference images).
 * @param scope - The session scope (sessionId + cwd) for the media route.
 * @param filePath - The absolute path of the opened `.md` file.
 * @param origin - The GUI's own origin (`window.location.origin`); injected
 * so the core rewrite stays pure and unit-testable.
 * @returns The markdown with local image destinations rewritten in place.
 */
/**
 * Resolve one media destination against the session's media route: local
 * (relative or absolute) paths become absolute `/sidebar/file` URLs (prefixed
 * with the GUI's own origin so the shared MarkdownText http(s) allowlist
 * accepts them), while remote URLs, `#`-anchors and empty destinations are
 * returned untouched. Shared by the markdown image rewriter below and by the
 * preview's raw-HTML sanitizer (`markdown-html.tsx`, which meets the same
 * allowlist when rendering `<img src="./x.png">` inside HTML blocks).
 */
export declare function resolveLocalMediaDest(dest: string, scope: SessionScope, filePath: string, origin: string): string;
export declare function rewriteLocalImageUrls(text: string, scope: SessionScope, filePath: string, origin: string): string;
