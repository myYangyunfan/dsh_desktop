'use strict';

// DSH Desktop 客户端自更新引擎（更新“封装客户端本身”，与 updater.js 的
// dsh agent 更新互相独立）。
//
// 流程：
//   1. checkLatest(): 依次查询上游发布源（GitHub Releases → Gitee Releases，
//      可用环境变量 DSH_DESKTOP_RELEASE_API 指向自定义镜像 API），取 latest
//      release 的 tag 作为版本号，与当前 APP_VERSION 比较。
//   2. selectAsset(): 按当前部署形态选择安装包 —— 便携版选
//      *-portable-x64.exe；安装版选 Setup-*-x64.exe。Gitee 因单文件 100MB
//      限制把安装包拆成 .part1/.part2 分片，此时自动按序下载并拼接。
//   3. downloadRelease(): 流式下载（带进度回调）到 <userData>/updates/。
//   4. applyUpdate(): 写一个纯 ASCII 的 cmd 脚本并以 detached 方式启动，随后
//      主进程退出：
//      · 便携版：等旧 exe 解锁 → 备份 → 用新 exe 原地替换 → 重新启动；
//        若旧 exe 所在目录只读，则退化为直接启动新 exe（保留旧文件）。
//      · 安装版：等 DSH Desktop 进程退出 → 以向导方式启动新 Setup 安装包
//        （安装器会记录原安装目录并在完成后自动启动新版本）。
//
// 脚本全程写日志到 <userData>/updates/apply-update.log，并全部使用
// System32 完整路径，避免应用 PATH 精简时 cmd/tasklist/find/ping/taskkill
// 找不到导致更新脚本静默失败（“点安装没反应”的根因之一）。

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
  const wanted = isPortable() ? /-portable-x64\.exe$/i : /-setup-.*-x64\.exe$/i;
  const direct = release.assets.find((a) => wanted.test(a.name));
  if (direct) return { parts: [direct], name: direct.name, totalSize: direct.size };

  // Gitee 单文件 100MB 限制：安装包拆分为 <file>.part1 / <file>.part2 …
  const base = isPortable()
    ? `DSH-Desktop-${release.version}-portable-x64.exe`
    : `DSH-Desktop-Setup-${release.version}-x64.exe`;
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
      file.close(() => {});
      try { fs.rmSync(tmp, { force: true }); } catch {}
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
        const total = Number(res.headers['content-length'] || 0);
        res.on('data', (c) => {
          received += c.length;
          if (onProgress) { try { onProgress(received, total); } catch {} }
        });
        res.pipe(file);
      });
      req.setTimeout(60000, () => req.destroy(new Error('下载超时')));
      req.on('error', fail);
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
  const out = fs.createWriteStream(dest);
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
}

async function downloadRelease(ctx, release, { onProgress } = {}) {
  const dir = path.join(ctx.userDataDir, 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const sel = selectAsset(release);
  const split = sel.parts.length > 1;
  const finalPath = path.join(dir, sel.name);
  const partPaths = [];
  let merged = 0;
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
function buildPortableCmd(logFile) {
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
    'if %tries% gtr 300 goto failed',
    '%PG% -n 2 127.0.0.1 >nul',
    'if not exist "%OLD%" goto replace',
    'copy /y "%OLD%" "%OLD%.bak" >nul 2>&1',
    'if errorlevel 1 goto wait',
    'del /f /q "%OLD%" >nul 2>&1',
    'if exist "%OLD%" goto wait',
    ':replace',
    'copy /y "%NEW%" "%OLD%" >nul 2>&1',
    'if errorlevel 1 goto failed',
    'del "%NEW%" >nul 2>&1',
    'echo [%date% %time%] replaced, relaunching >> "%LOG%"',
    'start "" "%OLD%"',
    'if exist "%OLD%.bak" del "%OLD%.bak" >nul 2>&1',
    'del "%~f0" >nul 2>&1',
    'exit /b 0',
    ':failed',
    // M3 修复：超时后先尽力复制回原位再启动，避免便携版从 updates 目录
    // 直接启动导致新建 data 目录、丢失设置。
    'echo [%date% %time%] timed out, restoring >> "%LOG%"',
    'if exist "%OLD%.bak" copy /y "%OLD%.bak" "%OLD%" >nul 2>&1',
    'if not exist "%OLD%" copy /y "%NEW%" "%OLD%" >nul 2>&1',
    'if exist "%OLD%" (start "" "%OLD%") else (start "" "%NEW%")',
    'if exist "%OLD%.bak" del "%OLD%.bak" >nul 2>&1',
    'del "%~f0" >nul 2>&1',
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
  $setupSucceeded = $true
} catch {
  Log ("setup launch failed: " + $_.Exception.Message)
}
# 安装器即使配置了自动启动，也可能被安全软件拦截或在旧版 NSIS
# 模板里不拉起应用。这里最多等 15 秒；若新版本仍未运行，则从
# 卸载注册表定位安装目录并显式启动，解决“更新完只退出、不重启”。
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
# 兜底：无论安装器成功还是失败/被取消，都不要让用户面对「点了立即重启，
# 应用却消失了」。找不到新版本时就重新拉起旧版本，保留可见状态。
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
Remove-Item -LiteralPath $Setup -Force -ErrorAction SilentlyContinue
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
    fs.writeFileSync(ps1, buildNsisPs1(), 'utf8');
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

module.exports = { checkLatest, selectAsset, downloadRelease, applyUpdate, isPortable, resolveRepos, DEFAULT_REPOS };