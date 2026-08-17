'use strict';

// DSH Desktop 客户端自更新引擎（更新“封装客户端本身”，与 updater.js 的
// dsh agent 更新互相独立）。
//
// 流程：
//   1. checkLatest(): 依次查询上游发布源（GitHub Releases → Gitee Releases，
//      可用环境变量 DSH_DESKTOP_RELEASE_API 指向自定义镜像 API），取 latest
//      release 的 tag 作为版本号，与当前 APP_VERSION 比较。
//   2. selectAsset(): 按当前部署形态与 CPU 架构选择安装包 —— 便携版选
//      *-portable-<arch>.exe（x64/arm64）；安装版选 Setup-*-<arch>.exe。
// 资产命名（v0.3.9+ 规则，带平台前缀）：DSH-Desktop-<版本>-win-portable-<arch>.exe、
// DSH-Desktop-<版本>-win-setup-<arch>.exe；macOS 为 ...-macos-<arch>.dmg/.zip。
//      Gitee 因单文件 100MB 限制把安装包拆成 .part1/.part2 分片，此时自动
//      按序下载并拼接。
//   3. downloadRelease(): 流式下载（带进度回调）到 <userData>/updates/。
//   4. applyUpdate(): 写一个纯 ASCII 的 cmd 脚本并以 detached 方式启动，随后
//      主进程退出：
//      · 便携版：等旧 exe 解锁 → 备份 → 用新 exe 原地替换 → 重新启动；
//        若旧 exe 所在目录只读，则退化为直接启动新 exe（保留旧文件）。
//      · 安装版：等 DSH Desktop 进程退出 → 以向导方式启动新 Setup 安装包
//        （安装器会记录原安装目录并在完成后自动启动新版本）。
//
// 脚本全程写日志到 <userData>/updates/apply-update.log。cmd 脚本内统一用
// System32 完整路径引用 ping（set "PG=...ping.exe"）与 PowerShell（PSEXE），
// 避免应用 PATH 精简时找不到这些可执行文件导致更新脚本静默失败
// （“点安装没反应”的根因之一）。

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { compareVersions } = require('./updater');

const DEFAULT_REPOS = { github: 'myYangyunfan/dsh_desktop', gitee: 'my-yang-yunfan/dsh_desktop' };
const REPO_SLUG = /^[A-Za-z0-9_.-]{1,64}\/[A-Za-z0-9_.-]{1,64}$/;
const MIN_VALID_BYTES = 64 * 1024 * 1024; // 完整安装包远大于 64MB，防止把错误页当 exe

function isPortable() {
  return !!process.env.PORTABLE_EXECUTABLE_DIR;
}

// 当前 CPU 架构：默认取 Electron 主进程的 process.arch（arm64 机器上为
// arm64），可用 DSH_DESKTOP_ARCH 环境变量强制指定（供测试与排查使用）。
function currentArch() {
  const forced = String(process.env.DSH_DESKTOP_ARCH || '').trim();
  if (forced === 'x64' || forced === 'arm64') return forced;
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

/** 解析仓库地址（格式非法或缺省时回退到内置默认仓库）。 */
function resolveRepos(repos) {
  const r = repos && typeof repos === 'object' ? repos : {};
  const github = REPO_SLUG.test(String(r.github || '')) ? r.github : DEFAULT_REPOS.github;
  const gitee = REPO_SLUG.test(String(r.gitee || '')) ? r.gitee : DEFAULT_REPOS.gitee;
  return { github, gitee };
}

function apiEndpoints() {
  if (process.env.DSH_DESKTOP_RELEASE_API) {
    return [{ name: '自定义镜像', url: process.env.DSH_DESKTOP_RELEASE_API }];
  }
  const { github, gitee } = resolveRepos();
  return [
    {
      name: 'GitHub',
      url: `https://api.github.com/repos/${github}/releases/latest`,
      headers: { Accept: 'application/vnd.github+json' },
    },
    { name: 'Gitee', url: `https://gitee.com/api/v5/repos/${gitee}/releases/latest` },
  ];
}

// --- HTTP ----------------------------------------------------------------

function httpGetJson(url, headers = {}, timeoutMs = 20000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('重定向次数过多'));
    const req = https.get(url, { headers: { 'User-Agent': 'DSH-Desktop', ...headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpGetJson(new URL(res.headers.location, url).toString(), headers, timeoutMs, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('error', reject); // 响应流自身错误（罕见）同样收敛为 rejection
      res.on('data', (c) => {
        body += c;
        if (body.length > 4 * 1024 * 1024) req.destroy(new Error('响应过大'));
      });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON 解析失败')); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

// --- release 规范化 -------------------------------------------------------

function normalizeRelease(source, data) {
  const tag = String(data.tag_name || data.tag || data.name || '').trim();
  const version = tag.replace(/^v/i, '');
  const assets = Array.isArray(data.assets)
    ? data.assets
        .map((a) => ({
          name: String(a.name || ''),
          url: String(a.browser_download_url || a.url || ''),
          size: Number(a.size || 0),
        }))
        .filter((a) => a.name && a.url)
    : [];
  return {
    source,
    version,
    name: data.name || null,
    body: String(data.body || ''),
    htmlUrl: data.html_url || null,
    assets,
  };
}

async function checkLatest(ctx, currentVersion) {
  const errors = [];
  const candidates = [];
  for (const ep of apiEndpoints()) {
    try {
      const data = await httpGetJson(ep.url, ep.headers || {});
      const rel = normalizeRelease(ep.name, data);
      if (!rel.version || !rel.assets.length) {
        throw new Error('上游 release 缺少版本号或安装包资产');
      }
      rel.isNewer = compareVersions(rel.version, currentVersion) > 0;
      candidates.push(rel);
      ctx.log('client-update', `[${ep.name}] latest=${rel.version} 当前=${currentVersion} 资产数=${rel.assets.length}`);
    } catch (err) {
      errors.push(`${ep.name}: ${err.message}`);
      ctx.log('client-update', `[${ep.name}] 查询失败: ${err.message}`);
    }
  }
  if (candidates.length === 0) {
    throw new Error('无法连接上游发布源（' + errors.join('；') + '）');
  }
  // 双源回退的语义是「取版本最高的可用源」，而不是先返回第一个可用源。
  // 否则 GitHub 的 latest 落后于 Gitee 时，用户会一直被误判为“已是最新”，
  // 表现为内置更新失效、只能手动下载安装包覆盖。
  candidates.sort((a, b) => compareVersions(b.version, a.version));
  const best = candidates[0];
  ctx.log('client-update', `选用最高版本源 [${best.source}] ${best.version}（候选: ${candidates.map((c) => `${c.source}@${c.version}`).join(', ')}）`);
  return best;
}

// --- 资产选择 / 下载 -------------------------------------------------------

function selectAsset(release) {
  const arch = currentArch();
  const wanted = isPortable()
    ? new RegExp(`-portable-${arch}\\.exe$`, 'i')
    : new RegExp(`-setup-(?:.*-)?${arch}\\.exe$`, 'i');
  const direct = release.assets.find((a) => wanted.test(a.name));
  if (direct) return { parts: [direct], name: direct.name, totalSize: direct.size };

  // Gitee 单文件 100MB 限制：安装包拆分为 <file>.part1 / <file>.part2 …
  // base 名必须与 GitHub 资产名一致（win- 前缀，v0.3.9+ 命名规则）。
  const base = isPortable()
    ? `DSH-Desktop-${release.version}-win-portable-${arch}.exe`
    : `DSH-Desktop-${release.version}-win-setup-${arch}.exe`;
  const parts = release.assets
    .filter((a) => a.name.startsWith(base + '.part'))
    .sort((a, b) => {
      const n = (s) => parseInt(s.split('part').pop(), 10) || 0;
      return n(a.name) - n(b.name);
    });
  if (!parts.length) {
    throw new Error('未找到匹配的安装包资产（' + release.assets.map((a) => a.name).join(', ') + '）');
  }
  return { parts, name: base, totalSize: parts.reduce((s, p) => s + p.size, 0) };
}

function downloadFile(url, dest, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const file = fs.createWriteStream(tmp);
    let received = 0;
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };
    const fail = (err) => {
      if (settled) return;
      // 先关句柄再删临时文件：Windows 上句柄未关时 rmSync 会 EBUSY 被吞，
      // 留下 .part 残留；等 close 回调再删（或删失败也无碍，下次覆盖）。
      file.close(() => {
        try { fs.rmSync(tmp, { force: true }); } catch {}
      });
      finish(reject, err);
    };
    const request = (url2, redirects) => {
      if (redirects > 5) return fail(new Error('重定向次数过多'));
      const req = https.get(url2, { headers: { 'User-Agent': 'DSH-Desktop' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(new URL(res.headers.location, url2).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error('下载失败 HTTP ' + res.statusCode));
        }
        // 服务器在传输中途异常断开时，不要留下一个永远不结束的 Promise
        // （下载窗口会一直转圈且没有任何报错）。
        res.on('aborted', () => fail(new Error('下载连接被中断（服务器提前断开）')));
        res.on('error', fail);
        const total = Number(res.headers['content-length'] || 0);
        // 有 content-length 时校验完整性：静默截断（chunked 收尾但字节不齐）
        // 不触发 aborted，历史实现会把残缺 exe 放行安装。
        res.on('end', () => {
          if (total > 0 && received !== total) {
            return fail(new Error(`下载不完整（收到 ${received} / 声明 ${total} 字节）`));
          }
        });
        res.on('data', (c) => {
          received += c.length;
          if (onProgress) { try { onProgress(received, total); } catch {} }
        });
        res.pipe(file);
      });
      req.setTimeout(60000, () => req.destroy(new Error('下载超时')));
      req.on('error', fail);
      // 整体截止时间兜底：socket 空闲超时会在慢速「滴流」下不断复位（每次
      // 数据都 <60s 到达时永不触发），没有整体上限的下载会永久转圈。
      const deadline = setTimeout(() => req.destroy(new Error('下载总时长超过上限')), 60 * 60 * 1000);
      req.on('close', () => clearTimeout(deadline));
    };
    request(url, 0);
    file.on('finish', () => {
      if (settled) return;
      try { fs.renameSync(tmp, dest); } catch (err) { return finish(reject, err); }
      finish(resolve, { path: dest, size: received });
    });
    file.on('error', fail);
  });
}

async function concatFiles(sources, dest) {
  // 写流从第一刻起挂 error 监听：合并期间磁盘满/EACCES 若无监听器会以
  // 未捕获异常直接崩掉主进程（历史缺陷），且残留半截目标文件。
  const out = fs.createWriteStream(dest);
  try {
    for (const s of sources) {
      await new Promise((res, rej) => {
        const rs = fs.createReadStream(s);
        rs.on('error', rej);
        rs.on('end', res);
        rs.pipe(out, { end: false });
      });
      fs.rmSync(s, { force: true });
    }
    await new Promise((res, rej) => {
      out.on('error', rej);
      out.end(res);
    });
  } catch (err) {
    out.destroy();
    try { fs.rmSync(dest, { force: true }); } catch {}
    throw err;
  }
}

async function downloadRelease(ctx, release, { onProgress } = {}) {
  const dir = path.join(ctx.userDataDir, 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const sel = selectAsset(release);
  const split = sel.parts.length > 1;
  const finalPath = path.join(dir, sel.name);
  const partPaths = [];
  let merged = 0;
  try {
    for (let i = 0; i < sel.parts.length; i++) {
      const p = sel.parts[i];
      ctx.log('client-update', `下载 ${p.name}（${Math.round(p.size / 1048576)} MB）`);
      const dest = split ? finalPath + '.part' + (i + 1) : finalPath;
      const res = await downloadFile(p.url, dest, {
        onProgress: (r) => {
          if (onProgress) onProgress(split ? merged + r : r, sel.totalSize);
        },
      });
      if (split) { merged += res.size; partPaths.push(dest); }
    }
    if (split) {
      ctx.log('client-update', `合并 ${partPaths.length} 个分片 → ${sel.name}`);
      await concatFiles(partPaths, finalPath);
      partPaths.length = 0; // 分片已删除并合并
    }
  } catch (err) {
    // 中途失败：已下载的分片不再有用，全部清理，避免 updates 目录堆积残片。
    for (const p of partPaths) { try { fs.rmSync(p, { force: true }); } catch {} }
    throw err;
  }
  const stat = fs.statSync(finalPath);
  if (stat.size < MIN_VALID_BYTES) {
    fs.rmSync(finalPath, { force: true });
    throw new Error('下载文件异常（仅 ' + Math.round(stat.size / 1048576) + ' MB），已丢弃');
  }
  if (sel.totalSize > 0 && Math.abs(stat.size - sel.totalSize) > 2 * 1024 * 1024) {
    ctx.log('client-update', `大小与上游声明不一致：期望 ${sel.totalSize} 实际 ${stat.size}（继续，安装器会自校验）`);
  }
  ctx.log('client-update', `下载完成: ${finalPath}（${Math.round(stat.size / 1048576)} MB）`);
  return { filePath: finalPath, size: stat.size };
}

// --- 应用更新（detached 脚本 + 主进程退出） ---------------------------------

// 用完整路径找 cmd.exe（%ComSpec%），避免应用 PATH 精简时 spawn('cmd.exe') 报 ENOENT。
function cmdExe() {
  return process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
}

// 脚本顶部统一定义 System32 工具路径，避免脚本运行时依赖 PATH 精简的进程环境。
const SYS = [
  'set "PG=%SystemRoot%\\System32\\ping.exe"',
].join('\r\n');

// 便携版更新脚本（cmd）：仅依赖文件操作与 ping，在 detached 无控制台进程下
// 工作正常（不依赖 tasklist/find 这类控制台程序输出）。
//
// 更新失败自愈（「下载成功但重启后仍是旧版」的根因修复）：
//   · 替换 NEW->OLD 失败时重试 12 次（每次约 2s），吸收杀软对刚下载完的
//     安装包扫描锁定等瞬时占用；
//   · 等待旧 exe 解锁超过约 20s 仍失败时，用 `copy /y NUL` 写入探针区分
//     「目录只读」与「文件仍被占用」（copy 的 errorlevel 可靠，且对已存在
//     的只读/目录型探针路径同样有效）：只读目录不再空等 10 分钟，直接降级
//     为启动新 exe（与 README 承诺一致），并保留下载文件；
//   · 替换失败且目录可写时，尽力用 .bak 还原当前版本并启动，绝不留坏 exe。
// 日志路径经 `%~1` 位置参数传入（脚本自身不内嵌任何路径，规避含空格路径的
// cmd 引号剥离问题）。
function buildPortableCmd() {
  return [
    '@echo off',
    SYS,
    'set "LOG=%~1"',
    'set "NEW=%~2"',
    'set "OLD=%~3"',
    'echo [%date% %time%] apply-update start (portable) >> "%LOG%"',
    'echo [%date% %time%] new=%NEW% >> "%LOG%"',
    'echo [%date% %time%] old=%OLD% >> "%LOG%"',
    'set /a tries=0',
    ':wait',
    'set /a tries+=1',
    'if %tries% gtr 300 goto replace_failed',
    '%PG% -n 2 127.0.0.1 >nul',
    'if not exist "%OLD%" goto replace',
    'copy /y "%OLD%" "%OLD%.bak" >nul 2>&1',
    'if errorlevel 1 goto wait_probe',
    'del /f /q "%OLD%" >nul 2>&1',
    'if exist "%OLD%" goto wait_probe',
    'goto replace',
    ':wait_probe',
    'if %tries% geq 10 (',
    '  copy /y NUL "%OLD%.dsh-write-test" >nul 2>&1',
    '  if errorlevel 1 goto replace_failed',
    '  del "%OLD%.dsh-write-test" >nul 2>&1',
    ')',
    'goto wait',
    ':replace',
    'echo [%date% %time%] replacing current build >> "%LOG%"',
    'set /a rtry=0',
    ':retry_replace',
    'copy /y "%NEW%" "%OLD%" >nul 2>&1',
    'if not errorlevel 1 goto replaced',
    'set /a rtry+=1',
    'if %rtry% lss 12 (',
    '  %PG% -n 2 127.0.0.1 >nul',
    '  goto retry_replace',
    ')',
    'goto replace_failed',
    ':replaced',
    'echo [%date% %time%] replaced, relaunching >> "%LOG%"',
    'start "" "%OLD%"',
    'if exist "%OLD%.bak" del "%OLD%.bak" >nul 2>&1',
    'del "%NEW%" >nul 2>&1',
    '(goto) 2>nul & del "%~f0"',
    'exit /b 0',
    ':replace_failed',
    'echo [%date% %time%] replace failed; probing target dir >> "%LOG%"',
    'copy /y NUL "%OLD%.dsh-write-test" >nul 2>&1',
    'if not errorlevel 1 (',
    '  del "%OLD%.dsh-write-test" >nul 2>&1',
    '  echo [%date% %time%] target dir writable; restoring current build >> "%LOG%"',
    '  goto restore_old',
    ')',
    'echo [%date% %time%] target dir read-only; launching new build directly >> "%LOG%"',
    'if not exist "%NEW%" goto restore_old',
    'start "" "%NEW%"',
    '(goto) 2>nul & del "%~f0"',
    'exit /b 0',
    ':restore_old',
    'echo [%date% %time%] restoring current build >> "%LOG%"',
    'if exist "%OLD%.bak" copy /y "%OLD%.bak" "%OLD%" >nul 2>&1',
    'if not exist "%OLD%" copy /y "%NEW%" "%OLD%" >nul 2>&1',
    'if exist "%OLD%" (start "" "%OLD%") else (start "" "%NEW%")',
    'if exist "%OLD%.bak" del "%OLD%.bak" >nul 2>&1',
    '(goto) 2>nul & del "%~f0"',
    'exit /b 0',
  ].join('\r\n');
}

// 安装版更新脚本（PowerShell）。关键点：更新脚本以 detached 方式启动，运行在
// 无控制台的进程里，此时 cmd 的 tasklist/find 等控制台程序输出会全部丢失，
// 导致“等待应用退出 → 拉起安装器”这段静默卡死（“点安装无反应”的根因）。
// PowerShell 走 .NET 流，Get-Process 进程检测与 Add-Content 写日志在 detached
// 下均正常，因此安装版改用 PowerShell。
function buildNsisPs1() {
  return String.raw`param(
  [Parameter(Mandatory=$true)][string]$Setup,
  [Parameter(Mandatory=$true)][string]$ProcessName,
  [Parameter(Mandatory=$true)][string]$OldExe,
  [Parameter(Mandatory=$true)][string]$LogFile
)
function Log($m) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"), $m
  Add-Content -LiteralPath $LogFile -Value $line
}
Log "apply-update start (nsis)"
Log "setup=$Setup"
Log "process=$ProcessName"
$waitc = 0
while ($true) {
  $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
  if (-not $p) { break }
  $waitc++
  if ($waitc -gt 20) {
    Log "app still running after grace, force kill"
    Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    break
  }
  Start-Sleep -Milliseconds 1500
}
Log "app exited, launching setup"
$setupSucceeded = $false
try {
  $sp = Start-Process -FilePath $Setup -Wait -PassThru -ErrorAction Stop
  Log ("setup finished (err=" + $sp.ExitCode + ")")
  # Only exit code 0 means "installed": NSIS returns non-zero when the user
  # cancels or the wizard fails. Treating every completed process as success
  # made the cancelled-update path delete the retained installer package and
  # break the retry loop.
  $setupSucceeded = ($sp.ExitCode -eq 0)
} catch {
  Log ("setup launch failed: " + $_.Exception.Message)
}
# The installer may be blocked by security software, and old NSIS
# templates may not relaunch the app even when configured to. Wait up to
# 15s; if the new build is still not running, locate the install dir from
# the uninstall registry and start it explicitly, fixing "update exits
# but never restarts".
$launched = $false
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  $running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
  if ($running) { $launched = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $launched -and $setupSucceeded) {
  try {
    $uninstallRoots = @(
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
      'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
      'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $candidate = $null
    foreach ($root in $uninstallRoots) {
      $entry = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq 'DSH Desktop' } | Select-Object -First 1
      if ($entry) { $candidate = $entry; break }
    }
    $appExe = $null
    if ($candidate) {
      $uninstall = [string]$candidate.UninstallString
      $m = [regex]::Match($uninstall, '"([^"]+)"')
      if ($m.Success -and $m.Groups[1].Value) {
        $dir = Split-Path -Parent $m.Groups[1].Value
        $possible = Join-Path $dir 'DSH Desktop.exe'
        if (Test-Path -LiteralPath $possible) { $appExe = $possible }
      }
      if (-not $appExe -and $candidate.InstallLocation) {
        $possible = Join-Path ([string]$candidate.InstallLocation) 'DSH Desktop.exe'
        if (Test-Path -LiteralPath $possible) { $appExe = $possible }
      }
    }
    if ($appExe) {
      Log "installer did not launch app; starting $appExe"
      Start-Process -FilePath $appExe -ErrorAction Stop
      $launched = $true
    } else {
      Log "installer did not launch app and installed exe was not found"
    }
  } catch {
    Log ("post-install launch check failed: " + $_.Exception.Message)
  }
} elseif (-not $setupSucceeded) {
  Log "setup did not complete"
}
# Fallback: whether the installer succeeded or was cancelled/failed, never
# leave the user staring at "I clicked restart and the app disappeared".
# If the new build cannot be found, relaunch the previous build instead.
if (-not $launched) {
  if (Test-Path -LiteralPath $OldExe) {
    Log ("restarting previous build: " + $OldExe)
    try {
      Start-Process -FilePath $OldExe -ErrorAction Stop
    } catch {
      Log ("previous build launch failed: " + $_.Exception.Message)
    }
  } else {
    Log "previous build not found; user will need to start the app manually"
  }
}
# Keep the installer package when the update did not actually take effect
# (setup failed/cancelled or the new build never started), so the next boot
# can offer "retry install" with the already-downloaded file instead of
# forcing a full re-download.
if ($setupSucceeded -and $launched) {
  Remove-Item -LiteralPath $Setup -Force -ErrorAction SilentlyContinue
  Log "apply-update succeeded; installer package removed"
} else {
  Log "apply-update did not take effect; installer package kept for retry: $Setup"
}
Log "apply-update done"
`;
}

// 安装版更新入口用 cmd 包装器调用 PowerShell。实测：detached+stdio ignore 下
// 直接 spawn powershell.exe 会静默退出、什么都不干；经 cmd 包装器调用则正常。
// 参数经 cmd 位置参数（%~1..%~4）透传，避免在 .cmd 里内嵌含空格的路径。
function buildNsisCmd() {
  return [
    '@echo off',
    'set "PSEXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    'if not exist "%PSEXE%" set "PSEXE=powershell.exe"',
    'set "PS1=%~1"',
    'set "SETUP=%~2"',
    'set "PROC=%~3"',
    'set "OLD=%~4"',
    'set "LOGF=%~5"',
    '"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Setup "%SETUP%" -ProcessName "%PROC%" -OldExe "%OLD%" -LogFile "%LOGF%"',
  ].join('\r\n');
}

function applyUpdate(ctx, pending) {
  // 更新脚本（cmd/ps1 + exe/安装器替换）为 Windows 专属；macOS 版暂不支持
  // 自动更新（入口已降级为提示手动下载），此处兜底拒绝执行。
  if (process.platform !== 'win32') {
    throw new Error('当前平台暂不支持客户端自动更新（请手动下载新版安装包）');
  }
  const newExe = pending.path;
  const portable = isPortable();
  const oldExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const procName = path.basename(oldExe, path.extname(oldExe)); // 如 "DSH Desktop"
  const dir = path.join(ctx.userDataDir, 'updates');
  const logFile = path.join(dir, 'apply-update.log');
  fs.mkdirSync(dir, { recursive: true });
  let script, child;
  if (portable) {
    script = path.join(dir, 'apply-update.cmd');
    fs.writeFileSync(script, buildPortableCmd(logFile));
    ctx.log('client-update', `启动便携版更新脚本: ${script}（新: ${newExe}，旧: ${oldExe}）日志: ${logFile}`);
    // 关键：cmd /c 会把带引号且含空格的批处理路径剥掉首尾引号，
    // 导致 "C:\...\DSH Desktop\updates\apply-update.cmd" 被当成
    // "C:\...\DSH" 去执行并静默失败（“点击后重启、无安装界面”的根因）。
    // 因此把 cwd 切到 updates 目录，/c 只传不含空格的脚本文件名。
    child = spawn(cmdExe(), ['/d', '/c', path.basename(script), logFile, newExe, oldExe], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    const ps1 = path.join(dir, 'apply-update.ps1');
    script = path.join(dir, 'apply-update.cmd');
    // 必须带 BOM 写 UTF-8：Windows PowerShell 5.1 对无 BOM 的 .ps1 按系统
    // ANSI 代码页（中文系统 = GBK）解码，模板中的中文注释被误读且可能吞掉
    // 换行符，脚本在解析阶段报 Unexpected token '}' 直接退出（客户端更新
    // “下载完重启无反应”的根因之一，见 issue #23）。模板本身已 ASCII 化，
    // BOM 保证将来再写入非 ASCII 注释也不会重蹈覆辙。
    fs.writeFileSync(ps1, '\uFEFF' + buildNsisPs1(), 'utf8');
    fs.writeFileSync(script, buildNsisCmd());
    ctx.log('client-update', `启动安装版更新脚本: ${script}→${path.basename(ps1)}（安装包: ${newExe}，进程: ${procName}，旧版: ${oldExe}）日志: ${logFile}`);
    // 同便携版：/c 的第一个参数不能是含空格的完整路径，否则脚本根本不执行。
    child = spawn(cmdExe(), ['/d', '/c', path.basename(script), path.basename(ps1), newExe, procName, oldExe, logFile], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  child.on('error', (err) => ctx.log('client-update', '启动更新脚本失败: ' + err.message));
  child.on('exit', (code) => {
    if (code !== 0) ctx.log('client-update', `更新脚本提前退出（exit ${code}），日志: ${logFile}`);
  });
  child.unref();
  return { script, logFile };
}

module.exports = {
  checkLatest,
  selectAsset,
  downloadRelease,
  applyUpdate,
  buildPortableCmd,
  buildNsisPs1,
  buildNsisCmd,
  currentArch,
  resolveRepos,
  DEFAULT_REPOS,
};