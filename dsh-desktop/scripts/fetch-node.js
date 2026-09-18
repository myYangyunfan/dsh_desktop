'use strict';

// Copies the system Node executable into vendor/node/ (node.exe on Windows,
// node on macOS/Linux).
//
// Why: the packaged app boots the dsh CLI with a real Node executable so
// prebuilt native modules (sharp, node-pty, koffi, ...) keep the exact Node
// ABI they were compiled for. Electron's embedded Node has a different ABI
// and would refuse to load them; rebuilding against Electron would break
// them for plain node. Bundling the same Node used at install time is the
// zero-config way to guarantee a match.
//
// Usage (must run under system Node, not Electron):
//   npm run fetch-node                          # copy the local Node binary
//   node scripts/fetch-node.js --arch=arm64     # download the SAME node
//                                               # version for win32-arm64
//                                               # (nodejs.org zip; used by the
//                                               # cross-built ARM64 package)
//   node scripts/fetch-node.js --platform=darwin --arch=x64
//                                               # download for darwin-x64
//                                               # (nodejs.org .tar.gz; used by
//                                               # the macOS x64 package built on
//                                               # an arm64 runner)
//
// Cross mode: a build machine of one platform/arch cannot produce a Node
// binary for another by copying, so instead we fetch the official build of
// the exact same node version (process.version) from nodejs.org. All runtime
// native modules (koffi / sharp / node-pty / node-addon-require-builtin) are
// N-API addons, so any modern Node version matches their ABI.

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const MAX_REDIRECTS = 5;

function argValue(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(`--${name}=`.length) : null;
}

function destPath() {
  const platform = argValue('platform') || process.platform;
  const exeName = platform === 'win32' ? 'node.exe' : 'node';
  return path.resolve(__dirname, '..', 'vendor', 'node', exeName);
}

function httpDownload(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'dsh-desktop-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          return reject(new Error(`重定向超过 ${MAX_REDIRECTS} 次: ${url}`));
        }
        return httpDownload(res.headers.location, destPath, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.setTimeout(120000, () => req.destroy(new Error('下载超时: ' + url)));
    req.on('error', reject);
  });
}

// Same redirect/timeout policy as httpDownload, but returns the body as text.
// Used for the tiny official checksum manifest.
function httpGetText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'dsh-desktop-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          return reject(new Error(`重定向超过 ${MAX_REDIRECTS} 次: ${url}`));
        }
        return httpGetText(res.headers.location, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} ${url}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
      res.on('error', reject);
    });
    req.setTimeout(120000, () => req.destroy(new Error('下载超时: ' + url)));
    req.on('error', reject);
  });
}

// Parse a SHA256SUMS-style manifest (`<64 hex>  <filename>` per line) and return
// the digest recorded for archiveName, or null when the archive is absent.
function parseShasums256(text, archiveName) {
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m && m[2] === archiveName) return m[1].toLowerCase();
  }
  return null;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Extract the node binary from an archive. zip (win32) via tar or
// PowerShell Expand-Archive fallback; .tar.gz (darwin/linux) via tar -xzf.
// The binary inside is node.exe (zip) or <pkg>/bin/node (tar.gz).
function extractNodeBinary(archivePath, tmpDir, isZip, pkgTop) {
  let ok = false;
  if (!isZip && pkgTop) {
    // .tar.gz：只提取 bin/node 单文件。Windows 的 bsdtar 无法在 NTFS 上
    // 创建 tar.gz 内的 symlink（bin/npm、bin/npx、bin/corepack），全量
    // 解压会报 "Invalid argument" 而失败；单文件提取完全避开 symlink，
    // 在 macOS 与 Windows 上都能工作。
    try {
      execFileSync('tar', ['-xzf', archivePath, '-C', tmpDir, `${pkgTop}/bin/node`], { stdio: 'pipe' });
      ok = true;
    } catch (err) {
      console.warn('tar 单文件提取失败，尝试全量解压: ' + err.message);
    }
  }
  if (!ok) {
    const args = isZip ? ['-xf', archivePath, '-C', tmpDir] : ['-xzf', archivePath, '-C', tmpDir];
    try {
      execFileSync('tar', args, { stdio: 'pipe' });
      ok = true;
    } catch (err) {
      console.warn('tar 解压失败，改用 PowerShell Expand-Archive: ' + err.message);
    }
  }
  if (!ok) {
    const script = `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${tmpDir}' -Force`;
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'pipe' });
    } catch (err) {
      console.error('解压 node 压缩包失败: ' + err.message);
      process.exit(1);
    }
  }
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (isZip && /^node\.exe$/i.test(e.name)) found.push(full);
      else if (!isZip && e.name === 'node') found.push(full);
    }
  };
  walk(tmpDir);
  if (!found.length) {
    console.error('压缩包内未找到 node 二进制: ' + archivePath);
    process.exit(1);
  }
  // Prefer the deepest match (tar.gz layout: node-<v>-<platform>-<arch>/bin/node;
  // npm's bin shims may also match 'node' — depth sorting keeps this robust).
  found.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  return found[0];
}

async function fetchCross(platform, arch) {
  const version = process.version; // e.g. v24.3.0
  const isWin = platform === 'win32';
  const archiveName = isWin
    ? `node-${version}-win-${arch}.zip`
    : `node-${version}-${platform}-${arch}.tar.gz`;
  const url = `https://nodejs.org/dist/${version}/${archiveName}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `fetch-node-${platform}-${arch}-`));
  const archive = path.join(tmpDir, archiveName);
  console.log(`下载 ${url}`);
  await httpDownload(url, archive);
  const size = fs.statSync(archive).size;
  if (!size) {
    console.error('下载产物为空（0 bytes）: ' + archive);
    process.exit(1);
  }
  console.log(`    -> ${archive} (${size} bytes)`);
  // H-08: the download is only trusted after it matches the official
  // SHA256SUMS manifest for this exact version (fail-closed).
  const shasumsUrl = `https://nodejs.org/dist/${version}/SHASUMS256.txt`;
  const expected = parseShasums256(await httpGetText(shasumsUrl), archiveName);
  if (!expected) {
    console.error(`SHASUMS256.txt 中缺少 ${archiveName}，拒绝使用下载产物: ${shasumsUrl}`);
    fs.rmSync(archive, { force: true });
    process.exit(1);
  }
  const actual = await sha256File(archive);
  if (actual !== expected) {
    console.error(`sha256 校验失败（下载产物已丢弃）: ${archiveName}\n  期望 ${expected}\n  实际 ${actual}`);
    fs.rmSync(archive, { force: true });
    process.exit(1);
  }
  console.log(`    -> sha256 校验通过 (${archiveName})`);
  // tar.gz 顶层目录名 = node-<version>-<platform>-<arch>（如
  // node-v24.15.0-darwin-x64），单文件提取需要它定位 bin/node。
  const pkgTop = isWin ? null : `node-${version}-${platform}-${arch}`;
  const bin = extractNodeBinary(archive, tmpDir, isWin, pkgTop);
  const dest = destPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(bin, dest);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`已写入 ${dest}`);
  console.log(`Node ${version} / ${platform}-${arch} / ${fs.statSync(dest).size} bytes`);
}

async function main() {
  const platform = argValue('platform') || process.platform;
  const arch = argValue('arch') || process.arch;

  const cross = (platform !== process.platform) || (arch !== process.arch);
  if (cross) {
    await fetchCross(platform, arch);
    return;
  }

  // Native path: copy the running Node binary (original behavior).
  const src = process.execPath;
  if (!/node(\.exe)?$/i.test(path.basename(src))) {
    console.error('fetch-node 必须在系统 Node 下运行（npm run fetch-node），不能在 Electron 内运行。');
    process.exit(1);
  }
  const dest = destPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`已复制 ${src}`);
  console.log(`    -> ${dest}`);
  console.log(`Node ${process.version} / ${process.platform}-${process.arch} / ${fs.statSync(dest).size} bytes`);
}

// Run only when executed directly (npm run fetch-node); importing the helpers for
// tests must not copy/download anything.
if (require.main === module) {
  main().catch((err) => {
    console.error('fetch-node 失败: ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}

module.exports = { parseShasums256, sha256File, httpDownload, httpGetText, fetchCross };
