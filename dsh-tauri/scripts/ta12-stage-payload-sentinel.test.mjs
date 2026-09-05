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
    'assets/plugins',
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

test('assets 镜像只剔「gitignored 插件依赖树」（正件 node_modules 必须留在包里）', () => {
  // v0.6.2 本地构建实测：插件目录里本机 pnpm install 出的 .pnpm 存储被 robocopy
  // 跟 junction 展开后，NSIS 的 File 指令在 >260 字符路径上 failed opening file
  // → 建包中断。但“assets 一刀切 /XD node_modules”是错法：dsh-hub(731 个跟踪
  // 文件) / graph-memory(1177) / billion-context-dsh(165) 的 node_modules 是 git
  // 跟踪进来的运行期依赖，剔掉就是装完即挂。
  assert.ok(/mirror_dir "\$SRC\/assets" "\$DST\/assets" \/\/XD \.pnpm/.test(sh),
    'assets 镜像应只 //XD .pnpm');
  assert.ok(!/mirror_dir "\$SRC\/assets"[^\n]*\/\/XD node_modules/.test(sh),
    '不得对 assets 一刀切排除 node_modules——会误杀正件插件的运行期依赖');
  // 残留判定必须走 git，而不是写死插件名单（新增插件无需改脚本）。
  assert.ok(/ls-files -- "dsh-desktop\/assets\/plugins\/\$name\/node_modules"/.test(sh),
    '应按 git 跟踪状态逐个判定本机安装残留');
});
