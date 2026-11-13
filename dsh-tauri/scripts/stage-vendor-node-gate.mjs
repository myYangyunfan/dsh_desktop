#!/usr/bin/env node
// 交付面门禁④：payload 必须带「内置 node 运行时」。
//
// 为什么要有这一道（2026-11-13 实测取证）：
//   五处 staging（build-windows / build-windows-arm64 / build-portable / build-linux /
//   build-macos）对 vendor/node 都是 `cp -r dsh-desktop/vendor/node "$DEST/vendor/node"`。
//   `cp -r` 对**空源目录**会成功执行，静默产出一个空目录；于是「下载 vendor node」
//   这一步只要没真的把二进制落盘，payload 就没有内置 node，而后续所有门禁都不报错：
//   stage-plugin-gate 只管插件、nsis-gate 只管路径长度。
//   产物侧的证据：v1.0.10 的 Windows x64 便携 zip 中央目录里 `vendor/node/` 存在但
//   **没有 node.exe**（118556 个条目里 0 命中），两个便携包因此体积逐字节相同
//   （598,615,580B）。安装包同源 staging，同样没有内置 node。
//
//   后果落在用户侧：supervisor 的 node 解析三级链是「内置 vendor → 系统 PATH ≥22 →
//   清晰报错」，内置件缺失时，没装 Node.js 的用户直接撞
//   「未找到可用的 Node.js：…安装目录也缺少内置 node（vendor/node/node.exe）」。
//
// 判据（fail-closed，不放行「跑起来再说」）：
//   1. `<dest>/vendor/node/<bin>` 存在；
//   2. 体积 ≥ MIN_BYTES（node.exe / unix node 都是 90MB 量级，20MB 下限只挡占位/截断）；
//   3. unix 二进制必须带可执行位（tar 解出来丢了 +x 就是「文件在但跑不起来」）。
// 失败时把目录实况打出来——绝大多数情况下真因是下载步骤没落盘，直接看得到。

import fs from 'node:fs';
import path from 'node:path';

/** 体积下限：node 二进制 90MB 量级，20MB 只用来挡占位文件与截断下载。 */
export const MIN_VENDOR_NODE_BYTES = 20 * 1024 * 1024;

/** 平台 → vendor/node 下的二进制名（与 stage-payload.sh 的 NODE_BIN 同口径）。 */
export function vendorNodeBinaryFor(platform = process.platform) {
  return platform === 'win32' ? 'node.exe' : 'node';
}

/**
 * 判定 payload 里的内置 node 是否齐备。纯函数，便于单测。
 * @param {string} dest payload 根（例如 dsh-tauri/pp）
 * @param {{ bin?: string, stat?: (p: string) => fs.Stats | null }} [opts]
 * @returns {{ ok: boolean, file: string, problems: string[], size: number }}
 */
export function inspectVendorNode(dest, opts = {}) {
  const bin = opts.bin || vendorNodeBinaryFor();
  const stat = opts.stat || ((p) => {
    try { return fs.statSync(p); } catch { return null; }
  });
  const file = path.join(dest, 'vendor', 'node', bin);
  const problems = [];
  const st = stat(file);
  if (!st) {
    problems.push(`缺件：${file}`);
    return { ok: false, file, problems, size: 0 };
  }
  if (!st.isFile()) {
    problems.push(`不是普通文件：${file}`);
    return { ok: false, file, problems, size: 0 };
  }
  if (st.size < MIN_VENDOR_NODE_BYTES) {
    problems.push(`体积异常：${st.size} 字节 < 下限 ${MIN_VENDOR_NODE_BYTES}（截断下载或占位文件）`);
  }
  if (bin !== 'node.exe' && (st.mode & 0o111) === 0) {
    problems.push(`缺可执行位：${file}（tar 解包后未 chmod +x）`);
  }
  return { ok: problems.length === 0, file, problems, size: st.size };
}

if (process.argv[1] && process.argv[1].endsWith('stage-vendor-node-gate.mjs')) {
  const dest = process.argv[2];
  const bin = process.argv[3];
  if (!dest) {
    console.error('[vendor-node-gate] FATAL: 用法 node stage-vendor-node-gate.mjs <payload 根> [node.exe|node]');
    process.exit(2);
  }
  const res = inspectVendorNode(dest, bin ? { bin } : {});
  const dir = path.join(dest, 'vendor', 'node');
  let listing = '(目录不存在)';
  try {
    const names = fs.readdirSync(dir);
    listing = names.length ? names.join(', ') : '(空目录)';
  } catch { /* 保持默认值 */ }
  if (!res.ok) {
    console.error('[vendor-node-gate] FATAL: payload 缺内置 node 运行时——拒绝打包');
    for (const p of res.problems) console.error(`[vendor-node-gate]   ${p}`);
    console.error(`[vendor-node-gate] ${dir} 实况：${listing}`);
    console.error('[vendor-node-gate] 排查顺序：');
    console.error('[vendor-node-gate]   ① 上一步「Download vendor node」是否真落盘（看它打印的字节数）');
    console.error('[vendor-node-gate]   ② staging 的 cp -r 源目录是否为空（空源目录会被静默复制成空目录）');
    console.error('[vendor-node-gate]   ③ 路径大小写 / 二进制名（win 是 node.exe，unix 是 node）');
    process.exit(1);
  }
  console.log(`[vendor-node-gate] OK: 内置 ${path.basename(res.file)} ${res.size} 字节（${dir}）`);
}
