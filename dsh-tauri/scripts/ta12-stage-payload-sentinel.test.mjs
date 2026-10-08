#!/usr/bin/env node
// ta12-stage-payload-sentinel.test.mjs —— stage-payload.sh 静态哨兵测试（node --test）。
//
// stage-payload.sh 本体约 8 分钟且写 package-payload 镜像，不宜在测试里真跑。
// 本测试静态解析脚本源码中引用的「运行时必需件 / 镜像源 / 尾部工具」清单，
// 与磁盘在位情况对照——任何一件缺失即 fail-fast（哨兵：装出来的包必然起不来
// 的那批文件，脚本自身的 for 循环会拦；这里提前在 CI 无需打包就发现问题，
// 同时锁住「脚本改了依赖清单却忘了补文件」的漂移）。
// 运行：node --test dsh-tauri/scripts/ta12-stage-payload-sentinel.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(HERE, 'stage-payload.sh');
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(REPO, 'dsh-desktop');

const sh = fs.readFileSync(SH, 'utf8');

test('哨兵前提：stage-payload.sh 在位且可解析出必需件清单', () => {
  assert.ok(sh.length > 1000, '脚本内容异常短');
  const m = /for f in package\.json "vendor\/node\/\$NODE_BIN" \\([\s\S]*?)do/.exec(sh);
  assert.ok(m, '应能解析出前置校验 for 循环');
});

test('前置校验清单（脚本 for f in …）全部在 dsh-desktop/ 在位', () => {
  // 从脚本静态抽出硬编码清单（保持与脚本同步；脚本改清单而文件缺失时此处报警）
  const required = [
    'package.json',
    'vendor/node/node.exe',            // Windows（含 Git Bash）分支的 NODE_BIN
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
    'scripts/lib/companion-profile.js',
    'assets/plugins',                  // 内置线：插件源是安装包载荷，缺它=空壳包
  ];
  const missing = required.filter((f) => !fs.existsSync(path.join(SRC, f)));
  assert.deepEqual(missing, [], 'stage-payload 前置必需件缺失: ' + missing.join(', '));
});

test('镜像源目录在位：scripts / assets / vendor/npm / node_modules', () => {
  for (const d of ['scripts', 'assets', 'vendor/npm', 'node_modules']) {
    assert.ok(fs.existsSync(path.join(SRC, d)), `镜像源缺失: dsh-desktop/${d}`);
  }
});

test('boot 链根级 *.js 非空，且历史踩坑文件 profile-manifest.js 在位', () => {
  const rootJs = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
  assert.ok(rootJs.length > 0, 'dsh-desktop 根级应至少有一个 boot 链 *.js');
  // 脚本注释点名：曾漏 profile-manifest.js 导致安装包首启全灭
  assert.ok(fs.existsSync(path.join(SRC, 'profile-manifest.js')),
    'profile-manifest.js（注释标注的历史踩坑件）应在位');
});

test('脚本尾部调用的 build-client-compat.mjs 在位', () => {
  assert.ok(/build-client-compat\.mjs/.test(sh), '脚本应引用 build-client-compat.mjs');
  assert.ok(fs.existsSync(path.join(HERE, 'build-client-compat.mjs')), 'build-client-compat.mjs 应在 scripts/ 在位');
});

test('robocopy 护栏在位（退出码 <8 才算失败——v0.5.1 全链夭折回归）', () => {
  assert.ok(/"\$rc" -lt 8/.test(sh), 'mirror_dir 必须保留 rc<8 判定');
  assert.ok(/\/\/MIR/.test(sh), '镜像必须用 //MIR（幂等全量镜像）');
});

test('devDeps 排除清单与 node_modules 现状一致（electron* 不进 payload）', () => {
  const m = /\/\/XD (electron electron-builder electron-winstaller)/.exec(sh);
  assert.ok(m, '排除清单形态改变时请同步本哨兵');
  // 被排除目录可以存在（源头装了 devDeps），但清单本身必须精确三件
  assert.equal(m[1], 'electron electron-builder electron-winstaller');
});

// ---------------------------------------------------------------------------
// v1.0.0 内置线（2026-10-08 裁定，反转此前的「官方形状 / 插件不进包」口径）：
// `assets/plugins` 整树进安装包。口径 = 四层，缺一层即形态漂移：
//   ① assets 镜像行不得排除 plugins（但仍须排除 .pnpm，且不得一刀切 node_modules）
//   ② 镜像后不得再有 `rm -rf "$DST/assets/plugins"`
//   ③ 交付门禁 stage-plugin-gate.mjs 必须接线（剪残留依赖树 + 校验安装态超长路径）
//   ④ 数量门禁「源目录数 = payload 目录数」必须在位
//   随包预设（assets/agent-presets）已整树删除，不在本口径内。
// ---------------------------------------------------------------------------

/** 把 stage-payload.sh 源码按内置线四层判据走一遍，返回违规清单（空 = 合规）。 */
function bundledShapeViolations(src) {
  const m = /mirror_dir "\$SRC\/assets" "\$DST\/assets"([^\n]*)/.exec(src);
  const v = [];
  if (!m) {
    v.push('解析不到 assets 镜像行');
    return v;
  }
  const excluded = m[1];
  if (/\bplugins\b/.test(excluded)) v.push('assets 镜像仍在排除 plugins（内置线必须整树随包）');
  if (/^\s*rm -rf "\$DST\/assets\/plugins"/m.test(src)) v.push('镜像后又把 assets/plugins 删了');
  if (!/stage-plugin-gate\.mjs/.test(src)) v.push('内置线交付门禁（残留 + 超长路径）未接线');
  // 咬实际比较式而不是变量名——变量名在 echo 里也出现，只判「有没有提到」等于没判。
  if (!/"\$dst_plugin_count" -ne "\$src_plugin_count"/.test(src)) {
    v.push('缺「源目录数 = payload 目录数」数量门禁');
  }
  if (!excluded.includes('.pnpm')) v.push('assets 镜像未 //XD .pnpm');
  if (/\bnode_modules\b/.test(excluded)) v.push('对 assets 一刀切排除 node_modules');
  return v;
}

test('内置线：assets 镜像带 plugins + 交付门禁接线 + 数量门禁，四层齐备', () => {
  assert.deepEqual(bundledShapeViolations(sh), [], 'stage-payload.sh 内置线口径不完整');
});

test('反证：内置线判据每一项都真的有捕获力（逐项拆掉必须变红）', () => {
  const mutants = [
    ['把 //XD plugins 加回来', (s) => s.replace('mirror_dir "$SRC/assets" "$DST/assets" //XD .pnpm',
      'mirror_dir "$SRC/assets" "$DST/assets" //XD .pnpm plugins')],
    ['把镜像后的 rm 加回来', (s) => s.replace('find "$DST/assets" -type d -name .pnpm',
      'rm -rf "$DST/assets/plugins"\nfind "$DST/assets" -type d -name .pnpm')],
    ['摘掉交付门禁接线', (s) => s.replace(/node "\$REPO_ROOT\/dsh-tauri\/scripts\/stage-plugin-gate\.mjs"[\s\S]*?\r?\n\}\r?\n/, '# (gate removed)\n')],
    ['摘掉数量门禁', (s) => s.replace(/if \[ ! -d "\$DST\/assets\/plugins" \][\s\S]*?\r?\nfi\r?\n/, '')],
    ['一刀切排除 node_modules（会误杀 dsh-pocket 的正件依赖树）',
      (s) => s.replace('//XD .pnpm', '//XD .pnpm node_modules')],
    ['连 .pnpm 防线一起拆掉', (s) => s.replace('//XD .pnpm', '')],
  ];
  for (const [label, mutate] of mutants) {
    const mutated = mutate(sh);
    assert.notEqual(mutated, sh, `反证夹具无效：变异未改变源码（${label}）`);
    assert.notDeepEqual(bundledShapeViolations(mutated), [], `判据对「${label}」无捕获力`);
  }
});

test('assets 镜像保留 .pnpm 排除（NSIS >260 字符路径中断建包的回归防线）', () => {
  const m = /mirror_dir "\$SRC\/assets" "\$DST\/assets"([^\n]*)/.exec(sh);
  assert.ok(m, 'assets 镜像行形态改变时请同步本哨兵');
  assert.ok(m[1].includes('.pnpm'), 'assets 镜像仍须 //XD .pnpm');
  assert.ok(/find "\$DST\/assets" -type d -name \.pnpm/.test(sh),
    '/XD 挡住的目录连 /MIR 删除也一并挡了，.pnpm 残留仍需显式清理');
});
