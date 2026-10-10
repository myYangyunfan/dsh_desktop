/**
 * install-pristine-kernel.mjs — 组装「未打任何 dsh-desktop 补丁的内核闭包树」。
 *
 * 为什么需要
 * ----------
 * ta6-transform-contract / ta6-heal-rollback-audit / ta3-boot-chain 这几支 TA 元测试
 * 需要一份真 pristine 内核字节：transform 的 changed 分支、回滚定位点审计、boot 链
 * 一条龙全依赖它。这份字节历史上是仓库根 .tmp-rc2-stage/node_modules（一次性 npm
 * 装配产物）；该目录被清理后守卫出现两种失效形态，且都比「红」更糟（详见
 * scripts/lib/pristine-kernel-roots.js 头部注释）：硬红，或整组 { skip } 静默停摆。
 *
 * 本脚本按 pristine-kernel-roots.js 认可的「durable pristine 源」契约，把
 * vendor/dsh-kernel/ 下 pin 住的离线 tarball 全量解出到：
 *
 *   <repo>/.tmp-kernel/.consumer-<kernel.packageVersion>/node_modules/@deepseek-ai/<pkg>
 *
 * 全程离线、确定性：不跑 npm、不联网、不碰 dsh-desktop/node_modules，也不碰
 * dsh-tauri/package-payload（二者都是 postinstall / 运行时 boot 链打过补丁的树）。
 *
 * 故意不写 .tmp-rc2-stage
 * -----------------------
 * ta6-baseline-matrix 的 BASELINE 快照是按 .tmp-rc2-stage 那株旧树录制的；
 * pristine-kernel-roots.js L16-17 明确警告换源会使其逐项判定漂移。因此本脚本只产出
 * consumer 根，让基线哨兵继续走它自己的「rc.2 树缺席即 skip」分支，避免假红。
 *
 * 运行：node scripts/install-pristine-kernel.mjs [--force] [--root=<dir>]
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // dsh-desktop
const REPO_ROOT = join(ROOT, '..');
const TARBALLS = join(ROOT, 'vendor', 'dsh-kernel');
const PIN = join(ROOT, 'scripts', 'compat', 'kernel-pin.json');

const BLOCK = 512;
const PKG_PREFIX = 'package/';

/** tar 头里的 NUL 结尾字符串（也可能被后续数据填满，故截到第一个 NUL）。 */
const cstr = (buf, start, len) => buf.toString('utf8', start, start + len).replace(/\0[\s\S]*$/, '');

/** 解析 PAX 扩展头记录（形如 "123 key=value\n"）。 */
function parsePax(text) {
  const out = {};
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(' ', i);
    if (sp < 0) break;
    const len = parseInt(text.slice(i, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = text.slice(i, i + len);
    const eq = rec.indexOf('=');
    if (eq > sp - i) out[rec.slice(sp - i, eq)] = rec.slice(eq + 1).replace(/\n$/, '');
    i += len;
  }
  return out;
}

/**
 * 极简 ustar 读取器（支持 PAX x/g 头与 GNU L 长名），返回条目表。
 * 只读元数据，不落盘 —— 调用方拿到 dataStart/size 后按需切片。
 */
function readEntries(buf) {
  const entries = [];
  let off = 0;
  let paxNext = {};
  let gnuLongName = null;
  while (off + BLOCK <= buf.length) {
    const name = cstr(buf, off, 100);
    if (!name) break; // 收尾的零块
    const size = parseInt(cstr(buf, off + 124, 12).trim(), 8) || 0;
    const type = String.fromCharCode(buf[off + 156]);
    const prefix = cstr(buf, off + 345, 155);
    const dataStart = off + BLOCK;
    const dataEnd = dataStart + size;

    if (type === 'x' || type === 'g') {
      const recs = parsePax(buf.toString('utf8', dataStart, dataEnd));
      if (type === 'x') paxNext = recs;
    } else if (type === 'L') {
      gnuLongName = buf.toString('utf8', dataStart, dataEnd).replace(/\0+$/, '');
    } else {
      let full = prefix ? `${prefix}/${name}` : name;
      if (gnuLongName) { full = gnuLongName; gnuLongName = null; }
      if (paxNext.path) full = paxNext.path;
      paxNext = {};
      entries.push({ path: full, type, dataStart, size });
    }
    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}

/** 解包一个 tgz 到 <nmRoot>/<manifest.name>，返回 manifest 概要。 */
function extractOne(tgz, nmRoot) {
  const buf = gunzipSync(readFileSync(tgz));
  const entries = readEntries(buf);
  const pj = entries.find((e) => e.path === PKG_PREFIX + 'package.json');
  if (!pj) throw new Error(`install-pristine-kernel: ${tgz} 内找不到 package/package.json`);
  const manifest = JSON.parse(buf.toString('utf8', pj.dataStart, pj.dataStart + pj.size));
  if (!manifest.name || !manifest.version) {
    throw new Error(`install-pristine-kernel: ${tgz} 的 manifest 缺 name/version`);
  }

  const dest = join(nmRoot, ...manifest.name.split('/'));
  let files = 0;
  for (const e of entries) {
    if (!e.path.startsWith(PKG_PREFIX)) continue;
    const rel = e.path.slice(PKG_PREFIX.length);
    if (!rel) continue;
    const target = join(dest, rel);
    if (e.type === '5') { mkdirSync(target, { recursive: true }); continue; }
    if (e.type === '2' || e.type === '1') continue; // 符号/硬链接：闭包树内不需要
    if (e.type !== '0' && e.type !== '\u0000') continue; // 其余（设备/管道）跳过
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buf.subarray(e.dataStart, e.dataStart + e.size));
    files += 1;
  }
  return { name: manifest.name, version: manifest.version, files };
}

function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const rootArg = argv.find((a) => a.startsWith('--root='));

  const pin = JSON.parse(readFileSync(PIN, 'utf8'));
  const version = pin.kernel.packageVersion;
  if (!version) throw new Error('install-pristine-kernel: kernel-pin.json 缺 kernel.packageVersion');

  const consumerDir = rootArg
    ? join(rootArg.slice('--root='.length), 'node_modules')
    : join(REPO_ROOT, '.tmp-kernel', `.consumer-${version}`, 'node_modules');
  const stampPath = join(dirname(consumerDir), '.pristine-kernel.json');
  const marker = join(consumerDir, '@deepseek-ai', 'dsh', 'package.json');

  // 幂等快路径：已在位且版本与 pin 一致 → 不动盘。
  if (existsSync(marker) && !force) {
    let cur = null;
    try { cur = JSON.parse(readFileSync(marker, 'utf8')).version; } catch { /* 重装 */ }
    if (cur === version) {
      console.log(`[pristine-kernel] 已就绪：${relative(REPO_ROOT, consumerDir)} (${version})，跳过`);
      return;
    }
  }

  const files = readdirSync(TARBALLS).filter((f) => f.endsWith('.tgz')).sort();
  if (files.length === 0) {
    throw new Error(`install-pristine-kernel: ${TARBALLS} 下没有 tgz（vendor 内核缺失）`);
  }

  rmSync(consumerDir, { recursive: true, force: true });
  mkdirSync(consumerDir, { recursive: true });
  console.log(`[pristine-kernel] 解包 ${files.length} 个 tgz -> ${relative(REPO_ROOT, consumerDir)}`);

  let total = 0;
  for (const f of files) {
    const r = extractOne(join(TARBALLS, f), consumerDir);
    // 0.1.6 起收编族（cordis/cosmokit/schemastery/node-addon-system）版本线与
    // 内核 pin 不同——校验改为「文件名内嵌版本 ↔ manifest 自洽」；仅 dsh-* 内核
    // 家族仍强等 pin（离线内核不得混版的本意是防串版，收编族自有版本号合法）。
    const stem = f.replace(/\.tgz$/, '');
    const fm = stem.match(/^(.*)-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?)$/);
    const expected = fm ? fm[2] : version;
    const isDshFamily = stem.startsWith('deepseek-ai-dsh-');
    const want = isDshFamily ? version : expected;
    if (r.version !== want) {
      throw new Error(
        `install-pristine-kernel: ${f} 是 ${r.version}，期望 ${want}（离线内核不得混版）`,
      );
    }
    total += 1;
  }

  writeFileSync(
    stampPath,
    `${JSON.stringify({ kernelVersion: version, tarballs: total, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`[pristine-kernel] 完成：${total} 个包，根 = ${relative(REPO_ROOT, consumerDir)}`);
}

main();
