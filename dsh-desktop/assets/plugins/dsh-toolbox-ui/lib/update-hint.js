// 更新提示 + 包身份：只读 package.json、最多每 24h 发一次 GET，与 wire 面无关。
//
// 从 lib/index.js 整块搬出来的（R6 第 2 步）。搬移不改一个字符：缩进、注释、常量名、
// 判据全部原样，所以行为差异只可能来自 import 接错。三件互相咬合的事实住在这里：
//   · 「本包是谁」（pluginName / pluginVersion）——其它文件只读它，不许各写一份；
//   · 「这一行是不是一个 MCP 管理插件」（isMcpManagerPluginName，让位检测用）；
//   · 「有没有新版」（checkForUpdate，进程内 24h 缓存）。
import { readFileSync } from "node:fs";
// ---------- 更新提示（被动、可关闭、绝不自动更新） ----------
// 面板打开时客户端会调一次 updateHint：Host 每天最多向 npm registry 发一次查询（进程内缓存），
// 有新版时返回供面板显示可关闭的提示条。查询失败、超时、限流或被
// DSH_MCP_MANAGER_DISABLE_UPDATE_CHECK 禁用时静默无提示——这是有意设计：更新提示是纯增值信息，
// 不允许影响面板可用性；除这一条 GET 外不发送任何数据。
//
// ⚠️ 问的是**本包在 npm 上的 latest**，不是本仓库的 `/releases/latest`：同一个仓库承载两条产品线
// （本线 `dsh-toolbox-ui` 与老线那个包——两个名字见 release.yml），而仓库级 "latest" 是**共用**的单个
// 槽位，且必须留给老线——老线（≤1.5.3）面板的「升级」按钮读的正是那里，下发的却是**它自己那个包名**的
// 版本，所以本线的 Release 一直带 `--prerelease`（见 release.yml 的说明），让 latest 停在老线的
// 版本上。本线若也读那个 feed，读到的永远是旧线的版本号 → 提示恒为「已是最新」：新版本发出去，
// 装了本线的用户什么也看不到（v1.6.1 → v1.6.2 就这样哑掉过一次）。
// 包名由 package.json 派生（pluginName）：写死任何一个包名都会在另一条线上静默错。
/**
 * 让位检测（`conflictingManager`）的自身判据：**loader 条目的 `name` 等于本包名**。
 *
 * ⚠️ **不得用 patch 的 `id` 排自身。** 新旧两个包共用同一个 `id: mcp-manager-ui`
 * （双包同仓、同 id 是刻意的，`package-contract` 断言它在 patch 里唯一）。按 id 排除自身
 * 会把**旧包一起排掉** → 让位检测永不触发 → 旧包真装在场上却什么也不做。真机 desktop
 * profile 正是这种形态：`dsh.profile.bundles` 里挂着旧包 `dsh-mcp-manager-ui@^1.5.0`。
 *
 * 包名是可靠的自身判据：本插件的 loader `name` 恒等于 `package.json.name`
 * （`cordis.patch.yml` 的 `name:` 由 `test/package-rename.test.mjs` 钉住）；而旧包的
 * 旧包的 `name` 恒为 `dsh-mcp-manager-ui`——含 mcp + manager 两段，于是被正确识别为"另一个"。 */

/**
 * 该 loader 条目名是否像一个「MCP 管理插件」。
 *
 * 判据刻意保守（必须同时含 mcp 与 manager 两段），因为误判的代价是**面板完全打不开**：
 * 宁可漏检（最坏两个入口并存），也不要把无关插件当成冲突。
 *
 * ⚠️ 这里**不**判「是不是自己」——自身排除只有一个判据，就是调用方拿 `name` 与本包名比对
 * （见 `conflictingManager`），而且它在调用本函数**之前**执行。
 * 曾经这里硬写过一次包名，结果是两处都在排自身：删掉另一处用例照样绿（自我排除由这里
 * 悄悄完成），而改名（row 16）之后包名一变、硬写的这处就**静默失效**——失效的恰好是
 * 防「面板打不开」的那道闸。同一件事只能有一处判据。
 */
function isMcpManagerPluginName(name) {
	const lower = String(name).toLowerCase();
	return lower.includes("mcp") && lower.includes("manager");
}

/**
 * 宿主自带的 MCP 管理器：`@deepseek-ai/dsh-mcp-manager`（0.2.2-rc.2 起随 web-app bundle 打包，不可卸载）。
 *
 * 它**不算“对手面板”**：没有 `dsh.client`（没有任何客户端入口），只暴露 `watch/restart/probe`
 * 三个只读 + 重启的 Remote 方法，不写配置。向它让位等于永久失去本插件唯一的面板入口，
 * 而且用户也卸不掉它——那是死路。所以只对**第三方**的 MCP 管理面板让位（名字里带 mcp/manager
 * 且不在宿主的 `@deepseek-ai/` scope 下）。
 *
 * @param {string} name loader 条目名
 * @returns {boolean} 是否宿主自带的那一个
 */
function isHostBundledMcpManager(name) {
	return String(name).toLowerCase().startsWith("@deepseek-ai/");
}

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 5000;
const UPDATE_CHECK_DISABLED_ENV = "DSH_MCP_MANAGER_DISABLE_UPDATE_CHECK";
let updateCheckState = { checkedAt: 0, result: null };

/** 本包在 npm 上的 latest 端点；包名读不到就没有端点（当作无提示，不猜一个包名）。 */
function updateLatestUrl() {
  const name = pluginName();
  return name === "" ? null : `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
}

/** 说明页：两条线的 tag 都是 vX.Y.Z，故由版本号拼本仓库的 release 页（与老线的 updateHint 一致）。 */
const releasePageOf = (version) => `https://github.com/Imzl-zl/dsh-toolbox-ui/releases/tag/v${version}`;

function pluginVersion() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/**
 * 本包名——自身判据的唯一来源（见 `conflictingManager` 上方的注释）。
 * 与 pluginVersion 同一份读法：同一个文件、同一个失败姿态（读不到就返回空串）。
 */
function pluginName() {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name ?? "";
  } catch {
    return "";
  }
}

function compareVersions(left, right) {
  const a = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function checkForUpdate(now = Date.now(), force = false) {
  const current = pluginVersion();
  if (process.env[UPDATE_CHECK_DISABLED_ENV]) return { current, updateAvailable: false, disabled: true };
  const cached = updateCheckState.result;
  if (!force && cached && now - updateCheckState.checkedAt < UPDATE_CHECK_INTERVAL_MS && cached.current === current) return cached;
  let latest = null;
  let url = null;
  const endpoint = updateLatestUrl();
  try {
    if (endpoint !== null) {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
      });
      if (response.ok) {
        const body = await response.json();
        // npm 的 `/<包名>/latest` 只给版本号，没有页面链接——提示条要指得出「更新了什么」，
        // 所以由版本号拼 release 页（两线共用 vX.Y.Z 的 tag 命名）。
        if (typeof body?.version === "string" && body.version !== "") {
          latest = body.version;
          url = releasePageOf(latest);
        }
      }
    }
  } catch {
    // 离线/超时/限流：视作无新版，提示缺失比面板报错更可接受。
  }
  const result = { current, latest, url, updateAvailable: !!latest && compareVersions(latest, current) > 0 };
  updateCheckState = { checkedAt: now, result };
  return result;
}

export { checkForUpdate, isHostBundledMcpManager, isMcpManagerPluginName, pluginName, pluginVersion };
