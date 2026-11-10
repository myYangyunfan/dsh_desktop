'use strict';

/**
 * 安全模式（safe mode）：插件装配把客户端或内核搞挂之后的「保底进入」通道。
 *
 * 背景（1.0.9 用户反馈「插件加载失败后直接进不了客户端，没有官方版的保底进入
 * 机制」）：壳侧原本只有两条路进恢复页——内核装配失败（`lib.rs` 的
 * `start_supervisor` 报错）与内核崩溃环（`SupervisorEvent::CrashLoop`）。而
 * 「内核健康、WebView 正常、客户端插件装配失败」这一类完全落在两条之外：
 * `dsh-client-web` 的 `BootController.run` 只会把失败条目画成 boot 卡片上的
 * `Failed to load plugins` 面板，不抛错、不进 `desktop.log`，重载还是同一结果，
 * 用户除了手删 profile 无路可走。
 *
 * 本模块只负责「把伴随插件全部在补丁层写成 disabled」这件纯计算 + 标记文件
 * 读写，接线在各调用方（boot 同步与壳侧命令）。语义是**一次性熔断**：
 * 写盘后立刻删标记，之后由用户在「设置 → 插件 → 内置插件」里逐个开回来
 * （管理页写 `disabled: false`，本模块不会覆盖用户的选择）。
 *
 * 两条不可省的保留项（都是「禁了就换个姿势卡死」）：
 *   1. `dsh-builtin-manager` —— 内置插件管理页本身。全禁之后用户进去了也没有
 *      任何界面能把插件开回来，等于把死锁从 boot 阶段搬到设置页。
 *   2. `bili-compaction-gate` —— `billion-context` 的常驻 gate 条目，承载
 *      `dsh-web-app` 四个出厂预设 `inject: [biliBasicCompactionPolicy]` 等待的
 *      服务。禁掉它 = 会话创建永久 pending（AGENTS.md「压缩后端在 0.2.x 是预设
 *      私有」那条踩过），比插件加载失败更糟。它不渲染 UI，留着无副作用。
 */

const fs = require('node:fs');
const path = require('node:path');

const { togglePluginInPatch } = require('../plugin-core/lib/patch-surgery');

/** 标记文件名（落在 DSH_HOME 根，与 `profiles/` 同级）。 */
const SAFE_MODE_FLAG = 'safe-mode.flag';

/** 环境变量开关（与标记文件取或；给命令行/自动化用）。 */
const SAFE_MODE_ENV = 'DSH_SAFE_MODE';

/** 安全模式也必须保留的 loader id（见文件头两条理由）。 */
const SAFE_MODE_KEEP_IDS = Object.freeze(['dsh-builtin-manager', 'bili-compaction-gate']);

/**
 * 标记文件绝对路径。
 * @param {string} home DSH_HOME。
 * @returns {string}
 */
function safeModeFlagPath(home) {
  return path.join(home, SAFE_MODE_FLAG);
}

/**
 * 本次启动是否要求安全模式。
 * @param {string} home DSH_HOME。
 * @param {Record<string, string|undefined>} [env] 环境变量表（测试注入）。
 * @returns {{ enabled: boolean, viaFlag: boolean, viaEnv: boolean }}
 */
function safeModeRequested(home, env) {
  const table = env || process.env;
  let viaFlag = false;
  try {
    viaFlag = fs.existsSync(safeModeFlagPath(home));
  } catch {
    viaFlag = false;
  }
  const raw = typeof table[SAFE_MODE_ENV] === 'string' ? table[SAFE_MODE_ENV].trim() : '';
  const viaEnv = raw === '1' || /^true$/i.test(raw);
  return { enabled: viaFlag || viaEnv, viaFlag, viaEnv };
}

/**
 * 把清单里的伴随插件在补丁层全部写成 `disabled: true`（保留项除外）。
 *
 * 纯函数：只读入参文本、返回新文本与被禁名单，不碰磁盘。幂等——已经是
 * `disabled: true` 的条目不会被重复改写（`togglePluginInPatch` 自带幂等，
 * 返回值与原文本相同即视为未变）。
 *
 * @param {string} patch `cordis.patch.yml` 原文。
 * @param {Array<{id: string, name?: string}>} plugins 伴随插件清单（COMPANION_PLUGINS）。
 * @param {Iterable<string>} [keep] 保留的 loader id。
 * @returns {{ patch: string, disabled: string[], unchanged: string[], kept: string[] }}
 */
function disableCompanionsForSafeMode(patch, plugins, keep) {
  const keepSet = new Set(keep === undefined ? SAFE_MODE_KEEP_IDS : keep);
  const list = Array.isArray(plugins) ? plugins : [];
  let out = typeof patch === 'string' ? patch : '';
  const disabled = [];
  const unchanged = [];
  const kept = [];
  for (const plugin of list) {
    const id = plugin && typeof plugin.id === 'string' ? plugin.id : '';
    if (!id) continue;
    if (keepSet.has(id)) {
      kept.push(id);
      continue;
    }
    const name = typeof plugin.name === 'string' && plugin.name ? plugin.name : id;
    let next;
    try {
      next = togglePluginInPatch(out, id, false, name);
    } catch {
      // 单个 id 非法（历史脏清单）不该炸掉整条保底通道：跳过并留给调用方日志。
      continue;
    }
    if (next === out) unchanged.push(id);
    else {
      out = next;
      disabled.push(id);
    }
  }
  return { patch: out, disabled, unchanged, kept };
}

/**
 * 删除标记文件（一次性熔断：生效即消费掉，避免每次启动反复覆盖用户的选择）。
 * @param {string} home DSH_HOME。
 * @returns {boolean} 是否真的删掉了。
 */
function clearSafeModeFlag(home) {
  try {
    fs.unlinkSync(safeModeFlagPath(home));
    return true;
  } catch {
    return false;
  }
}

/**
 * 写入标记文件（壳侧「以安全模式重启」命令用）。
 * @param {string} home DSH_HOME。
 */
function writeSafeModeFlag(home) {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(safeModeFlagPath(home), new Date().toISOString() + '\n', 'utf8');
}

module.exports = {
  SAFE_MODE_FLAG,
  SAFE_MODE_ENV,
  SAFE_MODE_KEEP_IDS,
  safeModeFlagPath,
  safeModeRequested,
  disableCompanionsForSafeMode,
  clearSafeModeFlag,
  writeSafeModeFlag,
};
