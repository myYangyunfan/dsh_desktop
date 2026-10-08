'use strict';

// ---------------------------------------------------------------------------
// 内置插件「更新通道」对账的纯函数面。
//
// 为什么要单独一层：`docs/builtin-plugins-inventory.md` §四/§五 的每条判定都要回答
// 同一个问题——「远端有没有既**同源**又**更新**的版本」。这问题有两个独立的坑，
// 都被实测咬过：
//   · 按包名比对会得到假结论。d-pack 把发布面包名统一改成 `@dsh-pack/<裸名>`，
//     我们的 `@deepseek-ai/*` / `@dsh-external/*` 与它不同形 → 必须按**目录名的裸名**匹配；
//   · npm 上「名字更高」不等于「是上游」。`dsh-session-manager`（npm 0.6.2 属 `hkkz9522`）
//     与 `dsh-input-history`（npm 0.3.2 属 `sunshaobei`）都是撞名的第三方实现，
//     按名更新会把别人的代码装进来。身份必须从 packument 的 repository/maintainers 判。
//
// 本模块只做判定，不碰 git、不碰网络（那两个 IO 留在 scripts/compat/scan-plugin-channels.mjs）。
// 版本比较复用全仓唯一实现 `./versions.js`。
// ---------------------------------------------------------------------------

const { compareVersions } = require('./versions');

/** `@scope/name` → `name`；未 scoped 原样返回。目录名与 d-pack 包目录都按裸名形。 */
function bareName(name) {
  const text = String(name || '');
  return text.startsWith('@') ? text.split('/').pop() : text;
}

/**
 * repository 字段 → `owner/repo` 小写 slug（拿不到交回 null）。
 * 实测要吃的形态：`git+https://github.com/o/r.git`、`https://github.com/o/r`、
 * `github.com/o/r`、`git@github.com:o/r.git`、对象形 `{url, directory}`。
 * 无 scheme 那一支必须丢掉首段的点分主机名（`github.com/owner/repo` 直接切会得到
 * owner='github.com'，把两条不同项目的 slug 判成同一条）。
 */
function parseRepoSlug(repository) {
  const raw = repository && typeof repository === 'object' ? repository.url : repository;
  const text = String(raw || '').trim();
  if (!text) return null;
  const ssh = /^[^@]+@[^:]+:(.+)$/.exec(text.replace(/^git\+/, ''));
  const path = ssh ? ssh[1] : (() => {
    const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.+)$/.exec(text);
    if (m) return m[1];
    if (text.startsWith('/')) return text;
    const seg = text.split('/');
    // 点分首段是主机名（github.com / gitlab.com / 自建域），不是 owner。
    return seg[0].includes('.') ? seg.slice(1).join('/') : '/' + text;
  })();
  const parts = path.replace(/^\/+/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) return null;
  return (owner + '/' + repo).toLowerCase();
}

/** 远端版本缺失 → `absent`；否则 `equal` / `ours-higher` / `theirs-higher`。 */
function versionBucket(local, remote) {
  if (remote === undefined || remote === null || remote === '') return 'absent';
  const cmp = compareVersions(local, remote);
  if (cmp === 0) return 'equal';
  return cmp > 0 ? 'ours-higher' : 'theirs-higher';
}

/**
 * 身份判定：远端那个包是不是「我们随包这份的上游」。
 *   · `same` —— 两侧都自述 repository 且 slug 相等；
 *   · `foreign` —— 两侧都有 slug 但不等（**同名不同项目**，禁止按名更新）；
 *   · `unverifiable` —— 本地 package.json 没自述上游，远端有仓库（自研件与分叉件都落这里，
 *     机器只能说到「无法确认同源」，取不取交 §三 的人工取证台账）；
 *   · `unknown` —— 远端也没有 repository（连它是谁都没说，更谈不上上游）。
 */
function identityVerdict({ localRepository, remoteRepository }) {
  const local = parseRepoSlug(localRepository);
  const remote = parseRepoSlug(remoteRepository);
  if (local && remote) return local === remote ? 'same' : 'foreign';
  if (!local && remote) return 'unverifiable';
  return 'unknown';
}

/**
 * 组装一行通道事实。
 * @param {object} input
 * @param {{id:string,name:string}} input.entry 清单条目
 * @param {string} input.localVersion 本机 package.json 的 version
 * @param {{present:boolean,version?:string,shipped?:boolean,notShipped?:boolean}} input.dpack
 *        d-pack 发布面事实（present=false 即在册而发布面无）
 * @param {{version?:string,repository?:any,maintainers?:Array}} [input.npm] npm packument 事实
 */
function channelRow({ entry, localVersion, dpack, npm }) {
  const dir = bareName(entry.name);
  const present = !!dpack && dpack.present === true;
  const dpackVersion = present ? dpack.version || null : null;
  const npmVersion = npm && npm.version ? npm.version : null;
  const npmIdentity = npmVersion
    ? identityVerdict({ localRepository: npm.localRepository, remoteRepository: npm.repository })
    : 'absent';
  const npmPublisher = (() => {
    const list = npm && Array.isArray(npm.maintainers) ? npm.maintainers : [];
    return list.length ? String(list[0].name || list[0].email || '') : '';
  })();
  const dpackBucket = versionBucket(localVersion, dpackVersion);
  const npmBucket = versionBucket(localVersion, npmVersion);
  // 「可取」= 存在同身份且更高的通道。d-pack 侧只认 shipped（not-shipped/ 是发布面刻意排除的）；
  // npm 侧只认 identity === 'same'——unverifiable/foreign 都不构成更新目标。
  const actionable =
    (dpackBucket === 'theirs-higher' && present && dpack.shipped !== false)
    || (npmBucket === 'theirs-higher' && npmIdentity === 'same');
  return {
    id: entry.id,
    name: entry.name,
    dir,
    local: localVersion,
    dpack: {
      present,
      version: dpackVersion,
      shipped: present ? dpack.shipped !== false : false,
      notShipped: !!dpack && dpack.notShipped === true,
      bucket: dpackBucket,
    },
    npm: {
      version: npmVersion,
      publisher: npmPublisher,
      repository: (npm && npm.repository) || null,
      identity: npmVersion ? npmIdentity : 'absent',
      bucket: npmBucket,
    },
    actionable,
  };
}

/** 通道分布计数（台账 §四 的「等版 N / 我们更高 N / ...」就是这张表）。 */
function summarize(rows) {
  const blank = () => ({ equal: 0, 'ours-higher': 0, 'theirs-higher': 0, absent: 0 });
  const out = {
    total: rows.length,
    dpack: blank(),
    npm: blank(),
    npmIdentity: { same: 0, foreign: 0, unverifiable: 0, unknown: 0, absent: 0 },
    actionable: [],
  };
  for (const row of rows) {
    out.dpack[row.dpack.bucket] += 1;
    out.npm[row.npm.bucket] += 1;
    out.npmIdentity[row.npm.identity] += 1;
    if (row.actionable) out.actionable.push(row.id);
  }
  return out;
}

/**
 * `git ls-tree --name-only <ref>:packages` 的输出 → 目录名集合。
 * 逐行一个名字；带引号的路径（CJK 会被 git 转义）在这里还原，实测 d-pack 无此形态，
 * 保留归一是为了让判据不依赖「上游目录全 ASCII」。
 */
function parseLsTreeDirs(output) {
  return new Set(
    String(output || '')
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'))
      .filter(Boolean),
  );
}

module.exports = {
  bareName,
  parseRepoSlug,
  versionBucket,
  identityVerdict,
  channelRow,
  summarize,
  parseLsTreeDirs,
};
