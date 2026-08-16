'use strict';

// 交付前识图链路验证（打包 / 发布前手动运行，也可接入 CI）。
//
// 背景：客户端每次更新后「图像识别能力设置出错 / 识图失败」的已知根因：
//   1. dsh-vision 存储配置（~/.dsh/settings.yaml）选了旧模型（glm-4v-flash 等
//      max_tokens 上限 1024），而插件默认 maxTokens=2048 → 每次调用 400
//      （code 1210）。插件代码已做旧模型钳制 + 降档重试，本脚本验证其存在。
//   2. profile 的 cordis.patch.yml 出现重复 id / bundle 插件残留 patch 行 →
//      cordis loader「duplicate loader entry id」→ 插件树整体加载失败。
//      （该自愈已由 PR #24 覆盖，本脚本只做状态检查，不做修改。）
//   3. 内置插件文件缺失或语法错误（打包事故）。
//
// 用法: node scripts/verify-vision-upgrade.js [dshHome] [appRoot]
//   默认 dshHome = ~/.dsh，appRoot = 脚本所在目录的上一级。

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const dshHome = process.argv[2] || path.join(os.homedir(), '.dsh');
const appRoot = process.argv[3] || path.resolve(__dirname, '..');

let failed = 0;
const fail = (msg) => { failed++; console.error('[verify-vision] FAIL ' + msg); };
const ok = (msg) => console.log('[verify-vision] ok   ' + msg);

// --- 1) 内置插件文件完整性 + 语法 ----------------------------------------------

const pluginDir = path.join(appRoot, 'assets', 'plugins', 'dsh-vision');
const pluginFiles = ['package.json', 'dsh.plugin.json', 'lib/index.js', 'lib/client.js', 'lib/vlm.js'];
for (const f of pluginFiles) {
  if (!fs.existsSync(path.join(pluginDir, f))) fail('内置 dsh-vision 缺少文件: ' + f);
  else ok('dsh-vision ' + f + ' 存在');
}

// 代码级自愈必须存在：旧模型钳制 + 400 降档重试
const indexSrc = fs.readFileSync(path.join(pluginDir, 'lib', 'index.js'), 'utf8');
if (!/LEGACY_1K_CAP_MODELS/.test(indexSrc)) fail('dsh-vision lib/index.js 缺少旧模型 maxTokens 钳制（LEGACY_1K_CAP_MODELS）');
else ok('dsh-vision 旧模型 maxTokens 钳制已内置');
if (!/MAX_TOKENS_REJECTED/.test(indexSrc)) fail('dsh-vision lib/index.js 缺少 400 降档重试（MAX_TOKENS_REJECTED）');
else ok('dsh-vision 400 降档重试已内置');

const clientSrc = fs.readFileSync(path.join(pluginDir, 'lib', 'client.js'), 'utf8');
if (!/DEFAULTS\[key\] !== undefined/.test(clientSrc)) fail('dsh-vision lib/client.js 缺少「保存跳过默认值」逻辑');
else ok('dsh-vision 设置页不再写死默认值');

for (const f of ['lib/index.js', 'lib/client.js', 'lib/vlm.js']) {
  const r = spawnSync(process.execPath, ['--check', path.join(pluginDir, f)], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) fail('dsh-vision ' + f + ' 语法错误: ' + (r.stderr || '').trim());
  else ok('dsh-vision ' + f + ' 语法通过');
}

// --- 2) 当前 profile 装配状态（用户数据，升级后应保持健康；自愈由 PR #24 负责）---

const profileDir = path.join(dshHome, 'profiles', 'web');
const patchFile = path.join(profileDir, 'cordis.patch.yml');
if (fs.existsSync(patchFile)) {
  const patch = fs.readFileSync(patchFile, 'utf8');
  const ids = [...patch.matchAll(/^\s*-\s*id:\s*([^\s]+)/gm)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length > 0) fail('cordis.patch.yml 存在重复 id: ' + [...new Set(dup)].join(', ') + '（下次启动 PR #24 自愈会清掉）');
  else ok('cordis.patch.yml 无重复 id（' + ids.length + ' 个条目）');
  // 悬空 `- insert:` 头检测
  const lines = patch.split('\n');
  let dangling = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*-\s+insert:/.test(lines[i])) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      if (!next || !/^\s*-\s*id:/.test(next)) { dangling = true; break; }
    }
  }
  if (dangling) fail('cordis.patch.yml 存在悬空 - insert: 头');
  else ok('cordis.patch.yml 无悬空 insert 头');
  // bundle 插件不得同时出现在 patch 里（双登记 → duplicate loader entry id）
  const pj = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  const bundles = (pj.dsh && pj.dsh.profile && pj.dsh.profile.bundles) || [];
  const double = bundles.filter((b) => ids.includes(path.basename(b)));
  if (double.length > 0) fail('bundle 插件同时登记在 patch 层（双登记，PR #24 启动自愈会清）: ' + double.join(', '));
  else ok('bundle 与 patch 无双登记');
} else {
  ok('profile 尚无 cordis.patch.yml（全新安装，跳过装配检查）');
}

// --- 3) 存储配置与模型上限兼容性（提示级，不阻断）-------------------------------

const settingsFile = path.join(dshHome, 'settings.yaml');
if (fs.existsSync(settingsFile)) {
  const yaml = fs.readFileSync(settingsFile, 'utf8');
  const m = yaml.match(/^dsh-vision:\r?\n((?:[ \t].*\r?\n?)*)/m);
  if (m) {
    const section = m[1];
    const model = (section.match(/^\s*model:\s*(.+)$/m) || [])[1]?.trim();
    const maxTokens = (section.match(/^\s*maxTokens:\s*(\d+)/m) || [])[1];
    if (model && /^glm-4v-flash$/.test(model) && !maxTokens) {
      ok('settings.yaml: dsh-vision 选了 glm-4v-flash 且未写 maxTokens——插件会自动钳制到 1024，无需手调');
    } else if (model && /^glm-4v-flash$/.test(model) && maxTokens && Number(maxTokens) > 1024) {
      fail('settings.yaml: dsh-vision maxTokens=' + maxTokens + ' 超过 glm-4v-flash 上限 1024');
    } else {
      ok('settings.yaml dsh-vision 配置与模型上限兼容（model=' + (model || '?') + ' maxTokens=' + (maxTokens || '默认') + '）');
    }
  } else {
    ok('settings.yaml 无 dsh-vision 节（未配置识图，跳过）');
  }
} else {
  ok('settings.yaml 不存在（全新安装，跳过配置检查）');
}

console.log(failed === 0
  ? '[verify-vision] 全部通过：识图链路健康，可交付。'
  : '[verify-vision] ' + failed + ' 项未通过，交付前必须修复。');
process.exit(failed === 0 ? 0 : 1);
