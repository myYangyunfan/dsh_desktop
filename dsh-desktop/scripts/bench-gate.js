'use strict';

// A-13: 启动性能门禁——对比 boot-bench.js 的基准 JSON 与仓库基线，
// boot:ready p50 超基线容差（默认 +20%）时输出告警；--fail 时以非零退出码
// 阻断（CI 硬门禁），缺基线时仅输出提示（首跑/基线未生成场景不误报）。
//
// 用法:
//   node scripts/bench-gate.js <bench.json> [--baseline <baseline.json>] [--tolerance 1.2] [--fail]
// 基线文件建议路径: scripts/bench-baseline.json（由本机/CI 稳定环境实测生成
// 后提交进仓库；生成方式: node scripts/boot-bench.js --count 5 --json scripts/bench-baseline.json）
// 纯函数经 module.exports 导出，供 bench-gate.test.js 单测。

const fs = require('node:fs');

/** 默认容差：p50 超基线 1.2 倍即告警（v5.2-FINAL A-13 约定 +20%）。 */
const BENCH_DEFAULT_TOLERANCE = 1.2;

function readJsonLoose(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.p50 !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 对比基准与基线。返回 {ok, missingBaseline, violations, totalP50, baselineTotalP50}。
 * violations = [{stage, baseP50, benchP50, pct}]（pct = bench/base 百分比，已超容差）。
 * @param {object} base 基线 {p50:{boot:ready: ...}, totalP50}
 * @param {object} bench 本次 {p50:{...}, totalP50}
 * @param {number} tolerance
 */
function compareBench(base, bench, tolerance) {
  const tol = (typeof tolerance === 'number' && tolerance > 1) ? tolerance : BENCH_DEFAULT_TOLERANCE;
  const violations = [];
  for (const key of Object.keys(base.p50 || {})) {
    const b = base.p50[key];
    const v = bench && bench.p50 && bench.p50[key];
    if (typeof b !== 'number' || typeof v !== 'number' || b <= 0) continue;
    const pct = v / b;
    if (pct > tol) {
      violations.push({ stage: key, baseP50: b, benchP50: v, pct: Math.round(pct * 100) });
    }
  }
  return {
    ok: violations.length === 0,
    missingBaseline: false,
    violations,
    totalP50: bench && bench.totalP50,
    baselineTotalP50: base.totalP50,
  };
}

function formatReport(result) {
  const lines = [];
  if (result.missingBaseline) {
    lines.push('[bench-gate] 未找到基线文件——本次仅记录结果，跳过对比（首跑/基线缺失时不误报）。');
    lines.push('[bench-gate] 生成基线: node scripts/boot-bench.js --count 5 --json scripts/bench-baseline.json，并把结果提交进仓库。');
    return lines.join('\n');
  }
  lines.push('[bench-gate] boot:ready p50 = ' + result.totalP50 + ' ms（基线 ' + result.baselineTotalP50 + ' ms，容差 +' +
    Math.round((BENCH_DEFAULT_TOLERANCE - 1) * 100) + '%）');
  if (result.violations.length === 0) {
    lines.push('[bench-gate] PASS：无阶段超出基线容差。');
  } else {
    lines.push('[bench-gate] 告警：以下阶段 p50 超出基线容差:');
    for (const v of result.violations) {
      lines.push('  ' + v.stage + ': ' + v.benchP50 + ' ms vs 基线 ' + v.baseP50 + ' ms（' + v.pct + '%）');
    }
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const benchFile = args.find((a) => !a.startsWith('--'));
  const baselineFile = (() => {
    const i = args.indexOf('--baseline');
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })();
  const tolerance = (() => {
    const i = args.indexOf('--tolerance');
    const v = i >= 0 && args[i + 1] ? parseFloat(args[i + 1]) : NaN;
    return Number.isFinite(v) && v > 1 ? v : BENCH_DEFAULT_TOLERANCE;
  })();
  const failHard = args.includes('--fail');
  if (!benchFile) {
    console.error('[bench-gate] 用法: node scripts/bench-gate.js <bench.json> [--baseline <baseline.json>] [--tolerance 1.2] [--fail]');
    process.exit(2);
  }
  const bench = readJsonLoose(benchFile);
  if (!bench) {
    console.error('[bench-gate] 无法读取基准 JSON（缺失或损坏）: ' + benchFile);
    process.exit(2);
  }
  if (!baselineFile || !fs.existsSync(baselineFile)) {
    const result = {
      ok: true,
      missingBaseline: true,
      violations: [],
      totalP50: bench.totalP50,
      baselineTotalP50: null,
    };
    console.log(formatReport(result));
    return;
  }
  const base = readJsonLoose(baselineFile);
  if (!base) {
    console.error('[bench-gate] 基线文件损坏，请重新生成: ' + baselineFile);
    process.exit(2);
  }
  const result = compareBench(base, bench, tolerance);
  console.log(formatReport(result));
  if (failHard && !result.ok) process.exit(1);
}

module.exports = { BENCH_DEFAULT_TOLERANCE, compareBench, formatReport };
if (require.main === module) main();