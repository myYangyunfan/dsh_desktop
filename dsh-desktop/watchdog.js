'use strict';

// DSH Desktop watchdog: keeps the packaged desktop app alive.
//
// The Electron main process launches this tiny Node process detached at boot.
// It polls the parent PID. If the parent disappears:
//   - cleanExit=true in <userData>/run-state.json  -> user quit, update, or
//     fatal-boot path marked the exit intentionally; watchdog exits quietly.
//   - a NEWER instance already took over the state file -> this watchdog exits.
//   - otherwise the app died unexpectedly -> relaunch <exe>.
//
// Guard rails: at most 5 relaunches per 10 minutes, and a 15s grace period
// after each launch so the new instance can write its run-state file first.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function arg(name, fallback) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const watchedPid = Number(arg('pid', '0'));
const exe = arg('exe', '');
const stateFile = arg('state', '');
const logFile = arg('log', '');
const MAX_RESTARTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const GRACE_MS = 15 * 1000;
const POLL_MS = 2000;

let restartCount = 0;
let windowStart = 0;
let lastLaunchAt = 0;

function log(msg) {
  if (!logFile) return;
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  // A-1 统一日志轮转（与 scripts/lib/log-rotate.js 同语义，独立进程内联零依赖）：
  // 超过 5MB 滚动一代（watchdog.log -> .1 -> .2，保留两代），失败不阻断写入。
  try {
    const st = fs.statSync(logFile);
    if (st.size > 5 * 1024 * 1024) {
      try { fs.rmSync(logFile + '.2', { force: true }); } catch {}
      try { if (fs.existsSync(logFile + '.1')) fs.renameSync(logFile + '.1', logFile + '.2'); } catch {}
      fs.renameSync(logFile, logFile + '.1');
      fs.closeSync(fs.openSync(logFile, 'a')); // 重建主文件保持恒存在
    }
  } catch {}
  try { fs.appendFileSync(logFile, line, 'utf8'); } catch {}
}

function alive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; }
}

function launchApp() {
  const now = Date.now();
  if (now - lastLaunchAt < GRACE_MS) return;
  if (restartCount === 0) windowStart = now;
  else if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    restartCount = 0;
  }
  if (restartCount >= MAX_RESTARTS) {
    log(`watchdog: too many restarts (${restartCount}/${MAX_RESTARTS}), giving up`);
    process.exit(0);
  }
  if (!exe || !fs.existsSync(exe)) {
    log('watchdog: app exe missing: ' + exe);
    process.exit(0);
  }
  restartCount += 1;
  lastLaunchAt = now;
  log(`watchdog: relaunching app (attempt ${restartCount}/${MAX_RESTARTS}): ${exe}`);
  try {
    const child = spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
    });
    child.unref();
  } catch (err) {
    // spawn 本身失败（exe 被锁/环境异常）不计入重启额度、不占用宽限：
    // 下一轮 poll 仍可立即重试，而不是白白烧掉一次额度 + 15s 宽限。
    restartCount -= 1;
    lastLaunchAt = 0;
    log('watchdog: spawn failed: ' + ((err && err.message) || err));
  }
}

function poll() {
  if (alive(watchedPid)) return;
  const state = readState();
  if (state && state.cleanExit === true) {
    log('watchdog: clean exit marker found, exiting');
    process.exit(0);
  }
  if (state && state.pid && state.pid !== watchedPid && alive(state.pid)) {
    log(`watchdog: newer instance pid=${state.pid} is running, exiting`);
    process.exit(0);
  }
  log(`watchdog: watched pid=${watchedPid} is gone without clean-exit marker`);
  launchApp();
}

if (!watchedPid || !exe || !stateFile) {
  log('watchdog: missing required arguments pid/exe/state');
  process.exit(0);
}

log(`watchdog: started pid=${process.pid} watching=${watchedPid} exe=${exe}`);
// 不能 unref：watchdog 本身只靠这个定时器保持存活。
setInterval(poll, POLL_MS);
