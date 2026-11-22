// research 文档持久缓存（node:sqlite，零依赖）。Node <22.5 无 node:sqlite 时整体降级为 no-op，插件照常工作。
// ponytail: cache_search 用 LIKE 而非 FTS5 MATCH——个人规模（百级行）LIKE 即时返回，且无 FTS5 查询语法转义坑；行数过万再升 FTS5 虚表。

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let db = null;
try {
  const req = createRequire(import.meta.url);
  const { DatabaseSync } = req("node:sqlite");
  // 缓存位置可配置：RESEARCH_CACHE_DIR 优先（放哪、是否随备份走由用户决定），
  // 默认 ~/.cache/dsh-free-search/research.db；删掉该目录即清空缓存，无后台任务残留。
  const dir = process.env.RESEARCH_CACHE_DIR
    || (process.env.DSH_HOME
      ? join(process.env.DSH_HOME, "cache", "dsh-free-search")
      : join(homedir(), ".cache", "dsh-free-search"));
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(join(dir, "research.db"));
  db.exec("CREATE TABLE IF NOT EXISTS pages(url TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, fetched_at INTEGER NOT NULL)");
} catch { /* Node <22.5：缓存禁用 */ }

/** 新鲜则返回 {title, content, fetched_at}，否则 null。 */
export function getFresh(url, maxAgeMs) {
  if (!db) return null;
  const r = db.prepare("SELECT title, content, fetched_at FROM pages WHERE url = ?").get(url);
  if (!r || Date.now() - r.fetched_at > maxAgeMs) return null;
  return r;
}

export function put(url, title, content) {
  if (!db) return;
  db.prepare("DELETE FROM pages WHERE url = ?").run(url);
  db.prepare("INSERT INTO pages(url, title, content, fetched_at) VALUES (?, ?, ?, ?)").run(url, title || "", content, Date.now());
}

/** 全文 LIKE 检索已缓存页面（7 天内），返回 [{url, title, excerpt, fetched_at}]。 */
const STALE_MS = 7 * 24 * 3600 * 1000; // 与 research.js 的 DOC_CACHE_MAX_AGE_MS 对齐
export function search(query, limit = 8) {
  if (!db) return [];
  db.prepare("DELETE FROM pages WHERE fetched_at < ?").run(Date.now() - STALE_MS); // ponytail: 查询时惰性 GC，无后台任务
  const like = `%${String(query).replace(/[%_]/g, " ")}%`; // ponytail: 通配符转空格而非 ESCAPE 子句，查询词含 %/_ 属罕见
  const rows = db
    .prepare("SELECT url, title, content, fetched_at FROM pages WHERE (title LIKE ? OR content LIKE ?) AND fetched_at > ? ORDER BY fetched_at DESC LIMIT ?")
    .all(like, like, Date.now() - STALE_MS, limit);
  return rows.map((r) => {
    const i = r.content.toLowerCase().indexOf(String(query).toLowerCase());
    const start = Math.max(0, i - 40);
    return { url: r.url, title: r.title, excerpt: (start > 0 ? "…" : "") + r.content.slice(start, start + 160).replace(/\s+/g, " "), fetched_at: new Date(r.fetched_at).toISOString() };
  });
}
