'use strict';

// ---------------------------------------------------------------------------
// 统一运行时补丁应用引擎（唯一实现）。
//
// main.js 的 12 个 apply* 函数与 scripts/sync-companion-plugins.js 的
// applyRuntimePatches 曾各自手写同一套机械循环：「候选路径过滤 → 进程级读
// → 读取失败日志 → 幂等已应用判定 → 锚点失配判定 → 写入 → 成功日志 → 异常
// 日志」，只在文案与判定细节上各不相同，并逐步漂移出「原子写 vs 非原子写、
// marker vs anchor-diff 幂等约定不一致」等问题。本模块把循环收口为一处：
// 每个补丁只声明自己的变换函数与日志文案，不再复制机械性样板。
//
// 兼容性契约（对旧实现逐字一致）：
//   - 文件不存在 / 空路径：静默跳过；
//   - 读取失败：统一输出 `${prefix}: 读取失败，跳过 ${file}`；
//   - 变换返回 already 且未提供 alreadyLog：静默跳过（与 profile patch 防护
//     等旧实现一致）；提供 alreadyLog 则输出 `${prefix}: ${alreadyLog(file)}`；
//   - 变换返回 anchor-missing：输出 `${prefix}: ${detail}`（detail 由变换方
//     拼好，可含文件路径，与旧实现各补丁文案一致）；
//   - 变换返回 changed：写入（默认原子写）+ 输出 `${prefix}: ${doneLog(file, note)}`；
//   - dryRun 模式：不落盘，改用 dryRunChangedLog(file, note) 输出计划文案；
//   - 任何异常：输出 failLog(file, err)，默认 `${prefix}失败(${file}): ${err.message}`。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const { writeFileAtomic, readFileCached } = require('./patch-io');

// P0-2 补丁代际签名：批次执行时由 main.js 挂收集钩子，把本批次实际候选的
// 目标文件集合记录下来（供下次启动的签名判定）。批次外（sync 等单点调用）
// 钩子为空，不收集。
let patchCollectHook = null;
function setPatchCollectHook(fn) { patchCollectHook = fn; }

/**
 * 对一组候选文件依次应用同一个补丁变换。
 *
 * @param {Object} spec
 * @param {string} spec.prefix           日志前缀（如 'runtime 补丁'）
 * @param {string[]} spec.files          候选文件路径（空项/不存在的文件静默跳过）
 * @param {(msg: string) => void} spec.log
 * @param {(src: string, file: string) =>
 *   { status: 'already' }
 *   | { status: 'anchor-missing', detail: string }
 *   | { status: 'changed', src: string, note?: any }} spec.transform
 * @param {(file: string) => string|null} [spec.alreadyLog]  已应用日志主体；null/缺省 = 静默
 * @param {(msg: string) => void} [spec.anchorLog]           锚点失配日志通道；缺省 = log
 * @param {(file: string, note?: any) => string} [spec.doneLog] 成功日志主体；缺省 '已应用 ' + file
 * @param {boolean} [spec.donePrefix]  成功行是否加 `${prefix}: `；缺省 true
 * @param {(file: string, err: Error) => string} [spec.failLog]
 * @param {boolean} [spec.dryRun]        只判定不落盘（输出 dryRunChangedLog）
 * @param {(file: string, note?: any) => string} [spec.dryRunChangedLog]
 * @param {(file: string, content: string) => void} [spec.write] 写入实现；缺省原子写
 * @returns {number} 实际写入的文件数
 */
function applyPatchToFiles(spec) {
  const {
    prefix,
    files,
    log,
    transform,
    alreadyLog = null,
    anchorLog = log,
    doneLog = (file) => '已应用 ' + file,
    donePrefix = true,
    failLog = (file, err) => `${prefix}失败(${file}): ${err.message}`,
    dryRun = false,
    dryRunChangedLog = null,
    write = writeFileAtomic,
  } = spec;
  let written = 0;
  if (patchCollectHook) {
    for (const file of files) if (file) patchCollectHook(file);
  }
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const src = readFileCached(file);
      if (src === null) {
        log(`${prefix}: 读取失败，跳过 ${file}`);
        continue;
      }
      const result = transform(src, file);
      if (result.status === 'already') {
        if (alreadyLog) log(`${prefix}: ${alreadyLog(file)}`);
        continue;
      }
      if (result.status === 'anchor-missing') {
        anchorLog(`${prefix}: ${result.detail}`);
        continue;
      }
      if (dryRun) {
        if (dryRunChangedLog) log(dryRunChangedLog(file, result.note));
        continue;
      }
      write(file, result.src);
      written += 1;
      const body = doneLog(file, result.note);
      log(donePrefix ? `${prefix}: ${body}` : body);
    } catch (err) {
      log(failLog(file, err));
    }
  }
  return written;
}

module.exports = { applyPatchToFiles, setPatchCollectHook };
