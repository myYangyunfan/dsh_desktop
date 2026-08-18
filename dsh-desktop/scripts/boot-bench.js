'use strict';
/**
 * A-0 启动时间线基准：连续 N 次冷启动 DSH Desktop，读取
 * <userData>/diagnostics/boot-timings.jsonl（boot() 内 bootMark 写入），
 * 输出各阶段 p50（中位数）毫秒与占比，一条命令回答「慢在哪一段」。
 *
 * 用法:
 *   node scripts/boot-bench.js [--count 5] [--exe <路径>] [--userdata <目录>] [--json <文件>]
 *
 * --json <文件>: 汇总后把机器可读结果（各阶段 p50 + 有效次数）写入文件，
 *                供 CI 门禁 bench-gate.js 对比基线（p50 超基线 +20% 告警）。
 *
 * 默认 exe:   %LOCALAPPDATA%\Programs\DSH Desktop\DSH Desktop.exe
 * 默认 userdata: %APPDATA%\DSH Desktop
 * 环境变量:   DSH_BOOT_BENCH_EXE / DSH_BOOT_BENCH_USERDATA 可覆盖（参数优先）。
 *
 * 注意: 脚本会反复 taskkill /F 目标进程，请勿在运行中的重要会话中执行。
 */
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const args = process.argv.slice(2);
function argValue(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const count = Math.min(Math.max(parseInt(argValue('--count', '5'), 10) || 5, 1), 20);
const exe = argValue('--exe', process.env.DSH_BOOT_BENCH_EXE) ||
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DSH Desktop', 'DSH Desktop.exe');
const userData = argValue('--userdata', process.env.DSH_BOOT_BENCH_USERDATA) ||
  path.join(process.env.APPDATA || '', 'DSH Desktop');
const jsonOut = argValue('--json', '');

const timingsFile = path.join(userData, 'diagnostics', 'boot-timings.jsonl');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killApp() {
  return new Promise((resolve) => {
    execFile('taskkill', ['/F', '/T', '/IM', path.basename(exe)], { windowsHide: true }, () => resolve());
  });
}

function readTimingRows() {
  try {
    const text = fs.readFileSync(timingsFile, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function startApp() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exe)) return reject(new Error('未找到应用可执行文件: ' + exe));
    const child = spawn(exe, [], {
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        DSH_DESKTOP_SKIP_AUTO_UPDATE: '1',   // 避免启动后自动更新检查干扰测量
        DSH_DESKTOP_SKIP_CLIENT_UPDATE: '1',
      },
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.unref();
    resolve();
  });
}

// 等待 jsonl 出现新行（>= beforeCount），超时抛错。
async function waitForNewRow(beforeCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = readTimingRows();
    if (rows.length > beforeCount) return rows[rows.length - 1];
    if (Date.now() > deadline) throw new Error('等待启动时间线超时（' + timeoutMs + 'ms），请检查应用是否启动失败');
    await sleep(500);
  }
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  console.log('DSH Desktop 冷启动基准');
  console.log('  exe     : ' + exe);
  console.log('  userdata: ' + userData);
  console.log('  count   : ' + count);
  console.log('  timings : ' + timingsFile);
  console.log('');

  // 阶段显示顺序（与 main.js bootMark 对应）。
  const STAGES = [
    ['boot:backend', '后端配置解析'],
    ['boot:window', '窗口创建(loading)'],
    ['boot:patches', '补丁段开始'],
    ['boot:patches-local', '补丁段完成'],
    ['boot:spawn', '后端进程 spawn'],
    ['boot:first-packet', '首包(URL 行)'],
    ['boot:wait-up', '就绪探测完成'],
    ['boot:load', 'loadURL 完成'],
    ['boot:ui-loaded', 'Web UI DOM 加载'],
    ['boot:ready', 'boot-ready(总时长)'],
  ];

  await killApp();
  await sleep(1500);
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const before = readTimingRows().length;
    process.stdout.write(`  第 ${i}/${count} 次冷启动... `);
    await killApp();
    await sleep(1200);
    await startApp();
    let row;
    try {
      row = await waitForNewRow(before, 240000);
    } catch (err) {
      console.log('失败: ' + err.message);
      await killApp();
      continue;
    }
    rows.push(row);
    console.log(`完成 (${row.ms['boot:ready'] || '?'} ms)`);
    await sleep(800);
  }
  await killApp();

  if (rows.length === 0) {
    console.error('\n没有拿到任何启动数据，退出。');
    process.exit(1);
  }
  console.log('');

  // 汇总：每阶段收集各次 ms 差值（boot:ready 为总时长参照）。
  const series = {};
  for (const [key] of STAGES) series[key] = [];
  for (const row of rows) {
    for (const key of Object.keys(series)) {
      const v = row.ms && row.ms[key];
      if (typeof v === 'number') series[key].push(v);
    }
  }
  const totalP50 = median(series['boot:ready'].slice().sort((a, b) => a - b)) || 1;
  if (jsonOut) {
    const p50 = {};
    for (const [key] of STAGES) {
      const vals = series[key].slice().sort((a, b) => a - b);
      p50[key] = median(vals);
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      exe,
      userData,
      count,
      effectiveRows: rows.length,
      totalP50,
      p50,
    };
    try {
      fs.writeFileSync(jsonOut, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      console.log('\n已写入基准 JSON: ' + jsonOut);
    } catch (err) {
      console.error('写入基准 JSON 失败: ' + err.message);
      process.exit(1);
    }
  }
  console.log('阶段 p50（中位数，毫秒）与占比（相对 boot:ready）:');
  console.log('-'.repeat(72));
  for (const [key, label] of STAGES) {
    const vals = series[key].slice().sort((a, b) => a - b);
    const p50 = median(vals);
    const pct = totalP50 > 0 ? Math.round((p50 / totalP50) * 100) : 0;
    console.log(`  ${label.padEnd(16)} ${String(p50).padStart(7)} ms  ${String(pct).padStart(3)}%  (n=${vals.length})`);
  }
  console.log('-'.repeat(72));
  console.log(`  有效启动次数: ${rows.length}/${count}   p50 总时长: ${totalP50} ms`);
  console.log('  每次明细:');
  rows.forEach((row, i) => {
    console.log(`    #${i + 1} ${row.at} ready=${row.ms['boot:ready']}ms patches=${row.ms['boot:patches-local']}ms spawn=${row.ms['boot:spawn']}ms first-packet=${row.ms['boot:first-packet']}ms`);
  });
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
