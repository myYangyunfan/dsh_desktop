'use strict';

// v1.0.0 纯净线：内置插件不进安装包后的装配对账语义（node --test）。
//
// 交付形态改为「官方形状」：`assets/plugins` 留在仓库但不进 payload（切断点在
// dsh-tauri/scripts/stage-payload.sh 与 tauri-release.yml 的 staging，静态口径由
// dsh-tauri/scripts/ta12-stage-payload-sentinel.test.mjs 守着）。本文件守的是
// **行为面**那半条：payload 里没有插件源时，老用户升级必须被自愈成干净 profile，
// 而不是留下指向缺失目录的注册行。
//
// 预设那一支不在此列：v1.0.0 已把随包预设整体拆除（源目录、写入器、boot 的
// presets 步都没了），客户端不再写任何预设，也就没有对应的行为面。
//
// 为什么这条必须常驻：一次致命启动会把 profile 的 cordis.patch.yml 改名成
// .bak-<时间戳> 并把 bundle 列表恢复出厂（sanitizeProfile）——所以「撤回」做错了
// 的失效形态不是报错，而是用户整包插件被抹掉 / 启动进恢复页。
//
// 隔离：全部在 %TEMP% 临时目录里跑，DSH_HOME 重定向，绝不触碰真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { COMPANION_PLUGINS, RETIRED_COMPANIONS, companionDirName } = require('../lib/companion-plugins');
const {
  syncCompanionFiles,
  registerCompanionPatchEntries,
  removeRetiredCompanionPatchRows,
} = require('../lib/companion-profile');

const VENDOR_ROOT = path.resolve(__dirname, '..', '..', 'node_modules');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pure-line-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 造一份「历史上已装过配套件」的 profile（bundle 登记 + 两条 insert 行）。
 *
 *  两行刻意分走两条不同的撤账路径，这正是 2026-10 批量退役后的真实升级现场：
 *    · balance（@deepseek-ai/dsh-balance）——仍在 COMPANION_PLUGINS 里，源缺失时
 *      经 missingNames 走通用撤账（registerCompanionPatchEntries）；
 *    · terminal（@deepseek-ai/dsh-terminal-tab）——已摘出清单、进 RETIRED_COMPANIONS，
 *      因此**不再产生 missingNames**，只能由 removeRetiredCompanionPatchRows 按名字认领。
 *  少接后者，老 profile 会每 boot 刷一次 `Cannot find package` ——本文件因此把两步
 *  链一起钉住，而不是只测第一步。 */
function legacyProfile(dir) {
  const profileDir = path.join(dir, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, 'package.json'),
    JSON.stringify({
      name: 'dsh-profile-web',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-balance'] } },
      dependencies: { '@deepseek-ai/dsh-base': 'catalog:', '@deepseek-ai/dsh-balance': '^1.0.0' },
    }, null, 2),
  );
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  fs.writeFileSync(
    patchFile,
    '# dsh web profile patch（由 DSH Desktop 维护）\n'
      + "- insert:\n    - id: balance\n      name: '@deepseek-ai/dsh-balance'\n"
      + "- insert:\n    - id: terminal\n      name: '@deepseek-ai/dsh-terminal-tab'\n",
  );
  return { profileDir, patchFile };
}

test('纯净线前提：配套件清单保持完整（它是撤回依据，不是分发清单）', () => {
  // 清空 COMPANION_PLUGINS 会让 missingNames 无从产生 → 历史登记永久留在 profile。
  // 下限 20（2026-10 批量退役 11 条后实测 28；此前为 39/下限 35）：允许逐条**有意**
  // 退役，但要抓住「一次性把清单裁光 = 放弃撤回」这种形态。精确条数与「在册 ⇔ 有源 /
  // 退役 ⇔ 在 RETIRED 且无源」的收口对账由 unit-hub-registry、unit-composition-integrity
  // 与 unit-companion-bulk-retire 负责，这里只是本文件判据自身的覆盖哨兵。
  assert.ok(COMPANION_PLUGINS.length >= 20, '配套件清单不得清空/裁撤：它是源缺失时的撤回依据');
  for (const p of COMPANION_PLUGINS) assert.ok(p.id && p.name, '条目须含 id 与 name');
  // 夹具防腐：本文件历史 profile 的两行分别代表两条撤账路径，若哪天 terminal 被移出
  // RETIRED_COMPANIONS（或 balance 被退役），这条测试的立论就变了，必须显式改夹具。
  const retiredIds = RETIRED_COMPANIONS.map((p) => p.id);
  assert.ok(retiredIds.includes('terminal'), '夹具依赖 terminal 已退役（走按名字认领的撤账路径）');
  assert.ok(COMPANION_PLUGINS.some((p) => p.id === 'balance'), '夹具依赖 balance 仍在册（走 missingNames 撤账路径）');
});

test('纯净线：payload 无 assets/plugins 时同步不抛错，并把全部配套件计入源缺失', (t) => {
  const dir = tmp(t);
  const { profileDir } = legacyProfile(dir);
  const pureAssets = path.join(dir, 'pure-payload', 'assets', 'plugins'); // 整个不存在
  assert.ok(!fs.existsSync(pureAssets));

  const r = syncCompanionFiles({
    assetsRoot: pureAssets,
    profileDir,
    vendorRoot: VENDOR_ROOT,
    log: () => {},
  });
  assert.equal(r.bundleNames.size, 0, '纯净线不得登记任何 bundle');
  assert.deepEqual([...r.missingNames].sort(), COMPANION_PLUGINS.map((p) => p.name).sort(),
    '全部配套件必须按「源缺失」上报——撤回路径的唯一依据');
});

test('纯净线：源缺失后按启动链两步撤账，历史 insert 行撤成空补丁层（官方形状 []）', (t) => {
  const dir = tmp(t);
  const { profileDir, patchFile } = legacyProfile(dir);
  const r = syncCompanionFiles({
    assetsRoot: path.join(dir, 'nope', 'assets', 'plugins'),
    profileDir,
    vendorRoot: VENDOR_ROOT,
    log: () => {},
  });
  let patch = fs.readFileSync(patchFile, 'utf8');

  // 步序与 scripts/integration/plugin-sync.js 一致：先按名字认领退役件（410 行），
  // 再做在册件的登记/撤账（469 行）。
  const bulk = removeRetiredCompanionPatchRows(patch);
  assert.equal(bulk.changed, true, '退役件 terminal 的登记行必须由按名字认领的那步撤掉');
  assert.ok(bulk.removed.includes('terminal'), 'removed 应点名 terminal：\n' + bulk.patch);
  assert.ok(!bulk.patch.includes('id: terminal'), '撤账后仍残留 terminal 行：\n' + bulk.patch);
  assert.ok(bulk.patch.includes('id: balance'), '在册件不得被退役认领步误伤');
  patch = bulk.patch;

  const reg = registerCompanionPatchEntries(patch, {
    plugins: COMPANION_PLUGINS,
    bundleNames: r.bundleNames,
    missingNames: r.missingNames,
  });
  assert.equal(reg.changed, true, '有历史登记时撤回必须落盘');
  patch = reg.patch;
  fs.writeFileSync(patchFile, patch);
  for (const id of ['balance', 'terminal']) {
    assert.ok(!new RegExp(`id:\\s*${id}\\b`).test(patch), `撤回后仍残留 ${id} 行：\n${patch}`);
  }
  assert.equal(patch.replace(/^\s*#.*$/gm, '').trim(), '[]',
    '撤回终态应是空补丁层（内核出厂形态；原有注释头保留不算内容）');
  // 幂等：两步链再跑一遍不得再改（否则每次启动重写 profile）。
  const againBulk = removeRetiredCompanionPatchRows(patch);
  assert.equal(againBulk.changed, false, '退役认领步必须幂等');
  const again = registerCompanionPatchEntries(againBulk.patch, {
    plugins: COMPANION_PLUGINS,
    bundleNames: r.bundleNames,
    missingNames: r.missingNames,
  });
  assert.equal(again.changed, false, '登记撤账步必须幂等（否则每次启动重写 profile）');
});

test('反证：装上 1 个源后 missing 恰好少 1——判据真在读磁盘，不是恒「全量缺失」', (t) => {
  const dir = tmp(t);
  const { profileDir } = legacyProfile(dir);
  // 只放 balance 一个源（不含 dsh.bundle 声明，故只看源缺失判定这一维）：
  // missing 必须是「其余全部」而不是「全部」——证明判据真的在读磁盘。
  const assets = path.join(dir, 'assets', 'plugins');
  const one = path.join(assets, companionDirName({ name: '@deepseek-ai/dsh-balance' }));
  fs.mkdirSync(one, { recursive: true });
  fs.writeFileSync(path.join(one, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-balance', version: '1.0.0' }));

  const r = syncCompanionFiles({ assetsRoot: assets, profileDir, vendorRoot: VENDOR_ROOT, log: () => {} });
  assert.equal(r.missingNames.has('@deepseek-ai/dsh-balance'), false, '有源的包不得计入源缺失');
  assert.equal(r.missingNames.size, COMPANION_PLUGINS.length - 1, '其余配套件应仍计入源缺失');
});
