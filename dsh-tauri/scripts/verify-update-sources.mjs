#!/usr/bin/env node
// verify-update-sources.mjs — DSH Desktop 自动更新双源（GitHub + Gitee）只读核验
//
// 用途：发布后人工/CI 核验自动更新链路的两个 release 源是否健康、镜像是否
// 漂移、sha256 边车是否齐全且格式正确。全程只读（GET/HEAD），绝不写远端。
//
// 用法（无第三方依赖，Node ≥ 18；Windows/macOS/Linux 均可）：
//   node dsh-tauri/scripts/verify-update-sources.mjs
//   node dsh-tauri/scripts/verify-update-sources.mjs --expect-version 0.5.2
//   node dsh-tauri/scripts/verify-update-sources.mjs --repo myYangyunfan/dsh_desktop \
//       --gitee-repo my-yang-yunfan/dsh_desktop --expect-version v0.5.2
//   node dsh-tauri/scripts/verify-update-sources.mjs --test   # 离线自检（无网络）
//
// 检查项：
//   1. GitHub releases/latest 与 Gitee releases/latest 的 tag 必须一致
//      （不一致 = 镜像漂移，硬错）；--expect-version 给出时两侧都必须等于它。
//   2. 资产对照表：Gitee 缺失 >100MB 主资产属预期（Gitee 单附件上限，
//      壳侧回落 GitHub 源）；缺失小资产 = WARN；Gitee 多出的 tag 源码包
//      （v*.zip / v*.tar.gz）属平台行为，不算异常。
//   3. 每个 GitHub 主资产：
//      - 有 .sha256 边车 → 下载边车校验格式（首段 64 位小写 hex），并与
//        GitHub API 的 digest 字段（sha256:...）交叉核对——不下载主资产本体
//        即可端到端确认「边车哈希 == 已上传资产哈希」；
//      - 无边车 → WARN（≤v0.5.2 的兼容期，壳侧仅有 size 兜底）。
//      - HEAD 主资产下载 URL（跟随重定向）核对 content-length == API size。
//   4. 双侧镜像资产 HEAD 核对（Gitee 侧下载 URL 的最终 content-length 必须与
//      GitHub API size 一致，防镜像内容截断/损坏）。
//
// 退出码：0 = 无硬错（允许纯 WARN/INFO）；1 = 存在硬错（API 不可达 / tag 漂移 /
//         边车格式坏 / 哈希不符 / 大小不符 / 参数错）。
//
// 网络说明：
//   · 纯 node:http(s) 实现，尊重 HTTP_PROXY / HTTPS_PROXY / http_proxy /
//     https_proxy / NO_PROXY（https 目标经 CONNECT 隧道）。
//   · 企业内网/本机加速器 MITM 证书不在 Node 内置根时，用 Node 原生开关：
//     NODE_USE_SYSTEM_CA=1（或 node --use-system-ca），或 NODE_EXTRA_CA_CERTS
//     指向企业根证书。脚本不降低 TLS 校验强度（绝不 rejectUnauthorized:false）。
//   · HEAD 因网络不可达失败记 WARN（CN 环境常见，GitHub CDN 可能连不上）；
//     content-length 不符才是硬错。

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// ── 默认参数（与壳侧更新器 REPO_URLS 同源）─────────────────────────────────
const DEFAULT_GITHUB_REPO = 'myYangyunfan/dsh_desktop';
const DEFAULT_GITEE_REPO = 'my-yang-yunfan/dsh_desktop';
const GITEE_FILE_LIMIT = 104857600; // Gitee 单附件 100MB 上限（字节）
const HEAD_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 6;

// ── 参数解析 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    repo: DEFAULT_GITHUB_REPO,
    giteeRepo: DEFAULT_GITEE_REPO,
    expectVersion: null,
    test: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--repo': out.repo = argv[++i]; break;
      case '--gitee-repo': out.giteeRepo = argv[++i]; break;
      case '--expect-version': case '--expect': out.expectVersion = argv[++i]; break;
      case '--test': out.test = true; break;
      case '--help': case '-h': out.help = true; break;
      default:
        throw new Error(`未知参数: ${a}（--help 查看用法）`);
    }
  }
  if (out.expectVersion) out.expectVersion = normalizeVersion(out.expectVersion);
  return out;
}

/** 「v0.5.2」/「0.5.2」→ 统一比较用纯版本号；「v0.5.2」→ tag 用原名。 */
function normalizeVersion(v) {
  return String(v).trim().replace(/^v/i, '');
}

// ── 代理感知的 HTTP(S) 客户端 ───────────────────────────────────────────────
function proxyFor(targetUrl) {
  const u = new URL(targetUrl);
  if (isNoProxy(u.hostname)) return null;
  const proto = u.protocol === 'https:' ? 'https' : 'http';
  const env = process.env[`${proto}_proxy`] || process.env[`${proto}_proxy`.toUpperCase()];
  return env ? new URL(env) : null;
}

function isNoProxy(hostname) {
  const list = (process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.some(pat =>
    pat === '*' || hostname.toLowerCase() === pat ||
    hostname.toLowerCase().endsWith(`.${pat}`));
}

/** 发起一次请求（不跟随重定向）。返回 {status, headers, body?}。 */
function requestOnce(urlStr, { method = 'GET', headers = {}, timeoutMs = HEAD_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const proxy = proxyFor(urlStr);
    const finish = (req, res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        url: urlStr,
      }));
      req.setTimeout(timeoutMs, () => { req.destroy(new Error(`超时（${timeoutMs}ms）: ${method} ${urlStr}`)); });
    };
    const opts = { method, headers: { 'User-Agent': 'dsh-verify-update-sources/1.0', ...headers }, timeout: timeoutMs };
    if (proxy && target.protocol === 'https:') {
      // CONNECT 隧道：代理代理解析目标域名（本机 hosts 劫持不影响）
      const connectReq = http.request({
        host: proxy.hostname, port: proxy.port || 80,
        method: 'CONNECT', path: `${target.hostname}:443`, timeout: timeoutMs,
      });
      connectReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error(`代理 CONNECT 失败: ${res.statusCode}`)); return;
        }
        const req = https.request({ ...opts, socket, servername: target.hostname,
          host: target.hostname, port: 443, path: target.pathname + target.search });
        req.on('response', r => finish(req, r));
        req.on('error', reject);
        req.end();
      });
      connectReq.on('error', reject);
      connectReq.on('timeout', () => connectReq.destroy(new Error('代理 CONNECT 超时')));
      connectReq.end();
    } else if (proxy) {
      const req = http.request({ ...opts,
        host: proxy.hostname, port: proxy.port || 80,
        path: urlStr, headers: { ...opts.headers, Host: target.hostname } });
      req.on('response', r => finish(req, r));
      req.on('error', reject);
      req.end();
    } else {
      const lib = target.protocol === 'https:' ? https : http;
      const req = lib.request({ ...opts, host: target.hostname, port: target.port ||
        (target.protocol === 'https:' ? 443 : 80), path: target.pathname + target.search });
      req.on('response', r => finish(req, r));
      req.on('error', reject);
      req.end();
    }
  });
}

/** GET JSON（不跟随跨主机重定向——两侧 API 均直接 200）。 */
async function fetchJson(urlStr, headers) {
  const r = await requestOnce(urlStr, { method: 'GET', headers });
  if (r.status !== 200) {
    throw new Error(`API ${urlStr} 返回 ${r.status}: ${r.body.toString('utf8').slice(0, 200)}`);
  }
  return JSON.parse(r.body.toString('utf8'));
}

/** HEAD 跟随重定向（≤6 跳）。返回 {status, contentLength, finalUrl} 或抛传输错。 */
async function headWithRedirects(urlStr) {
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await requestOnce(current, { method: 'HEAD' });
    const loc = r.headers.location;
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return {
      status: r.status,
      contentLength: r.headers['content-length'] != null ? Number(r.headers['content-length']) : null,
      finalUrl: current,
    };
  }
  throw new Error(`重定向超过 ${MAX_REDIRECTS} 跳: ${urlStr}`);
}

/** GET 小文件（边车，百来字节），跟随重定向（≤6 跳）。GitHub release/download
 * 端点必然 302 到 release-assets 边缘节点——不跟随就会把正常发布误报成硬错。 */
async function fetchSmallText(urlStr, maxBytes = 4096) {
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await requestOnce(current, { method: 'GET' });
    const loc = r.headers.location;
    if ([301, 302, 303, 307, 308].includes(r.status) && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    if (r.status !== 200) throw new Error(`下载边车返回 ${r.status}: ${urlStr}`);
    if (r.body.length > maxBytes) throw new Error(`边车异常大（${r.body.length} 字节 > ${maxBytes}）: ${urlStr}`);
    return r.body.toString('utf8');
  }
  throw new Error(`重定向超过 ${MAX_REDIRECTS} 跳: ${urlStr}`);
}

// ── 边车/资产解析（纯函数，供 --test 复用）─────────────────────────────────
/** 边车内容 → 首段 64 位小写 hex；格式坏返回 null。规范：`<64hex>[ 尾注]`。 */
function parseSidecarHash(text) {
  const m = /^[ \t]*([0-9a-f]{64})(?=[ \t\r\n]|$)/.exec(String(text));
  return m ? m[1] : null;
}

/** GitHub API digest 字段（"sha256:<hex>"）→ hex；无/格式坏返回 null。 */
function parseDigest(digest) {
  if (!digest) return null;
  const m = /^sha256:([0-9a-f]{64})$/.exec(String(digest).trim());
  return m ? m[1] : null;
}

const isSidecarName = name => String(name).endsWith('.sha256');
const isGiteeSourceArchive = name => /^v[^/]+\.(zip|tar\.gz)$/.test(String(name));

// ── 结果收集 ────────────────────────────────────────────────────────────────
const report = { fail: 0, warn: 0, lines: [] };
function fail(msg) { report.fail++; console.log(`  [FAIL] ${msg}`); }
function warn(msg) { report.warn++; console.log(`  [WARN] ${msg}`); }
function info(msg) { console.log(`  [INFO] ${msg}`); }
function ok(msg) { console.log(`  [OK]   ${msg}`); }

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`用法: node verify-update-sources.mjs [--repo <owner/name>] [--gitee-repo <owner/name>] [--expect-version <x.y.z|vx.y.z>] [--test]
默认: --repo ${DEFAULT_GITHUB_REPO} --gitee-repo ${DEFAULT_GITEE_REPO}
检查: 双源 latest tag 一致性 / 资产对照 / .sha256 边车格式与 digest 交叉核对 / HEAD content-length
退出: 0=通过（允许 WARN），1=存在硬错`);
    return 0;
  }
  if (args.test) return selfTest();

  const ghHeaders = { Accept: 'application/vnd.github+json' };
  const ghApi = `https://api.github.com/repos/${args.repo}/releases/latest`;
  const geeApi = `https://gitee.com/api/v5/repos/${args.giteeRepo}/releases/latest`;

  console.log(`== DSH Desktop 自动更新双源核验 ==`);
  console.log(`GitHub: ${args.repo}\nGitee : ${args.giteeRepo}${args.expectVersion ? `\n期望版本: ${args.expectVersion}` : ''}\n`);

  // 1. 拉双侧 latest release
  let gh, gee;
  console.log('[1/4] 拉取双侧 releases/latest ...');
  try {
    gh = await fetchJson(ghApi, ghHeaders);
    ok(`GitHub latest: ${gh.tag_name}（${(gh.assets || []).length} 资产，prerelease=${gh.prerelease}）`);
  } catch (e) { fail(`GitHub API 不可达: ${e.message}`); return exit(); }
  try {
    gee = await fetchJson(geeApi);
    ok(`Gitee  latest: ${gee.tag_name}（${(gee.assets || []).length} 附件）`);
  } catch (e) { fail(`Gitee API 不可达: ${e.message}`); return exit(); }

  // 2. tag 一致性 + 期望版本
  console.log('\n[2/4] tag 一致性 ...');
  if (gh.tag_name !== gee.tag_name) {
    fail(`镜像漂移: GitHub latest=${gh.tag_name} vs Gitee latest=${gee.tag_name}（重跑 mirror-gitee job 或按 runbook 同步）`);
  } else {
    ok(`双源 latest tag 一致: ${gh.tag_name}`);
  }
  if (args.expectVersion) {
    const ghV = normalizeVersion(gh.tag_name), geeV = normalizeVersion(gee.tag_name);
    ghV === args.expectVersion ? ok(`GitHub tag 版本 == ${args.expectVersion}`)
      : fail(`GitHub tag 版本 ${ghV} != 期望 ${args.expectVersion}`);
    geeV === args.expectVersion ? ok(`Gitee tag 版本 == ${args.expectVersion}`)
      : fail(`Gitee tag 版本 ${geeV} != 期望 ${args.expectVersion}`);
  }

  // 3. 资产对照表
  // 注意：Gitee /releases/latest 的资产对象只有 name + browser_download_url，
  // 没有 size 字段——「镜像大小是否一致」统一在第 4 步用 HEAD 的最终
  // content-length 与 GitHub API size 核对（这也是防截断的权威口径）。
  console.log('\n[3/4] 资产对照（GitHub ↔ Gitee）...');
  const ghAssets = (gh.assets || []).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url, digest: a.digest }));
  const geeByName = new Map((gee.assets || []).map(a => [a.name, a]));
  const ghMain = ghAssets.filter(a => !isSidecarName(a.name));
  const ghSide = ghAssets.filter(a => isSidecarName(a.name));
  const sideByMain = new Map(ghSide.map(s => [s.name.replace(/\.sha256$/, ''), s]));

  const w = Math.max(46, ...ghAssets.map(a => a.name.length + 2));
  const row = (name, ghSize, geeSize, note) =>
    console.log(`  ${name.padEnd(w)} ${String(ghSize ?? '-').padStart(12)}  ${String(geeSize ?? '-').padStart(12)}  ${note}`);
  console.log(`  ${'资产'.padEnd(w)} ${'GitHub'.padStart(12)}  ${'Gitee'.padStart(12)}`);
  for (const a of ghMain) {
    const g = geeByName.get(a.name);
    if (g) row(a.name, a.size, '?', '已镜像（大小走第 4 步 HEAD 核验）');
    else if (a.size > GITEE_FILE_LIMIT) row(a.name, a.size, '-', '超 100MB 限，预期缺失（回落 GitHub 源）');
    else {
      row(a.name, a.size, '-', 'Gitee 缺失（未超限，非预期）');
      warn(`Gitee 缺失未超限资产: ${a.name}（${a.size} 字节）`);
    }
  }
  for (const s of ghSide) {
    if (geeByName.has(s.name)) row(s.name, s.size, '?', '已镜像');
    else warn(`Gitee 缺失边车: ${s.name}（小文件不应缺失——镜像链路故障？）`);
  }
  for (const extra of (gee.assets || [])) {
    if (!ghAssets.some(a => a.name === extra.name) && !isGiteeSourceArchive(extra.name)) {
      warn(`Gitee 独有资产（GitHub 侧没有）: ${extra.name}`);
    }
  }

  // 4. 边车 + HEAD 核验（只对 GitHub 主资产）
  console.log('\n[4/4] 边车格式/digest 交叉核对 + HEAD 大小核验 ...');
  for (const a of ghMain) {
    const side = sideByMain.get(a.name);
    if (!side) {
      warn(`${a.name}: 无 .sha256 边车（兼容期：壳侧仅 size 兜底——v0.5.3 起发布管线自动生成）`);
    } else {
      try {
        const text = await fetchSmallText(side.url);
        const hash = parseSidecarHash(text);
        if (!hash) { fail(`边车格式坏（首段非 64 位小写 hex）: ${side.name} → ${JSON.stringify(text.slice(0, 80))}`); }
        else {
          const apiHash = parseDigest(a.digest);
          if (apiHash == null) info(`${side.name}: 格式 OK（${hash.slice(0, 16)}…；GitHub API 无 digest 字段，跳过交叉核对）`);
          else if (apiHash === hash) ok(`${side.name}: 格式 OK 且与 GitHub digest 一致（${hash.slice(0, 16)}…）`);
          else fail(`边车哈希与 GitHub digest 不符: ${side.name} 边车=${hash} API=${apiHash}`);
        }
      } catch (e) { fail(`边车下载失败: ${side.name}: ${e.message}`); }
    }
    // HEAD 主资产（GitHub 源）
    try {
      const h = await headWithRedirects(a.url);
      if (h.status >= 400) fail(`HEAD ${a.name} 返回 ${h.status}（${h.finalUrl}）——资产列出但不可下载？`);
      else if (h.contentLength == null) warn(`HEAD ${a.name}: 响应无 content-length（${new URL(h.finalUrl).host}），跳过大小核对`);
      else if (h.contentLength !== a.size) fail(`HEAD ${a.name}: content-length=${h.contentLength} != API size=${a.size}`);
      else ok(`HEAD ${a.name}: content-length=${h.contentLength} == API size（${new URL(h.finalUrl).host}）`);
    } catch (e) { warn(`HEAD ${a.name} 传输失败（网络/代理，非内容问题）: ${e.message || e.code || '传输错误'}`); }
    // 双侧镜像资产：Gitee HEAD 最终 content-length 须与 GitHub API size 一致
    // （Gitee API 不给 size，HEAD 是镜像大小的唯一权威来源）
    const g = geeByName.get(a.name);
    if (g && g.browser_download_url) {
      try {
        const h = await headWithRedirects(g.browser_download_url);
        if (h.status >= 400) fail(`HEAD(Gitee) ${a.name} 返回 ${h.status}——镜像列出但不可下载？`);
        else if (h.contentLength != null && h.contentLength !== a.size)
          fail(`HEAD(Gitee) ${a.name}: content-length=${h.contentLength} != GitHub size=${a.size}（镜像内容损坏/截断？）`);
        else if (h.contentLength != null) ok(`HEAD(Gitee) ${a.name}: content-length=${h.contentLength} == GitHub size（镜像内容一致）`);
        else warn(`HEAD(Gitee) ${a.name}: 无 content-length，跳过镜像大小核对`);
      } catch (e) { warn(`HEAD(Gitee) ${a.name} 传输失败: ${e.message || e.code || '传输错误'}`); }
    }
  }

  return exit();
}

function exit() {
  console.log(`\n== 汇总: FAIL=${report.fail} WARN=${report.warn} ==`);
  if (report.fail > 0) { console.log('结论: 存在硬错，自动更新链路不可信，按 runbook 处置'); return 1; }
  if (report.warn > 0) console.log('结论: 通过（含警告，多为兼容期无边车/网络不可达类）');
  else console.log('结论: 全部通过');
  return 0;
}

// ── --test：离线自检（无网络，覆盖纯函数与判定逻辑）─────────────────────────
function selfTest() {
  console.log('== verify-update-sources.mjs 离线自检 ==');
  let failed = 0;
  const t = (name, cond) => { console.log(`  ${cond ? 'ok' : 'FAIL'} - ${name}`); if (!cond) failed++; };

  t('边车解析: sha256sum 原生格式', parseSidecarHash('8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646  DSH-Desktop-Setup-0.5.2-win-x64.exe\n') === '8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646');
  t('边车解析: 纯哈希无尾注', parseSidecarHash('8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646') === '8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646');
  t('边车解析: 大写 hex 拒绝（规范=小写）', parseSidecarHash('8E062808478CF7BCC311B10414095F634CE5566D7686BF8498803898995E9646') === null);
  t('边车解析: 63 位拒绝', parseSidecarHash('e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646') === null);
  t('边车解析: 前缀垃圾拒绝', parseSidecarHash('xx8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646') === null);
  t('边车解析: 空内容拒绝', parseSidecarHash('') === null);
  t('digest 解析: sha256:hex', parseDigest('sha256:8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646') === '8e062808478cf7bcc311b10414095f634ce5566d7686bf8498803898995e9646');
  t('digest 解析: 空/坏格式 → null', parseDigest('') === null && parseDigest('md5:abc') === null);
  t('版本归一: v0.5.2 → 0.5.2', normalizeVersion('v0.5.2') === '0.5.2');
  t('版本归一: 0.5.2 → 0.5.2', normalizeVersion('0.5.2') === '0.5.2');
  t('边车名判定', isSidecarName('a.exe.sha256') && !isSidecarName('a.exe'));
  t('Gitee 源码包判定: v0.5.2.zip / v0.5.2.tar.gz 非异常', isGiteeSourceArchive('v0.5.2.zip') && isGiteeSourceArchive('v0.5.2.tar.gz') && !isGiteeSourceArchive('DSH-Desktop-Setup-0.5.2-win-x64.exe'));
  t('Gitee 限值口径: 便携版 102477786 可镜像, deb 122865758 超限', 102477786 <= GITEE_FILE_LIMIT && 122865758 > GITEE_FILE_LIMIT);

  console.log(failed === 0 ? '自检全部通过' : `自检失败 ${failed} 项`);
  return failed === 0 ? 0 : 1;
}

main().then(code => process.exit(code)).catch(e => {
  console.error(`[FAIL] 未预期错误: ${e.stack || e.message}`);
  process.exit(1);
});
