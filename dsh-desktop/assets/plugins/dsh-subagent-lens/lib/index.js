/**
 * dsh-subagent-lens（宿主半边）：只做一件事 —— 在宿主 settings 文档里注册
 * `dsh-subagent-lens` 命名空间，让客户端半边能经 settingsScope.bind 读到
 * 热配置（总开关 / 会话头聚合条 / 委派工具名清单 / 截断上限）。全部 UI 与
 * 数据提取都在客户端半边（lib/client.js），本半边零工具、零事件订阅、零
 * 后端行为，注册失败仅告警不阻断启动（照抄 dsh-vision 的容错策略）。
 *
 * 数据面说明（重要，见客户端半边头注释）：内核把子代理实现为独立会话
 * （origin === "subagent"，parentId 指向父会话），父会话的 tool/result 只
 * 携带子代理的最终输出；子代理的中间命令/文件只存在于子会话的事件流里，
 * 客户端打开子会话（谱系目录）后即已在本地。本插件不新增任何宿主数据通道。
 * @module dsh-subagent-lens
 */
import z from '@deepseek-ai/schemastery';

// <<BEGIN settings-host（由 tools/codemod/apply-settings-scope.mjs 生成，勿单包手改）>>
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

/** 把 config 里的 volatile 引用摊平成普通值（同 dsh-settings 的 plainConfig）。 */
function plainSettings(value) {
	if (typeof value !== "object" || value === null) return value;
	if (VOLATILE_WRITE in value) return plainSettings(typeof value.get === "function" ? value.get() : undefined);
	if (Array.isArray(value)) return value.map(plainSettings);
	return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plainSettings(child)]));
}

/**
 * 用声明式 Config 顶掉不存在的 ctx.settings.register。
 * @param ctx - 本插件作用域
 * @param entryConfig - apply 第二参（resolveConfig 校验过的 profile 行 config）
 * @param entryId - **profile 条目 id**，即 settings/document-updated 回传的 ns
 * @returns 与旧 scope 同名的 { get(), watch(fn) }，调用方不必改形状
 */
function mountSettingsScope(ctx, entryConfig, entryId) {
	const state = { current: plainSettings(entryConfig) || {} };
	const listeners = /* @__PURE__ */ new Set();
	ctx.on("settings/document-updated", (ns) => {
		if (ns !== entryId) return;
		state.current = plainSettings(entryConfig) || {};
		for (const fn of [...listeners]) fn(state.current);
	});
	return {
		get: () => state.current,
		watch(fn) {
			listeners.add(fn);
			return () => { listeners.delete(fn); };
		}
	};
}
// <<END settings-host>>


export const name = 'dsh-subagent-lens';
export const inject = ['settings'];

/** 默认按这些工具名注册 toolview 行（内核 preset 实际使用 subagent / subagent_fork）。 */
export const DEFAULT_TOOL_NAMES = ['subagent', 'subagent_fork', 'Task', 'task'];

export const Config = z.object({
    enabled: z.boolean().default(true)
        .description('Master switch — false hides the lens detail sections (delegation activity lists and the session-header activity strip); the delegation call row itself keeps showing prompt/result'),
    headerStrip: z.boolean().default(true)
        .description('Show the session-header activity strip (one collapsed line aggregating this session\'s commands and touched files)'),
    toolNames: z.array(z.string()).default(DEFAULT_TOOL_NAMES)
        .description('Delegation tool names that get the lens row (kernel default: subagent / subagent_fork); changes take effect after a client reload'),
    maxItems: z.number().step(1).min(5).max(500).default(50)
        .description('Max commands/files listed in one expanded lens (older entries beyond the cap are counted, not listed)'),
    commandChars: z.number().step(1).min(40).max(4000).default(400)
        .description('Max characters kept per command line (longer commands are truncated with an ellipsis)'),
});

const NS = 'dsh-subagent-lens';

export function apply(ctx, config) {
    try {
        mountSettingsScope(ctx, config, "dsh-subagent-lens");
    } catch (error) {
        // 存储的配置节非法（或 settings 面不可用）时降级为组合配置，不阻断启动。
        console.warn('[dsh-subagent-lens] settings section unavailable (invalid stored config); lens falls back to defaults: ' + ((error && error.message) || error));
    }
}
