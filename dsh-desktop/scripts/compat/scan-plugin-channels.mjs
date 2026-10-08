#!/usr/bin/env node
// ---------------------------------------------------------------------------
// 内置插件「更新通道」复算器 —— docs/builtin-plugins-inventory.md §四/§五 的台账数字
// 就是本脚本的输出，任何一行都可当场重放（不要再靠抄录）。
//
//   cd dsh-desktop
//   node scripts/compat/scan-plugin-channels.mjs              # 只走 d-pack 本地 git（离线）
//   node scripts/compat/scan-plugin-channels.mjs --npm        # 再走 npm（官方失败自动退 npmmirror）
//   node scripts/compat/scan-plugin-channels.mjs --json      # 机器消费
//
// 判据面全在 scripts/lib/plugin-channels.js（纯函数、单测覆盖）；本文件只做 IO：
// d-pack 用 `git ls-tree`/`git show` 读**远端 ref 的文件**（不动工作区、不需要 fetch 就能
// 复算已 fetch 过的 ref），npm 用 `/latest`（自带 repository + maintainers，够判身份）。
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { COMPANION_PLUGINS } = require('../lib/companion-plugins.js');
const { channelRow, summarize, parseLsTreeDirs, bareName } = require('../lib/plugin-channels.js');
const { npmLatestUrl } = require('../plugin-manager-update.js');

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets', 'plugins');

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  if (at === -1) return fallback;
  const next = process.argv[at + 1];
  return next && !next.startsWith('--') ? next : true;
}

const wantNpm = arg('npm', false) === true;
const asJson = arg('json', false) === true;
const ref = String(arg('ref', 'origin/main'));
const dpackDir = String(
  arg('dpack', process.env.DSH_PACK_DIR || path.resolve(ROOT, '..', '..', 'dsh-pack')),
);

function gitShowJson(dir, spec) {
  try {
    return JSON.parse(execFileSync('git', ['-C', dir, 'show', spec], { encoding: 'utf8', maxBuffer: 8 << 20 }));
  } catch {
    return null;
  }
}

function gitLsTree(dir, tree) {
  try {
    return execFileSync('git', ['-C', dir, 'ls-tree', '--name-only', `${ref}:${tree}`], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

/** d-pack 发布面：packages/ 是 shipped，not-shipped/ 是刻意排除的收录。 */
function readDpack(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return { available: false, dir };
  const shipped = parseLsTreeDirs(gitLsTree(dir, 'packages'));
  const parked = parseLsTreeDirs(gitLsTree(dir, 'not-shipped'));
  const head = (() => {
    try {
      return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%h %ad', '--date=short', ref], { encoding: 'utf8' }).trim();
    } catch {
      return '(ref 不可读)';
    }
  })();
  return {
    available: true,
    dir,
    ref,
    head,
    shippedCount: [...shipped].filter((d) => d !== 'host-capabilities' && d !== 'meta-all').length,
    lookup(bare) {
      if (shipped.has(bare)) {
        const pkg = gitShowJson(dir, `${ref}:packages/${bare}/package.json`);
        return { present: true, shipped: true, version: pkg ? pkg.version : null };
      }
      if (parked.has(bare)) {
        const pkg = gitShowJson(dir, `${ref}:not-shipped/${bare}/package.json`);
        return { present: true, shipped: false, notShipped: true, version: pkg ? pkg.version : null };
      }
      return { present: false };
    },
  };
}

async function readNpm(name, localRepository) {
  for (const mirror of [false, true]) {
    const url = npmLatestUrl(name, mirror);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const j = await res.json();
      if (!j || !j.version) continue;
      return {
        source: mirror ? 'npmmirror' : 'npm',
        version: j.version,
        repository: j.repository || null,
        maintainers: j.maintainers || [],
        localRepository,
      };
    } catch {
      /* 双源都拿不到就是「未发布/不可达」，由调用方记 absent */
    }
  }
  return null;
}

const dpack = readDpack(dpackDir);
const rows = [];
for (const entry of COMPANION_PLUGINS) {
  const dir = bareName(entry.name);
  const localPkg = JSON.parse(fs.readFileSync(path.join(ASSETS, dir, 'package.json'), 'utf8'));
  const row = channelRow({
    entry,
    localVersion: localPkg.version,
    dpack: dpack.available ? dpack.lookup(dir) : { present: false },
    npm: wantNpm ? await readNpm(entry.name, localPkg.repository) : null,
  });
  rows.push(row);
}

const sum = summarize(rows);

if (asJson) {
  console.log(JSON.stringify({ dpack, summary: sum, rows }, null, 2));
} else {
  console.log(`在册 ${sum.total} 条 ｜ d-pack 通道：${dpack.available ? `${dpack.ref} = ${dpack.head}（packages ${dpack.shippedCount} 个）` : '跳过（' + dpackDir + ' 不是 git 仓库）'}`);
  console.log(`npm 通道：${wantNpm ? '已查' : '未查（加 --npm）'}`);
  console.log('');
  const pad = (text, n) => String(text).padEnd(n);
  console.log(pad('#', 3) + pad('loader id', 22) + pad('源目录', 28) + pad('本机', 9) + pad('d-pack', 18) + 'npm');
  rows.forEach((r, i) => {
    const dp = r.dpack.present ? `${r.dpack.version}${r.dpack.shipped ? '' : '(not-shipped)'} ${bucketTag(r.dpack.bucket)}` : '无此件';
    const np = r.npm.version
      ? `${r.npm.version} ${bucketTag(r.npm.bucket)} 身份:${r.npm.identity}${r.npm.publisher ? '/' + r.npm.publisher : ''}`
      : '未发布';
    console.log(pad(i + 1, 3) + pad(r.id, 22) + pad(r.dir, 28) + pad(r.local, 9) + pad(dp, 18) + np + (r.actionable ? '  ← 可取' : ''));
  });
  console.log('');
  console.log('d-pack 分布', JSON.stringify(sum.dpack));
  console.log('npm   分布', JSON.stringify(sum.npm), '身份', JSON.stringify(sum.npmIdentity));
  console.log('可取（同身份且更高）：' + (sum.actionable.length ? sum.actionable.join(', ') : '0 条'));
}

function bucketTag(bucket) {
  return { equal: '=', 'ours-higher': '↑我们', 'theirs-higher': '↓他们', absent: '' }[bucket] || bucket;
}
