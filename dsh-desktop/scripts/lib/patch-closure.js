'use strict';
// ---------------------------------------------------------------------------
// 补丁收口核验（纯读盘，绝不写）：给定 ctx，判定注册表声明的每项 file 补丁
// 是否已经落到这棵树的磁盘字节上。
//
// 为什么单独成模块（而不是各写一份判据）：这条不变量有两个消费方 ——
//   · 单测 unit-patch-deps-coverage 的 E 项：dev 树随时必须是收敛态；
//   · 打包门禁 verify-payload-patches.js（stage-payload.sh 调用）：payload
//     带病就不许出安装包。
// 两处各写一份判据，本身就制造了本次要消灭的「双源漂移」。
//
// 事故背景（2026-09-05）：4 枚 file 补丁登记在案却从未重放进 dev 树，stage
// 出去的 payload 直接继承这棵滞后树 ⇒ 0.6.2 安装包不含这些已声明的修复，
// 而全套测试当时一路全绿（结构守卫 A/B/C/D 谁都不看磁盘当前字节）。
//
// 判据取 transform 的 status 而非 marker 文本：'changed' 恰好等价于「磁盘
// 字节比代码旧」；marker 判定会被多版本变体（v1/v2 marker 不同名）误伤。
//   already        = 已收敛
//   changed        = 滞后（该修复没进这棵树）→ lag
//   anchor-missing = 上游已自然退役 → 计 retired，不算滞后
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { PATCH_SPECS } = require('./patch-registry');
const { resolvePatchTargets } = require('./patch-target-resolver');

/** profile-boot-dirs 布局返回目录，runner 在其中 glob —— 此处同语义展开。 */
const PROFILE_BOOT_FILE_RE = /^profile-boot-.*\.js$/;

/**
 * 该补丁在给定 ctx 下实际会碰到的、磁盘上已存在的靶文件。
 * 逐 pkgRel 解析（与 patch-runner.applyFile 的多靶循环一致），去重。
 */
function resolveAppliedTargets(ctx, spec) {
  const rels = Array.isArray(spec.pkgRels) && spec.pkgRels.length ? spec.pkgRels : [null];
  const out = [];
  for (const rel of rels) {
    const targets = resolvePatchTargets(ctx, rel ? { ...spec, pkgRel: rel } : spec);
    for (const t of targets) {
      let st = null;
      try { st = fs.statSync(t); } catch { continue; }
      if (st.isDirectory()) {
        let names = [];
        try { names = fs.readdirSync(t); } catch { continue; }
        for (const f of names.filter((n) => PROFILE_BOOT_FILE_RE.test(n)).sort()) out.push(path.join(t, f));
      } else {
        out.push(t);
      }
    }
  }
  return [...new Set(out)];
}

/**
 * 核验一棵树的收口状态。
 * @param {{home:string, appDir:string, userDataDir:string, wslMode:boolean}} ctx
 * @param {Array<object>} [specs] 默认全部 file 规格（root 规格无 pkgRel，不参与）
 * @returns {{checked:number, lags:Array<object>, retired:string[], noTarget:string[], fileSpecs:number}}
 */
function checkPatchClosure(ctx, specs = PATCH_SPECS.filter((s) => s.kind === 'file')) {
  const report = { checked: 0, lags: [], retired: [], noTarget: [], fileSpecs: specs.length };
  for (const spec of specs) {
    const targets = resolveAppliedTargets(ctx, spec);
    if (!targets.length) { report.noTarget.push(spec.id); continue; }
    for (const f of targets) {
      let r;
      try {
        r = spec.transform(fs.readFileSync(f, 'utf8'), f);
      } catch (err) {
        // transform 抛错按滞后处理：读盘/语法问题都要人看，不能静默放行。
        report.lags.push({ id: spec.id, file: f, status: 'throw', note: err.message });
        continue;
      }
      report.checked += 1;
      if (r.status === 'changed') report.lags.push({ id: spec.id, file: f, status: r.status, note: r.note || '' });
      else if (r.status === 'anchor-missing') report.retired.push(`${spec.id} (${r.detail || ''})`);
    }
  }
  return report;
}

module.exports = { checkPatchClosure, resolveAppliedTargets };
