// 质量链 fetch provider：接管宿主 web_fetch（替代基础 http provider）。
// T1 直连（跟随重定向，仅文本类内容）→ T2 exa contents（$1/1000 页，清洗正文 markdown，文本质量好且便宜）
// → T3 firecrawl（Markdown，反爬/JS/PDF）→ T4 crawl4ai（Markdown 备份）。
// firecrawl 额度保护：仅在前层（直连/exa）失败时才走；exa 失败静默降级不抛。
// 契约：WebFetchResult { url, statusCode, body: {kind:'html'|'text', content}, truncated }（CLOSED 联合类型）。
// ponytail: 无服务级令牌桶——web_fetch 为单发用户/agent 驱动调用，非扇出；若未来批量调用再引入共享调度。

import https from "node:https";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callExa, callFirecrawl, callCrawl4ai } from "./fetch_upstream.js";
import { stripLoneSurrogates } from "./safe_text.js";
import { assertPublicUrl, safeLookup } from "./ssrf.js";

const T1_MIN_CHARS = 300;
const TEXTUAL = /text\/|json|xml|javascript|application\/json/i;

// ---------- T1.5：系统浏览器无头渲染（执行 JS 过挑战；无浏览器/失败/超时则静默跳过） ----------
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
let cachedBrowserPath; // undefined = 未检测；null = 无浏览器
function findSystemBrowser() {
  if (cachedBrowserPath !== undefined) return cachedBrowserPath;
  cachedBrowserPath = null;
  for (const p of BROWSER_CANDIDATES) {
    try {
      if (existsSync(p)) {
        cachedBrowserPath = p;
        break;
      }
    } catch {
      // 忽略检测错误
    }
  }
  return cachedBrowserPath;
}

function browserDumpDom(browserPath, url, { timeoutMs = 25000, signal } = {}) {
  return new Promise((resolve) => {
    // 独立 user-data-dir：避免与用户正在运行的浏览器实例抢同一 profile（共享 profile 时无输出/立即退出）
    let tmpDir;
    let child;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), "dshfs-browser-"));
      child = spawn(browserPath, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-sandbox",
        // 抑制崩溃上报/组件更新/账号同步：Windows 实测这些会在 tmp profile 下反复报错
        // （Crashpad settings.dat 写入失败、get_updates failed）并偶发导致退出码异常/无输出
        "--disable-breakpad",
        "--disable-crashpad",
        "--disable-component-update",
        "--disable-sync",
        `--user-data-dir=${tmpDir}`,
        "--dump-dom",
        "--virtual-time-budget=10000",
        url,
        // POSIX 下让浏览器自立进程组：killTree 才能整组杀（渲染子进程随组一起走），
        // 也不会被宿主的 Ctrl+C 误伤（浏览器生命周期由本函数自己管）。
      ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
    } catch {
      if (tmpDir) try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
      resolve(null);
      return;
    }
    let out = "";
    let done = false;
    // 杀整棵进程树：Edge/Chrome 是多进程架构，child.kill() 只杀主进程会残留渲染子进程
    // (#74) taskkill 只存在于 Windows；POSIX 走独立进程组整组 SIGKILL。
    //      另：spawn 的失败是异步 'error' 事件，同步 try/catch 抓不到——不挂监听器会升级成
    //      uncaughtException 把 dsh 宿主整个带走，所以 taskkill 必须挂 on("error") 并 unref。
    const killTree = () => {
      const fallback = () => { try { child.kill("SIGKILL"); } catch { /* 忽略 */ } };
      if (process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); } // 组已退出时 ESRCH，交给 fallback
        catch { fallback(); }
        return;
      }
      try {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", fallback);
        killer.unref();
      } catch {
        fallback();
      }
    };
    const finish = (ok) => {
      if (done) return;
      done = true;
      killTree();
      if (tmpDir) {
        // 浏览器进程退出后才能删 profile 目录；延迟清理，失败无所谓
        setTimeout(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ } }, 500);
      }
      resolve(ok && out.length > 0 ? out : null);
    };
    child.stdout.on("data", (c) => {
      if (out.length < 5 * 1024 * 1024) out += c.toString("utf8");
    });
    // stderr 必须 pipe 且读取丢弃：Windows 上 Edge 无头模式 stderr 指向 NUL 会卡死（实测 exit=1/0 输出）
    child.stderr.on("data", () => {});
    child.on("error", () => finish(false));
    // 以 exit 为准：Edge/Chrome 的渲染子进程会继承 stdout pipe，"close" 可能迟迟不触发；
    // 稍等 200ms 让残余数据 flush 到齐（exit 与 stdout 到达之间有窗口）。
    child.on("exit", (code) => {
      setTimeout(() => finish(code === 0 || out.length > 0), 200);
    });
    setTimeout(() => finish(false), timeoutMs);
    if (signal) {
      if (signal.aborted) finish(false);
      else signal.addEventListener("abort", () => finish(false), { once: true });
    }
  });
}

// #88：按声明的 charset 解码。GBK/GB2312/Big5/Shift_JIS 老站很常见，
// 一律当 UTF-8 会得到整页 \uFFFD，而且不会报错、不会降级，模型直接吃一页乱码。
function parseCharset(contentType) {
  const match = /charset\s*=\s*"?([^";\s]+)"?/i.exec(String(contentType || ""));
  return match ? match[1].trim().toLowerCase() : "";
}

function sniffHtmlCharset(buffer) {
  const head = buffer.subarray(0, 2048).toString("latin1");
  let match = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head);
  if (match) return match[1].toLowerCase();
  match = /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w.:-]+)/i.exec(head);
  return match ? match[1].toLowerCase() : "";
}

function decodeBody(buffer, contentType) {
  let label = parseCharset(contentType);
  if (!label && /html|xml/i.test(String(contentType || ""))) label = sniffHtmlCharset(buffer);
  if (!label) label = "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(buffer);
  } catch {
    // 无法识别的 label（或该 Node 没编进对应编码表）：退回 UTF-8，不抛错。
    return buffer.toString("utf8");
  }
}

/** GET 跟随重定向（≤5 跳），返回最终 URL / 状态 / 正文 / 内容类型；支持 gzip/br/deflate 解压。 */
export function httpsGetFollow(url, { headers = {}, timeoutMs = 20000, signal, lookup } = {}, transport = https) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let activeReq = null;
    let activeRes = null;
    let activeStream = null;

    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const settle = (ok, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) resolve(value);
      else reject(value);
    };
    const destroyActive = () => {
      for (const target of [activeStream, activeRes, activeReq]) {
        try {
          target?.destroy?.(new Error("aborted"));
        } catch {
          // 忽略清理失败
        }
      }
    };
    const onAbort = () => {
      destroyActive();
      settle(false, signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
    };

    if (signal) {
      if (signal.aborted) {
        settle(false, new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const hop = (current, left) => {
      if (settled) return;
      let target;
      try {
        target = new URL(current);
      } catch (error) {
        settle(false, error);
        return;
      }
      const req = transport.request(
        {
          hostname: target.hostname,
          port: target.port || (target.protocol === "http:" ? 80 : 443),
          path: target.pathname + target.search,
          method: "GET",
          headers,
          timeout: timeoutMs,
          ...(lookup ? { lookup } : {}),
        },
        (res) => {
          activeRes = res;
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && left > 0) {
            res.resume();
            return hop(new URL(res.headers.location, current).toString(), left - 1);
          }

          const enc = String(res.headers["content-encoding"] || "").toLowerCase();
          let stream = res;
          try {
            if (enc.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
            else if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
            else if (enc.includes("deflate")) stream = res.pipe(zlib.createInflate());
          } catch {
            stream = res;
          }
          activeStream = stream;

          const chunks = [];
          // 压缩响应的解压流感知不到上游 res 的销毁：pipe 不转发 error/close，
          // 对端中途断连时解压流既不 end 也不 error，Promise 会永久挂起（#87）。
          // 因此 body 的失败必须从 res 侧判定，并主动销毁解压流。
          const bodyGone = (reason) => {
            if (settled) return;
            try {
              stream.destroy?.();
            } catch {
              // 忽略
            }
            settle(false, reason instanceof Error ? reason : new Error(String(reason)));
          };
          res.on("aborted", () => bodyGone(new Error("connection aborted while reading the response body")));
          res.on("error", (error) => bodyGone(error));
          res.on("close", () => {
            if (!res.complete) bodyGone(new Error("connection closed before the response body completed"));
          });

          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () =>
            settle(true, {
              url: current,
              status: res.statusCode,
              text: decodeBody(Buffer.concat(chunks), res.headers["content-type"] || ""),
              contentType: res.headers["content-type"] || "",
            })
          );
          stream.on("error", (error) => settle(false, error));
        }
      );
      activeReq = req;
      req.on("timeout", () => {
        req.destroy(new Error(`timeout after ${timeoutMs}ms`));
        settle(false, new Error(`timeout after ${timeoutMs}ms`));
      });
      req.on("error", (error) => settle(false, error));
      req.end();
    };

    try {
      hop(url, 5);
    } catch (error) {
      settle(false, error);
    }
  });
}

// 完整浏览器请求头（Chrome 128 形态）：部分反爬站（如百度系）对精简头直接 403，完整头可通过。
// Accept-Language 不在这里：它跟随 lang（#92），由调用方逐次传入，否则日语环境抓到的仍是中文版页面。
// 注意：声明了 Accept-Encoding 就必须解压（httpsGetFollow 已支持 gzip/br/deflate）。
const BROWSERISH = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/** 请求头：Accept-Language 跟随调用方（#92），其余固定为浏览器形态。 */
export function browserishHeaders(acceptLanguage = "en-US,en;q=0.9") {
  return { ...BROWSERISH, "Accept-Language": String(acceptLanguage ?? "").trim() || "en-US,en;q=0.9" };
}
export function createFetchProvider({
  resolveApiKey,
  logger,
  acceptLanguage = () => "en-US,en;q=0.9",
  browserEnabled = () => true,
  prefer = () => "exa",
  validateUrl = assertPublicUrl,
}) {
  return {
    id: "fs-quality-fetch",
    /** 廉价本地可用性检查（seam 契约要求，禁止网络调用）。 */
    available() { return true; },
    async fetch(request, signal) {
      const url = String(request?.url || "");
      if (!/^https:\/\//i.test(url)) throw new Error(`fs-quality-fetch: only https URLs are supported (got "${url.slice(0, 60)}")`);
      // SSRF guard: never fetch loopback / private / metadata addresses, and use a
      // lookup that re-checks every redirect hop.
      await validateUrl(url);
      const errors = [];

      // T1：直连（文本类内容；二进制交给后层——exa 取正文，PDF 等仍由 firecrawl 处理）
      try {
        const r = await httpsGetFollow(url, { headers: browserishHeaders(acceptLanguage()), signal, lookup: safeLookup });
        if (r.status < 400 && TEXTUAL.test(r.contentType) && r.text.length >= T1_MIN_CHARS) {
          return { url: r.url, statusCode: r.status, body: { kind: "html", content: stripLoneSurrogates(r.text) }, truncated: false };
        }
        if (r.status >= 400) errors.push(`direct HTTP ${r.status}`);
        else errors.push(`direct: ${r.contentType || "unknown type"} ${r.text.length}B`);
      } catch (e) { errors.push(`direct: ${e.message}`); }

      // T1.5：系统浏览器无头渲染（执行 JS 过挑战，抓直连拿不到的页面；无浏览器或设置里关掉时跳过）
      const browserPath = findSystemBrowser();
      if (browserEnabled() && browserPath) {
        try {
          const html = await browserDumpDom(browserPath, url, { signal });
          if (html && html.length >= T1_MIN_CHARS && !/403 Forbidden|\bcaptcha\b/i.test(html.slice(0, 3000))) {
            return { url, statusCode: 200, body: { kind: "html", content: stripLoneSurrogates(html) }, truncated: false };
          }
          errors.push(html ? `browser: short or challenge page (${html.length}B)` : "browser: no output (timeout or launch failure)");
        } catch (e) {
          errors.push(`browser: ${e.message}`);
        }
      }

      // T2/T3：exa 与 firecrawl 的先后顺序可在设置页切换；crawl4ai 固定最后。
      const exaTier = async () => {
        const exaKey = await resolveApiKey("EXA_API_KEY", "exaApiKey").catch(() => undefined);
        if (!exaKey) return null;
        try {
          const text = await callExa(url, exaKey, signal);
          if (text.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: stripLoneSurrogates(text) }, truncated: false };
          errors.push("exa: short content");
        } catch (e) { errors.push(`exa: ${e.message}`); }
        return null;
      };
      const firecrawlTier = async () => {
        const firecrawlKey = await resolveApiKey("FIRECRAWL_API_KEY", "firecrawlApiKey").catch(() => undefined);
        if (!firecrawlKey) return null;
        try {
          const md = await callFirecrawl(url, firecrawlKey, signal);
          if (md.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: stripLoneSurrogates(md) }, truncated: false };
          errors.push("firecrawl: short content");
        } catch (e) { errors.push(`firecrawl: ${e.message}`); }
        return null;
      };
      const order = prefer() === "firecrawl" ? [firecrawlTier, exaTier] : [exaTier, firecrawlTier];
      for (const tier of order) {
        const hit = await tier();
        if (hit) return hit;
      }

      const crawl4aiKey = await resolveApiKey("CRAWL4AI_API_KEY", undefined).catch(() => undefined);
      if (crawl4aiKey) {
        try {
          const text = await callCrawl4ai(url, crawl4aiKey, signal);
          if (text.trim().length >= T1_MIN_CHARS) return { url, statusCode: 200, body: { kind: "text", content: stripLoneSurrogates(text) }, truncated: false };
          errors.push("crawl4ai: short content");
        } catch (e) { errors.push(`crawl4ai: ${e.message}`); }
      }

      logger?.warn?.(`fs-quality-fetch: all tiers failed for ${url}: ${errors.join("; ")}`);
      throw new Error(`fs-quality-fetch: could not fetch ${url} (${errors.join("; ")})`);
    },
  };
}
