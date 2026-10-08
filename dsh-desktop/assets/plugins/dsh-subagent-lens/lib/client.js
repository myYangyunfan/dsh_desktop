// @dsh-external/dsh-subagent-lens 客户端半边：子代理活动快视。
//
// 解决的用户痛点：跑 subagent（Task 类工具）时，子代理执行的 shell 命令与
// 读写的源码文件被折叠/黑盒，无法快速查看。
//
// 数据面（逆向 dsh 0.1.x 客户端运行时的结论，如实声明）：
//   · 内核把子代理实现为独立会话（origin === "subagent"、parentId 指向父
//     会话，见 dsh-client-ui-subagent 的谱系目录）。父会话的 Task/subagent
//     工具调用事件里只有 description/prompt，tool/result 只有子代理的最终
//     输出 —— 中间命令/文件明细只存在于子会话自己的事件流。
//   · 客户端打开子会话（会话头部谱系目录点击）后，子会话事件已在本地的
//     binding 事件窗口里（sessions 服务的 binding(childId).eventSource，
//     见 childWindowEvents 的说明；旧内核才是 session.events 数组）。
//   · 因此本插件的全部数据来源 = 客户端已有的会话事件流快照（当前会话经
//     useSession 的 chat 快照；子会话经 sessions 服务只读 binding），零额外
//     后端请求、零新数据通道。
//
// 两个呈现面：
//   1) tool.call.toolview 按 key（subagent / subagent_fork / Task / task，
//     settings 可改）注册委派调用行：折叠 = 「子代理 · description」+ 状态；
//     展开 = 委派提示词 + 结果摘要 + 子代理活动明细（命令清单 / 文件清单，
//     文件点击走内核 openFile，内核不给 openFile 时该行禁用）+「打开子
//     会话」按钮（sessions.openSubagent，与官方谱系目录同链路）。子会话尚
//     未在本地打开时降级为提示行。
//   2) conversation.session.header.utilities 注册会话头部活动聚合条：一行
//     「活动：N 命令 · M 文件」（子代理会话内即「子代理活动」），点击展开
//     完整清单。在子会话视图里这就是「子代理干了什么」的一览。
//
// 保守原则：所有钩子/渲染/数据读取 try/catch 包裹，失败静默降级（绝不影响
// 主 UI）；settings.describe 暴露开关（宿主半边 lib/index.js 注册命名空间）。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-subagent-lens",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");

    // bindSnapshotSelector 三级回落（照抄 dsh-vision，issue #124 的根因修复）：
    //   1) renderer.useSyncExternalStoreWithSelector（rc.8，仅当真实导出）
    //   2) web-react.bindSnapshotSelector（rc.7 官方包，Tauri 由 client-compat
    //      注入页面模块表）
    //   3) react 原生 useSyncExternalStore 兜底（整快照引用稳定）
    let bindSnapshotSelector;
    try {
      const rendererMod = require("@deepseek-ai/dsh-client-ui-renderer");
      if (typeof rendererMod.useSyncExternalStoreWithSelector === "function") {
        const useSESWS = rendererMod.useSyncExternalStoreWithSelector;
        bindSnapshotSelector = (source) => {
          const subscribe = (fn) => source.subscribe(fn);
          const getSnapshot = () => source.getSnapshot();
          return (selector, isEqual) => useSESWS(subscribe, getSnapshot, void 0, selector, isEqual);
        };
      }
    } catch { /* rc.7 及更早内核 → 下一级回落 */ }
    // 注：此处原有第二级 compat 回落（一个官方内核并不存在的 React 绑定包名），
    // 浏览器模块系统对未知裸标识符一律 throw，该 rung 永远进不去、异常也被下面
    // 的空 catch 吞掉，实际行为一直是「ui-renderer → react 原生」两级。已删除。
    if (!bindSnapshotSelector) {
      const { useSyncExternalStore } = require("react");
      bindSnapshotSelector = (source) => {
        const subscribe = (fn) => source.subscribe(fn);
        const getSnapshot = () => source.getSnapshot();
        return (selector) => selector(useSyncExternalStore(subscribe, getSnapshot));
      };
    }
    let primitives = {};
    try {
      primitives = require("@deepseek-ai/dsh-client-ui-primitives") || {};
    } catch { /* 理论上不可达（primitives 在 rc.8 静态种子表）；防御降级为纯 CSS 行 */ }

    // ---------------------------------------------------------------------------
    // 常量与文案
    // ---------------------------------------------------------------------------
    const NS = "dsh-subagent-lens";
    const SETTINGS_ENTRY_ID = "dsh-subagent-lens";

// settings.describe()/mutate 的 ns 是 **profile 条目 id**，不是包名也不是旧 NS。
// // <<BEGIN settings-scope（由 tools/codemod/apply-settings-scope.mjs 生成，勿单包手改）>>
function bindSettingsScope(ctx, entryId) {
	let snapshot = { status: "loading", value: undefined, writable: false, revision: undefined };
	const listeners = /* @__PURE__ */ new Set();
	const emit = () => { for (const fn of [...listeners]) fn(); };
	// 快照引用必须稳定：selector 走 Object.is 比较，每轮都换新对象会自激重渲染。
	const adopt = (next) => {
		if (next.status === snapshot.status && next.writable === snapshot.writable
			&& JSON.stringify(next.value) === JSON.stringify(snapshot.value)) return;
		snapshot = next;
		emit();
	};
	async function refresh() {
		let response;
		try {
			response = await ctx.remote.settings.describe();
		} catch (error) {
			adopt({ ...snapshot, status: "failed" });
			return;
		}
		if (!response || !response.ok) {
			adopt({ ...snapshot, status: "failed" });
			return;
		}
		const rows = response.value && Array.isArray(response.value.namespaces) ? response.value.namespaces : [];
		const view = rows.find((row) => row.ns === entryId);
		if (view === undefined) {
			// 条目不在 describe() 里 = 它的 Config 没有任何 volatile 字段，
			// 内核就不为它生成表单（volatileForm(schema) 为空即跳过）。
			adopt({ ...snapshot, status: "missing" });
			return;
		}
		adopt({
			status: "ready",
			value: view.value,
			writable: response.value.writable !== false,
			revision: view.revision
		});
	}
	void refresh();
	return {
		getSnapshot: () => snapshot,
		subscribe(fn) {
			listeners.add(fn);
			return () => { listeners.delete(fn); };
		},
		// 旧 API 的 watch(cb) 与 subscribe(cb) 同义，保留名字免得调用方各写一套。
		watch(fn) {
			return this.subscribe(fn);
		},
		async set(field, value) {
			const next = await ctx.remote.settings.mutate(entryId, [{ op: "set", path: [field], value }], snapshot.revision);
			if (next && next.ok && next.value) {
				adopt({ ...snapshot, value: next.value.value, revision: next.value.revision });
				return;
			}
			await refresh();
			if (!next || !next.ok) throw new Error(next && next.error && next.error.message || "settings write rejected");
		},
		refresh
	};
}
// <<END settings-scope>>
    const DEFAULT_TOOL_NAMES = ["subagent", "subagent_fork", "Task", "task"];
    const DEFAULT_MAX_ITEMS = 50;
    const DEFAULT_COMMAND_CHARS = 400;

    const L = {
      nav: "子代理活动快视",
      navSub: "为 Task / subagent 委派调用提供展开式活动视图：内联查看子代理执行过的命令与涉及的源码文件；会话头部另有当前会话的命令/文件聚合条。明细全部来自客户端已加载的会话事件流，不额外请求后端。",
      rowTitle: "子代理",
      stripTitle: "活动",
      stripSubagentTitle: "子代理活动",
      promptLabel: "委派提示词",
      resultLabel: "结果",
      activityLabel: "子代理活动",
      commandsLabel: "命令",
      filesLabel: "文件",
      openChild: "打开子会话",
      childNotLoaded: "子代理明细位于其子会话（可用上方「打开子会话」或会话头部的谱系目录查看）。",
      noActivity: "暂无命令 / 文件记录。",
      truncatedHint: "（已截断，原长 {n} 字符）",
      cappedHint: "仅显示前 {shown} 条，共 {total} 条。",
      windowHint: "数据来自当前会话事件流（已加载窗口内）。",
      fileRead: "读",
      fileWrite: "写",
      fileEdit: "改",
      errTag: "失败",
      settings: {
        enabledLabel: "启用子代理活动快视",
        enabledHint: "总开关，立即生效。关闭后隐藏委派行里的活动明细区与会话头聚合条；委派调用行本身仍显示提示词与结果。",
        enabledOn: "已开启：活动明细显示中",
        enabledOff: "已关闭：仅保留委派调用行的提示词/结果",
        stripLabel: "显示会话头聚合条",
        stripHint: "在会话头部显示一行「活动：N 命令 · M 文件」，点击展开完整清单；子代理会话内显示为「子代理活动」。",
        toolNamesLabel: "委派工具名",
        toolNamesHint: "逗号分隔；这些名字的工具调用使用快视行（内核默认 subagent / subagent_fork）。修改后需重载客户端生效。",
        maxItemsLabel: "清单最大条数",
        commandCharsLabel: "命令截断长度（字符）",
        save: "保存",
        saving: "保存中…",
        saved: "已保存",
        loading: "加载中…",
        unavailable: "设置不可用（需要在本机浏览器中打开）",
      },
    };

    // ---------------------------------------------------------------------------
    // 纯逻辑（导出供单测；全部脏数据容错：非字符串、缺参数、超长截断）
    // ---------------------------------------------------------------------------

    /** 工具名 → 活动类别："command" | "read" | "write" | "edit" | null。 */
    const COMMAND_TOOLS = new Set(["bash", "pwsh", "shell", "sh", "zsh", "powershell"]);
    const READ_TOOLS = new Set(["read", "read_file", "view"]);
    const WRITE_TOOLS = new Set(["write", "write_file", "create_file"]);
    const EDIT_TOOLS = new Set(["edit", "edit_file", "apply_patch"]);
    function classifyActivityTool(name) {
      const key = typeof name === "string" ? name.toLowerCase() : "";
      if (key === "") return null;
      if (COMMAND_TOOLS.has(key)) return "command";
      if (READ_TOOLS.has(key)) return "read";
      if (WRITE_TOOLS.has(key)) return "write";
      if (EDIT_TOOLS.has(key)) return "edit";
      return null;
    }

    /** 参数对象里挑文件路径（与内核 FILE_PATH_KEYS 对齐 + 驼峰别名）。 */
    function pickPath(args) {
      if (!args || typeof args !== "object") return undefined;
      for (const key of ["path", "file_path", "filePath"]) {
        const v = args[key];
        if (typeof v === "string" && v !== "") return v;
      }
      return undefined;
    }

    /** 安全解析 arguments（JSON 字符串或对象）；失败返回 null。 */
    function parseArgsSafe(raw) {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === "object" && !Array.isArray(raw)) return raw;
      if (typeof raw !== "string" || raw === "") return null;
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    /** 截断文本；超长时附加截断标记（保留原文长度）。 */
    function truncateText(text, maxChars) {
      const s = typeof text === "string" ? text : String(text ?? "");
      const cap = typeof maxChars === "number" && maxChars >= 10 ? Math.floor(maxChars) : DEFAULT_COMMAND_CHARS;
      if (s.length <= cap) return { text: s, originalLength: s.length, truncated: false };
      return { text: s.slice(0, cap), originalLength: s.length, truncated: true };
    }

    function firstLineOf(text, max) {
      const s = typeof text === "string" ? text : "";
      const nl = s.indexOf("\n");
      return truncateText(nl === -1 ? s : s.slice(0, nl), max || 120).text;
    }

    /** settings 里的 toolNames（数组或逗号分隔字符串）→ 去重去空数组。 */
    function splitToolNames(raw) {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
      const seen = new Set();
      const out = [];
      for (const item of list) {
        const name = typeof item === "string" ? item.trim() : "";
        if (name === "" || seen.has(name)) continue;
        seen.add(name);
        out.push(name);
      }
      return out;
    }

    /**
     * 从一条工具调用（名称 + arguments 原始值）提取活动条目。
     * @returns {{command?: {command,toolName,callId,seq,truncated,originalLength},
     *            file?: {path,op,toolName,callId,seq}}} 或 {}（无法提取）。
     */
    function activityEntryOf(toolName, argsRaw, callId, seq, opts) {
      const kind = classifyActivityTool(toolName);
      if (kind === null) return {};
      const args = parseArgsSafe(argsRaw) || {};
      if (kind === "command") {
        // 命令参数只认字符串 command（与内核 bash 行 SUMMARY_KEYS 对齐）；
        // 缺参数 / 非字符串一律跳过（脏数据容错）。
        if (typeof args.command !== "string" || args.command === "") return {};
        const cut = truncateText(args.command, opts.commandChars);
        return { command: { command: cut.text, toolName, callId: safeId(callId), seq: safeSeq(seq), truncated: cut.truncated, originalLength: cut.originalLength } };
      }
      const path = pickPath(args);
      if (path === undefined) return {};
      return { file: { path, op: kind, toolName, callId: safeId(callId), seq: safeSeq(seq) } };
    }

    function safeId(v) { return typeof v === "string" && v !== "" ? v : ""; }
    function safeSeq(v) { return typeof v === "number" && Number.isFinite(v) ? v : 0; }

    /**
     * 从原始会话事件数组（tool/call + tool/result）提取活动。
     * events: Array<{type:"tool/call",seq,data:{callId,name,arguments}} |
     *                {type:"tool/result",seq,data:{message:{source:{callId},content:[...]}}}>
     * 脏数据（非数组/非对象元素/arguments 不可解析）一律跳过，绝不抛出。
     * @returns {{commands:Array,fileSeeds:Array}}
     */
    function activityFromEvents(events, opts) {
      const o = opts || {};
      const extractOpts = { commandChars: o.commandChars };
      const out = { commands: [], fileSeeds: [] };
      if (!Array.isArray(events)) return out;
      const errors = new Map();
      for (const event of events) {
        if (!event || typeof event !== "object" || !event.data || typeof event.data !== "object") continue;
        if (event.type === "tool/call") {
          const entry = activityEntryOf(event.data.name, event.data.arguments, event.data.callId, event.seq, extractOpts);
          if (entry.command) out.commands.push(entry.command);
          if (entry.file) out.fileSeeds.push(entry.file);
        } else if (event.type === "tool/result") {
          const source = event.data.message && event.data.message.source;
          const block = event.data.message && Array.isArray(event.data.message.content)
            ? event.data.message.content[0] : undefined;
          if (source && typeof source.callId === "string" && block && block.isError === true) {
            errors.set(source.callId, true);
          }
        }
      }
      for (const item of out.commands) if (errors.get(item.callId)) item.error = true;
      for (const item of out.fileSeeds) if (errors.get(item.callId)) item.error = true;
      return out;
    }

    // ---------------------------------------------------------------------------
    // 子会话事件窗口读取（M2，2026-09 真机核对）
    //
    // 老写法读 `binding.session.events` 当数组 —— 页内**没有**这个数组：
    //   · dsh 0.1.7-rc.1 页内侧（dsh-api-session-controller）的 binding 形状是
    //     `{ sessionId, session, eventSource, ctx }`，事件在 `eventSource` 这个
    //     同步窗口 store 里：`getSnapshot().entries` = 已加载的日志窗口，
    //     条目是 wire record，事件本体在 `entry.event`（含 seq/type/data）。
    //   · `binding.session.events` 确实存在，但它是 SessionEventStream（异步日志流，
    //     有 prepend()/open()），`Array.isArray` 永远为假 —— 于是守卫把整块功能
    //     静默吞掉：不报错、不渲染、也查不出（与宿主侧 session.events 是同一类错）。
    // 三级回落：页内窗口 store → 旧 client-runtime 的数组 → session.snapshotEvents()。
    // 派生数组按 entries 快照身份缓存：同一次快照（无新事件）在渲染风暴里复用，
    // 不破坏下面 activityFromEventsCached 的增量扫（新事件到来时窗口整体换新）。
    const CHILD_WINDOW_CACHE = new WeakMap(); // entries 数组 -> 事件数组
    function childWindowEvents(binding) {
      if (!binding) return null;
      const source = binding.eventSource;
      if (source && typeof source.getSnapshot === "function") {
        const snapshot = source.getSnapshot();
        const entries = snapshot && snapshot.entries;
        if (Array.isArray(entries)) {
          const cached = CHILD_WINDOW_CACHE.get(entries);
          if (cached) return cached;
          const events = [];
          for (const record of entries) {
            const event = record && record.event;
            if (event && typeof event === "object") events.push(event);
          }
          CHILD_WINDOW_CACHE.set(entries, events);
          return events;
        }
      }
      const session = binding.session;
      if (!session) return null;
      // 老 client-runtime（0.1.6 一代）的 session.events 才是数组。刻意写成下标读取：
      // 旧 API 字面量有审计门禁（tools/audit/session-api.js），兼容口要留痕、不开口子。
      const legacy = session["events"];
      if (Array.isArray(legacy)) return legacy;
      if (typeof session.snapshotEvents === "function") {
        const events = session.snapshotEvents();
        return Array.isArray(events) ? events : null;
      }
      return null;
    }

    // ---------------------------------------------------------------------------
    // 增量扫描缓存（M1，2026-08「开多了子代理后不稳定」）：
    //
    // 内核 client-runtime 的 Session.events 数组常驻且**只追加**（appendLive
    // push；窗口重建时整体换新数组）。本插件对同一数组的重复全量重扫——
    // 展开行运行态 1.2s 轮询 tick、以及父会话每条流式事件触发的重渲染——
    // 是 O(N) 扫/次 = O(N²) 累计的 CPU + GC 放大器；多子代理并行流式时
    // 渲染进程长期满负荷 GC，加剧内存压力与不稳定。按「数组身份 + 已扫
    // 长度」增量续扫：新事件只扫新增段，旧条目对象引用复用（tool/result
    // 的错误标记迟到时回写旧条目对象，引用稳定安全）。数组换新（窗口
    // 重建）自然失效（WeakMap 按身份键控）。
    // ---------------------------------------------------------------------------
    const ACTIVITY_SCAN_CACHE = new WeakMap();
    function activityFromEventsCached(events, opts) {
      if (!Array.isArray(events)) return activityFromEvents(events, opts);
      const chars = opts && typeof opts.commandChars === "number" ? opts.commandChars : undefined;
      const prev = ACTIVITY_SCAN_CACHE.get(events);
      let scan;
      let start;
      if (prev && prev.chars === chars && prev.len <= events.length) {
        scan = prev;
        start = prev.len;
      } else {
        scan = { chars, len: 0, commands: [], fileSeeds: [], errors: new Map() };
        start = 0;
      }
      const extractOpts = { commandChars: chars };
      for (let i = start; i < events.length; i++) {
        const event = events[i];
        if (!event || typeof event !== "object" || !event.data || typeof event.data !== "object") continue;
        if (event.type === "tool/call") {
          const entry = activityEntryOf(event.data.name, event.data.arguments, event.data.callId, event.seq, extractOpts);
          if (entry.command) scan.commands.push(entry.command);
          if (entry.file) scan.fileSeeds.push(entry.file);
        } else if (event.type === "tool/result") {
          const source = event.data.message && event.data.message.source;
          const block = event.data.message && Array.isArray(event.data.message.content)
            ? event.data.message.content[0] : undefined;
          if (source && typeof source.callId === "string" && block && block.isError === true) {
            scan.errors.set(source.callId, true);
          }
        }
      }
      // 错误标记回写（幂等，代价远低于重扫——无 JSON.parse / 字符串切片）：
      // 覆盖「错误标记晚于命令条目到达」的迟到形态（对旧条目同样生效）。
      for (const item of scan.commands) if (scan.errors.get(item.callId)) item.error = true;
      for (const item of scan.fileSeeds) if (scan.errors.get(item.callId)) item.error = true;
      scan.len = events.length;
      ACTIVITY_SCAN_CACHE.set(events, scan);
      return { commands: scan.commands, fileSeeds: scan.fileSeeds };
    }

    /**
     * 从工具调用块（chat 快照的 tool-call root 或其 subCalls，两种生命周期形态）
     * 提取活动。running 块：{callId,name,argsRaw,subCalls}；完成块：
     * {kind:"tool-result",callId,call:{name,argsRaw}|null,isError,subCalls}。
     */
    function activityFromBlocks(blocks, opts) {
      const o = opts || {};
      const extractOpts = { commandChars: o.commandChars };
      const out = { commands: [], fileSeeds: [] };
      if (!Array.isArray(blocks)) return out;
      const visit = (block) => {
        if (!block || typeof block !== "object") return;
        const done = "kind" in block;
        const name = done ? (block.call && block.call.name) : block.name;
        const argsRaw = done ? (block.call && block.call.argsRaw) : block.argsRaw;
        const entry = activityEntryOf(name, argsRaw, block.callId, block.seq, extractOpts);
        if (entry.command) {
          if (done && block.isError === true) entry.command.error = true;
          out.commands.push(entry.command);
        }
        if (entry.file) {
          if (done && block.isError === true) entry.file.error = true;
          out.fileSeeds.push(entry.file);
        }
        if (Array.isArray(block.subCalls)) {
          for (const child of block.subCalls) visit(child);
        }
      };
      for (const block of blocks) visit(block);
      return out;
    }

    /** 文件清单去重：按规范化路径合并（保留首现顺序，op 取并集，计数）。 */
    function mergeFiles(fileSeeds) {
      const byPath = new Map();
      const order = [];
      const norm = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      for (const seed of Array.isArray(fileSeeds) ? fileSeeds : []) {
        if (!seed || typeof seed.path !== "string" || seed.path === "") continue;
        const key = norm(seed.path);
        let entry = byPath.get(key);
        if (entry === undefined) {
          entry = { path: seed.path, ops: new Set(), count: 0, error: false, toolName: seed.toolName };
          byPath.set(key, entry);
          order.push(entry);
        }
        if (typeof seed.op === "string") entry.ops.add(seed.op);
        entry.count += 1;
        if (seed.error === true) entry.error = true;
      }
      return order.map((entry) => ({ ...entry, ops: [...entry.ops] }));
    }

    /**
     * 汇总活动为呈现模型：计数 + 截断清单（超上限的只计数）。
     * @returns {{commandCount,fileCount,commands,files,hiddenCommands,hiddenFiles}}
     */
    function summarizeActivity(activity, opts) {
      const o = opts || {};
      const cap = typeof o.maxItems === "number" && o.maxItems >= 1 ? Math.floor(o.maxItems) : DEFAULT_MAX_ITEMS;
      const src = activity || { commands: [], fileSeeds: [] };
      const commands = Array.isArray(src.commands) ? src.commands : [];
      const files = mergeFiles(src.fileSeeds);
      // 最新在后（事件流天然时序），展示时保留时序、截尾保最新。
      const keepCommands = commands.length > cap ? commands.slice(commands.length - cap) : commands;
      const keepFiles = files.length > cap ? files.slice(files.length - cap) : files;
      return {
        commandCount: commands.length,
        fileCount: files.length,
        commands: keepCommands,
        files: keepFiles,
        hiddenCommands: Math.max(0, commands.length - keepCommands.length),
        hiddenFiles: Math.max(0, files.length - keepFiles.length),
      };
    }

    // ---------------------------------------------------------------------------
    // 聚合条摘要节流缓存（M1）：ActivityStrip 订阅**整个会话快照**
    //（useSession((s) => s)），父会话流式期间每条事件都重渲染并全量重扫
    // tool-call 根块（O(N)/事件 = O(N²) 累计）。按「节点表身份 + 尺寸」缓存
    // 摘要：尺寸未变时 1s 内复用（运行中根块的 subCalls 原地增长不改变
    // 节点表 size——时间兜底覆盖该形态）；尺寸变化（新根块入表）立即重算。
    // ---------------------------------------------------------------------------
    const STRIP_SUMMARY_CACHE = new WeakMap();
    function stripSummaryCached(chat, opts) {
      const o = opts || {};
      let nodes = null;
      try {
        if (chat && typeof chat.values === "function") nodes = chat;
        else if (chat && chat.nodes && typeof chat.nodes.values === "function") nodes = chat.nodes;
        else if (chat && chat.chat && chat.chat.nodes && typeof chat.chat.nodes.values === "function") nodes = chat.chat.nodes;
      } catch { nodes = null; }
      if (!nodes || typeof nodes.size !== "number") {
        return summarizeActivity(activityFromBlocks([], o), o);
      }
      const now = Date.now();
      const prev = STRIP_SUMMARY_CACHE.get(nodes);
      if (prev && prev.chars === o.commandChars && prev.maxItems === o.maxItems
        && prev.size === nodes.size && now - prev.at < 1000) {
        return prev.summary;
      }
      const summary = summarizeActivity(
        activityFromBlocks(toolCallRootsFromChatSnapshot(chat), { commandChars: o.commandChars }),
        { maxItems: o.maxItems }
      );
      STRIP_SUMMARY_CACHE.set(nodes, { size: nodes.size, at: now, summary, chars: o.commandChars, maxItems: o.maxItems });
      return summary;
    }

    /**
     * 解析委派调用块为行模型（SubagentLensRow 用）。
     * @returns {{done,toolName,args,description,prompt,runInBackground,
     *            resultText,state}}；坏块返回 {broken:true}。
     */
    function parseBlockFace(block) {
      if (!block || typeof block !== "object") return { broken: true };
      const done = "kind" in block;
      const toolName = done ? (block.call && block.call.name) : block.name;
      const argsRaw = done ? (block.call && block.call.argsRaw) : block.argsRaw;
      const args = parseArgsSafe(argsRaw) || {};
      const description = typeof args.description === "string" ? args.description
        : typeof args.prompt === "string" ? firstLineOf(args.prompt, 80) : "";
      const prompt = typeof args.prompt === "string" ? args.prompt : "";
      const runInBackground = args.run_in_background === true;
      let resultText = "";
      if (done && Array.isArray(block.content)) {
        const parts = [];
        for (const part of block.content) {
          if (part && part.type === "text" && typeof part.text === "string") parts.push(part.text);
        }
        resultText = parts.join("\n");
      }
      let state = "running";
      if (done) {
        if (block.error && block.error.code === "interrupted") state = "stopped";
        else if (block.isError === true) state = "error";
        else state = "ok";
      }
      return {
        done, toolName: typeof toolName === "string" ? toolName : "",
        args, description, prompt, runInBackground, resultText, state,
      };
    }

    /**
     * 从父会话的子代理目录（sessions 快照 subagentsByParent[parentId]）里
     * 匹配 description 对应的子会话条目：label 精确 → 包含 → 首个子条目。
     */
    function matchChildEntry(catalog, description) {
      if (!catalog || !Array.isArray(catalog.entries)) return undefined;
      const children = catalog.entries.filter((e) => e && e.kind === "child" && typeof e.id === "string");
      if (children.length === 0) return undefined;
      const label = typeof description === "string" ? description.trim() : "";
      if (label !== "") {
        const exact = children.find((e) => typeof e.label === "string" && e.label === label);
        if (exact) return exact;
        const partial = children.find((e) => typeof e.label === "string" && e.label !== "" &&
          (e.label.includes(label) || label.includes(e.label)));
        if (partial) return partial;
      }
      return undefined;
    }

    /** 从 chat 快照收集 tool-call 根块（宽容：任意形状都返回数组）。 */
    function toolCallRootsFromChatSnapshot(input) {
      try {
        // 鸭子类型判定（不用 instanceof Map：跨 realm / 被代理的快照会误判）。
        // 兼容三种入参：nodes Map 本体 / chat 快照对象 {order,nodes} / 会话快照 {chat}。
        let nodes = null;
        if (input && typeof input.values === "function") nodes = input;
        else if (input && input.nodes && typeof input.nodes.values === "function") nodes = input.nodes;
        else if (input && input.chat && input.chat.nodes && typeof input.chat.nodes.values === "function") nodes = input.chat.nodes;
        if (nodes === null) return [];
        const roots = [];
        for (const node of nodes.values()) {
          if (node && node.kind === "tool-call" && node.data && node.data.root) roots.push(node.data.root);
        }
        return roots;
      } catch {
        return [];
      }
    }

    // ---------------------------------------------------------------------------
    // 样式（前缀 dsl-；全部用内核 CSS 变量，主题跟随）
    // ---------------------------------------------------------------------------
    const CSS = [
      ".dsl-row{color:var(--dsw-alias-label-primary)}",
      ".dsl-summary{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsl-body{flex-direction:column;gap:8px;padding:8px 12px 10px 34px;display:flex}",
      ".dsl-sectionLabel{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13)}",
      ".dsl-prompt,.dsl-result{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-markdown-code-block);border-radius:8px;padding:8px 10px;max-height:160px;overflow-y:auto;margin:0}",
      ".dsl-hint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13)}",
      ".dsl-list{flex-direction:column;gap:2px;display:flex;max-height:260px;overflow-y:auto;margin:0;padding:0;list-style:none}",
      ".dsl-cmd{font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-all;display:flex;gap:6px;align-items:baseline}",
      ".dsl-cmdIndex{color:var(--dsw-alias-label-tertiary);flex:none;min-width:22px;text-align:right}",
      ".dsl-fileBtn{font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-state-business-primary,var(--dsw-alias-label-primary));background:none;border:none;padding:0;cursor:pointer;text-align:left;white-space:pre-wrap;word-break:break-all;display:flex;gap:6px;align-items:baseline}",
      ".dsl-fileBtn:hover{text-decoration:underline}",
      ".dsl-fileBtn:disabled{cursor:default;color:var(--dsw-alias-label-tertiary)}",
      ".dsl-op{flex:none;font-size:11px;line-height:16px;padding:0 5px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
      ".dsl-errTag{flex:none;font-size:11px;color:var(--dsw-alias-state-error-primary)}",
      ".dsl-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
      ".dsl-chip{display:inline-flex;gap:6px;align-items:center;background:none;border:none;padding:2px 8px;border-radius:999px;cursor:pointer;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}",
      ".dsl-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsl-count{color:var(--dsw-alias-label-primary);font-weight:500}",
      ".dsl-stripWrap{position:relative;display:inline-flex}",
      ".dsl-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:60;min-width:320px;max-width:min(560px,72vw);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2,#fff));border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.14));padding:10px 12px;flex-direction:column;gap:8px;display:flex}",
      ".dsl-panelHead{display:flex;gap:8px;align-items:center;justify-content:space-between}",
      ".dsl-openBtn{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted,#fff);border:none;border-radius:8px;padding:3px 10px;font-size:12px;line-height:18px;cursor:pointer}",
      ".dsl-openBtn:hover{filter:brightness(1.08)}",
      ".dsl-openBtn:disabled{opacity:.5;cursor:default}",
      ".dsl-toggle{display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;padding:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}",
      ".dsl-field{display:flex;flex-direction:column;gap:4px}",
      ".dsl-input{padding:4px 8px;font-family:inherit}",
      ".dsl-switch{width:44px;height:26px;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;border:none;border-radius:999px;flex:none;position:relative;transition:background .15s}",
      ".dsl-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary)}",
      ".dsl-switch:disabled{opacity:.5;cursor:default}",
      ".dsl-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .15s}",
      ".dsl-switch[aria-checked=true] .dsl-knob{transform:translateX(18px)}",
      ".dsl-rowLine{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:12px 0;display:flex}",
      ".dsl-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}",
      ".dsl-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
      ".dsl-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}",
    ].join("");

    const CSS_TAG = "@dsh-external/dsh-subagent-lens/client.css";
    function ensureCss() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]")) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "@dsh-external/dsh-subagent-lens";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ---------------------------------------------------------------------------
    // 配置读取（settings scope 缺席/未就绪时按默认；绝不抛出）
    // ---------------------------------------------------------------------------
    function readConfig(useScope) {
      try {
        if (typeof useScope !== "function") return {};
        const snap = useScope((s) => s);
        if (!snap || snap.status !== "ready" || !snap.value) return {};
        return snap.value || {};
      } catch {
        return {};
      }
    }

    // ---------------------------------------------------------------------------
    // 共享子组件
    // ---------------------------------------------------------------------------

    const OP_LABEL = { read: L.fileRead, write: L.fileWrite, edit: L.fileEdit };

    /**
     * 打开一个文件：唯一通路是内核在 toolview 槽位上给的 openFile。
     * 自制壳的原生 openPath 支路已随壳删除（官方没有替身），所以这里不再需要
     * cwd 拼绝对路径；拿不到 openFile 就什么都不做，由调用侧按「不支持打开」呈现。
     */
    function openPathBestEffort(path, openFile) {
      try {
        if (typeof openFile !== "function") return;
        const r = openFile(path);
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch { /* 打开失败静默 */ }
    }

    function ActivityLists({ summary, openFile }) {
      const items = [];
      items.push(jsx("div", { key: "label-c", className: "dsl-sectionLabel", children: L.commandsLabel + " · " + summary.commandCount }));
      if (summary.commands.length === 0) {
        items.push(jsx("div", { key: "no-c", className: "dsl-hint", children: L.noActivity }));
      } else {
        items.push(jsxs("ul", {
          key: "list-c", className: "dsl-list",
          children: summary.commands.map((item, i) => jsxs("li", {
            className: "dsl-cmd",
            title: item.truncated ? L.truncatedHint.replace("{n}", String(item.originalLength)) : undefined,
            children: [
              jsx("span", { className: "dsl-cmdIndex", children: (i + 1) + "." }),
              jsx("span", { children: item.command + (item.truncated ? " …" : "") }),
              item.error ? jsx("span", { className: "dsl-errTag", children: L.errTag }) : null,
            ],
          })),
        }));
      }
      items.push(jsx("div", { key: "label-f", className: "dsl-sectionLabel", children: L.filesLabel + " · " + summary.fileCount }));
      if (summary.files.length === 0) {
        items.push(jsx("div", { key: "no-f", className: "dsl-hint", children: L.noActivity }));
      } else {
        // 只有内核给的 openFile 这一条通路：没有就把行置灰并说明原因，
        // 不再假装能打开（自制壳的 openPath 支路已删）。
        const canOpen = typeof openFile === "function";
        items.push(jsxs("ul", {
          key: "list-f", className: "dsl-list",
          children: summary.files.map((file, i) => jsxs("li", {
            className: "dsl-cmd",
            children: [
              jsx("span", { className: "dsl-cmdIndex", children: (i + 1) + "." }),
              jsxs("button", {
                type: "button",
                className: "dsl-fileBtn",
                disabled: !canOpen,
                title: canOpen ? file.path : file.path + "（当前环境不支持打开文件）",
                onClick: (e) => { e.stopPropagation(); openPathBestEffort(file.path, openFile); },
                children: [
                  jsxs("span", { className: "dsl-op", children: file.ops.map((op) => OP_LABEL[op] || op).join("/") }),
                  jsx("span", { children: file.path + (file.count > 1 ? " ×" + file.count : "") }),
                  file.error ? jsx("span", { className: "dsl-errTag", children: L.errTag }) : null,
                ],
              }),
            ],
          })),
        }));
      }
      if (summary.hiddenCommands > 0 || summary.hiddenFiles > 0) {
        const parts = [];
        if (summary.hiddenCommands > 0) parts.push(L.commandsLabel + " " + L.cappedHint.replace("{shown}", String(summary.commands.length)).replace("{total}", String(summary.commandCount)));
        if (summary.hiddenFiles > 0) parts.push(L.filesLabel + " " + L.cappedHint.replace("{shown}", String(summary.files.length)).replace("{total}", String(summary.fileCount)));
        items.push(jsx("div", { key: "capped", className: "dsl-hint", children: parts.join("；") }));
      }
      return jsx("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: items });
    }

    // ---------------------------------------------------------------------------
    // 1) 委派调用行（tool.call.toolview，按 key 注册）
    // ---------------------------------------------------------------------------
    function SubagentLensRow(props) {
      const { callId, toolName, block, openFile, cwd, inspect } = props;
      const useSession = props.useSession;
      const useSessions = props.useSessions;
      const useScope = props.useScope;
      const sessionId = props.sessionId;

      // —— hooks 区（全部无条件调用；内部 try/catch，失败给默认值）——
      const cfg = readConfig(useScope);
      const [expanded, setExpanded] = react.useState(false);
      const [, setTick] = react.useState(0);
      let catalog = undefined;
      try {
        if (typeof useSessions === "function") {
          catalog = useSessions((s) => (s.subagentsByParent && sessionId) ? s.subagentsByParent[sessionId] : undefined);
        }
      } catch { catalog = undefined; }

      // —— 早退区（hooks 之后）——
      const lensOn = cfg.enabled !== false;
      const maxItems = typeof cfg.maxItems === "number" && cfg.maxItems >= 1 ? cfg.maxItems : DEFAULT_MAX_ITEMS;
      const commandChars = typeof cfg.commandChars === "number" && cfg.commandChars >= 10 ? cfg.commandChars : DEFAULT_COMMAND_CHARS;

      let face;
      try { face = parseBlockFace(block); } catch { face = { broken: true }; }
      if (face.broken) {
        return jsx("div", { className: "dsl-row", "data-tool": toolName, children: String(toolName || "tool") });
      }

      let child = undefined;
      try { child = matchChildEntry(catalog, face.description); } catch { child = undefined; }

      // 子会话活动（只读 sessions 服务的本地 binding；子会话未打开则无）。
      let childSummary = null;
      let childRunning = false;
      try {
        if (child) {
          childRunning = child.activity === "running";
          const binding = sessionsFace && typeof sessionsFace.binding === "function" ? sessionsFace.binding(child.id) : undefined;
          const events = childWindowEvents(binding);
          if (events) {
            childSummary = summarizeActivity(activityFromEventsCached(events, { commandChars }), { maxItems });
          }
        }
      } catch { childSummary = null; }

      // 子代理运行中且行已展开时低频轮询（子会话事件不触发本组件重渲染）。
      react.useEffect(() => {
        if (!expanded || !childRunning) return undefined;
        const timer = setInterval(() => { try { setTick((n) => n + 1); } catch { /* 已卸载 */ } }, 1200);
        return () => clearInterval(timer);
      }, [expanded, childRunning]);

      const stateDot = face.state === "running" ? "ongoing" : face.state === "error" ? "error" : "done";
      const summaryText = firstLineOf(face.description, 90) || (face.runInBackground ? "(后台运行)" : "");
      const resultCut = face.done ? truncateText(face.resultText, 2000) : null;

      const openChild = () => {
        try {
          if (child && sessionsFace && typeof sessionsFace.openSubagent === "function") {
            sessionsFace.openSubagent({ parentSessionId: sessionId, childSessionId: child.id, mode: child.mode });
          }
        } catch { /* 打开失败静默 */ }
      };

      const body = jsxs("div", {
        className: "dsl-body",
        children: [
          face.prompt !== "" ? jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 4 },
            children: [
              jsx("span", { className: "dsl-sectionLabel", children: L.promptLabel }),
              jsx("pre", { className: "dsl-prompt", children: face.prompt }),
            ],
          }) : null,
          resultCut && resultCut.text !== "" ? jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 4 },
            children: [
              jsx("span", { className: "dsl-sectionLabel", children: L.resultLabel }),
              jsx("pre", { className: "dsl-result", children: resultCut.text + (resultCut.truncated ? " …" : "") }),
            ],
          }) : null,
          lensOn ? jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 6 },
            children: [
              jsx("span", { className: "dsl-sectionLabel", children: L.activityLabel }),
              childSummary
                ? jsx(ActivityLists, { summary: childSummary, openFile: openFile })
                : jsx("div", { className: "dsl-hint", children: L.childNotLoaded }),
              jsxs("div", {
                className: "dsl-actions",
                children: [
                  jsx("button", {
                    type: "button",
                    className: "dsl-openBtn",
                    disabled: !child,
                    onClick: openChild,
                    children: L.openChild,
                  }),
                  childRunning ? jsx("span", { className: "dsl-hint", children: "运行中…" }) : null,
                ],
              }),
            ],
          }) : null,
          typeof inspect === "function" ? jsx("button", {
            type: "button",
            className: "dsl-toggle",
            onClick: (e) => { e.stopPropagation(); try { inspect(); } catch { /* 检视失败静默 */ } },
            children: "Inspect",
          }) : null,
        ],
      });

      const row = jsxs("div", {
        className: "dsl-row",
        "data-tool": toolName,
        "data-dsl-call": callId,
        children: [
          stateDot !== "done" && primitives.StateDot ? jsx(primitives.StateDot, { state: stateDot }) : null,
          jsxs("button", {
            type: "button",
            className: "dsl-toggle",
            "aria-expanded": expanded,
            onClick: () => setExpanded((v) => !v),
            children: [
              expanded ? "▾" : "▸",
              " " + L.rowTitle + " · " + (summaryText !== "" ? summaryText : toolName),
              face.runInBackground ? "（后台）" : "",
              childSummary ? " — " + L.commandsLabel + " " + childSummary.commandCount + " · " + L.filesLabel + " " + childSummary.fileCount : "",
            ],
          }),
        ],
      });

      return jsxs("div", {
        style: { display: "flex", flexDirection: "column" },
        children: [row, expanded ? body : null],
      });
    }

    // ---------------------------------------------------------------------------
    // 2) 会话头聚合条（conversation.session.header.utilities）
    // ---------------------------------------------------------------------------
    function ActivityStrip(props) {
      const { sessionId, useSession, useSessions, useScope } = props;

      // —— hooks 区（全部无条件调用；内部 try/catch，失败给默认值）——
      const cfg = readConfig(useScope);
      const [open, setOpen] = react.useState(false);
      let chat = null;
      let isSubagent = false;
      let running = false;
      let cwd = "";
      try {
        if (typeof useSession === "function") {
          const snap = useSession((s) => s) || null;
          chat = snap && snap.chat ? snap.chat : null;
          isSubagent = !!snap.subagent;
          running = !!snap.running;
        }
      } catch { chat = null; }
      try {
        if (typeof useSessions === "function") {
          cwd = useSessions((s) => (s.byId && sessionId && s.byId[sessionId]) ? (s.byId[sessionId].cwd || "") : "");
        }
      } catch { cwd = ""; }
      react.useEffect(() => {
        if (!open) return undefined;
        const close = (e) => {
          try {
            if (e.target instanceof Node && !(e.target.closest && e.target.closest(".dsl-stripWrap"))) setOpen(false);
          } catch { /* 忽略 */ }
        };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
      }, [open]);

      // —— 早退区（hooks 之后）——
      if (cfg.enabled === false || cfg.headerStrip === false) return null;
      const maxItems = typeof cfg.maxItems === "number" && cfg.maxItems >= 1 ? cfg.maxItems : DEFAULT_MAX_ITEMS;
      const commandChars = typeof cfg.commandChars === "number" && cfg.commandChars >= 10 ? cfg.commandChars : DEFAULT_COMMAND_CHARS;

      // 节点表抽取 + 汇总已移入 stripSummaryCached（M1 节流缓存；见其注释）。
      const summary = stripSummaryCached(chat, { commandChars, maxItems });

      if (summary.commandCount === 0 && summary.fileCount === 0 && !isSubagent && !running) return null;

      // 打开文件的能力这里不再自己判：官方客户端没有任何页内可用的 openPath
      // （自制壳的 window.dshDesktop.openPath 随壳一起退场了）。
      // 把决定权交给 ActivityLists —— 它按「内核有没有给 openFile」置灰并写明原因，
      // 所以缺能力时是可见的「不支持」，而不是点了没反应。
      return jsxs("div", {
        className: "dsl-stripWrap",
        children: [
          jsxs("button", {
            type: "button",
            className: "dsl-chip",
            "aria-expanded": open,
            title: (isSubagent ? L.stripSubagentTitle : L.stripTitle) + "：" +
              L.commandsLabel + " " + summary.commandCount + " · " + L.filesLabel + " " + summary.fileCount,
            onClick: () => setOpen((v) => !v),
            children: [
              jsxs("span", { children: (isSubagent ? L.stripSubagentTitle : L.stripTitle) + "：" }),
              jsx("span", { className: "dsl-count", children: String(summary.commandCount) }),
              jsx("span", { children: " " + L.commandsLabel + " · " }),
              jsx("span", { className: "dsl-count", children: String(summary.fileCount) }),
              jsx("span", { children: " " + L.filesLabel }),
              open ? " ▴" : " ▾",
            ],
          }),
          open ? jsxs("div", {
            className: "dsl-panel",
            children: [
              jsxs("div", {
                className: "dsl-panelHead",
                children: [
                  jsx("span", { className: "dsl-sectionLabel", children: (isSubagent ? L.stripSubagentTitle : L.stripTitle) + " · " + L.windowHint }),
                  jsx("button", {
                    type: "button",
                    className: "dsl-toggle",
                    onClick: () => setOpen(false),
                    children: "✕",
                  }),
                ],
              }),
              jsx(ActivityLists, { summary: summary, cwd: cwd }),
            ],
          }) : null,
        ],
      });
    }

    // ---------------------------------------------------------------------------
    // 3) 设置卡（settings.section）
    // ---------------------------------------------------------------------------
    function LensSettingsCard(settingsProps) {
      const { useScope, scope } = settingsProps;
      const snap = safeSnapshot(useScope);
      const [form, setForm] = react.useState({});
      const [busy, setBusy] = react.useState(false);
      const [saved, setSaved] = react.useState(false);

      react.useEffect(() => {
        if (!snap || snap.status !== "ready") return;
        const v = snap.value || {};
        setForm({
          toolNames: Array.isArray(v.toolNames) ? v.toolNames.join(", ") : "",
          maxItems: String(v.maxItems ?? DEFAULT_MAX_ITEMS),
          commandChars: String(v.commandChars ?? DEFAULT_COMMAND_CHARS),
        });
      }, [snap && snap.status]);

      if (!snap || snap.status !== "ready") {
        return jsx("div", { children: snap && snap.status === "loading" ? L.settings.loading : L.settings.unavailable });
      }

      const enabled = !((snap.value || {}).enabled === false);
      const stripOn = !((snap.value || {}).headerStrip === false);

      const toggle = async (key, on) => {
        try { await scope.set(key, on); } catch (error) { console.warn("[dsh-subagent-lens] 切换开关失败:", error); }
      };
      const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
      const numberOr = (text, fallback) => {
        const n = Number(text);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
      };
      const save = async () => {
        setBusy(true);
        setSaved(false);
        try {
          const names = splitToolNames(form.toolNames);
          if (names.length > 0) await scope.set("toolNames", names);
          await scope.set("maxItems", numberOr(form.maxItems, DEFAULT_MAX_ITEMS));
          await scope.set("commandChars", numberOr(form.commandChars, DEFAULT_COMMAND_CHARS));
          setSaved(true);
        } catch (error) {
          console.warn("[dsh-subagent-lens] 保存设置失败:", error);
        } finally {
          setBusy(false);
        }
      };

      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 12, padding: 16, maxWidth: 560 },
        children: [
          jsx("h2", { children: L.navSub }),
          toggleRow(L.settings.enabledLabel, L.settings.enabledHint, enabled, (on) => toggle("enabled", on), enabled ? L.settings.enabledOn : L.settings.enabledOff),
          toggleRow(L.settings.stripLabel, L.settings.stripHint, stripOn, (on) => toggle("headerStrip", on), null),
          fieldRow(L.settings.toolNamesLabel, L.settings.toolNamesHint,
            jsx("input", { type: "text", className: "dsl-input", value: form.toolNames || "", onChange: (e) => set("toolNames")(e.target.value) })),
          fieldRow(L.settings.maxItemsLabel, null,
            jsx("input", { type: "number", className: "dsl-input", value: form.maxItems || "", onChange: (e) => set("maxItems")(e.target.value) })),
          fieldRow(L.settings.commandCharsLabel, null,
            jsx("input", { type: "number", className: "dsl-input", value: form.commandChars || "", onChange: (e) => set("commandChars")(e.target.value) })),
          jsxs("div", {
            style: { display: "flex", alignItems: "center", gap: 8 },
            children: [
              jsx("button", {
                type: "button",
                className: "dsl-openBtn",
                disabled: busy || !snap.writable,
                onClick: save,
                children: busy ? L.settings.saving : L.settings.save,
              }),
              saved ? jsx("span", { children: L.settings.saved }) : null,
            ],
          }),
        ],
      });
    }

    function safeSnapshot(useScope) {
      try {
        return typeof useScope === "function" ? useScope((s) => s) : null;
      } catch {
        return null;
      }
    }

    function fieldRow(label, hint, input) {
      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsx("span", { children: label }),
          input,
          hint ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: hint }) : null,
        ],
      });
    }

    function toggleRow(label, hint, checked, onToggle, statusLine) {
      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", border: "1px solid var(--dsw-alias-border-l2, #ccc)", borderRadius: 8 },
        children: [
          jsxs("label", {
            style: { display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" },
            children: [
              jsx("input", {
                type: "checkbox",
                checked: !!checked,
                style: { margin: "3px 0 0" },
                onChange: (e) => onToggle(e.target.checked),
              }),
              jsxs("span", {
                style: { display: "flex", flexDirection: "column", gap: 2 },
                children: [
                  jsx("span", { children: label }),
                  hint ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: hint }) : null,
                ],
              }),
            ],
          }),
          statusLine ? jsx("span", { style: { fontSize: 12, opacity: 0.75 }, children: statusLine }) : null,
        ],
      });
    }

    // ---------------------------------------------------------------------------
    // apply：slots 注册（全部 try/catch，失败静默）
    // ---------------------------------------------------------------------------
    let sessionsFace = undefined;

    function readInitialToolNames(scope) {
      try {
        const snap = scope && typeof scope.getSnapshot === "function" ? scope.getSnapshot() : null;
        if (snap && snap.status === "ready" && snap.value) {
          const names = splitToolNames(snap.value.toolNames);
          if (names.length > 0) return names;
        }
      } catch { /* 未就绪 → 默认 */ }
      return DEFAULT_TOOL_NAMES.slice();
    }

    function apply(ctx) {
      try { sessionsFace = ctx.sessions; } catch { sessionsFace = undefined; }

      let scope = undefined;
      let useScope = undefined;
      try {
        if (ctx.remote && ctx.remote.settings) {
          scope = bindSettingsScope(ctx, SETTINGS_ENTRY_ID);
          useScope = bindSnapshotSelector(scope);
        }
      } catch { scope = undefined; useScope = undefined; }

      // 1) 委派工具行（toolview 按 key 注册；key 集合在装载时定死，改配置需重载）。
      const toolNames = readInitialToolNames(scope);
      try {
        ctx.slots.inject("tool.call.toolview", function* () {
          for (const key of toolNames) {
            yield ctx.slots.register({
              name: "tool.call.toolview",
              key,
              priority: -1,
              inject: (sessionId) => (useScope ? { useScope } : {}),
            }, function LensRowForward(props) {
              try {
                return SubagentLensRow(props);
              } catch (error) {
                // 渲染失败降级为最小行（不能 null：那会把整条工具调用藏掉）。
                console.warn("[dsh-subagent-lens] 委派行渲染失败（已降级为最小行）: " + ((error && error.message) || error));
                const fallbackFace = parseBlockFace(props && props.block);
                const label = (fallbackFace && !fallbackFace.broken && fallbackFace.description) || (props && props.toolName) || "tool";
                return jsx("div", { className: "dsl-row", children: L.rowTitle + " · " + firstLineOf(label, 90) });
              }
            });
          }
        }, "dsh-subagent-lens: delegation toolview rows");
      } catch (error) {
        console.warn("[dsh-subagent-lens] toolview 注册失败（委派行降级为官方通用卡片）: " + ((error && error.message) || error));
      }

      // 2) 会话头聚合条。
      try {
        ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
          name: "conversation.session.header.utilities",
          id: "dsh-subagent-lens-activity",
          order: 50,
        }, function StripForward(props) {
          try {
            return ActivityStrip(props);
          } catch (error) {
            console.warn("[dsh-subagent-lens] 活动聚合条渲染失败（已隐藏）: " + ((error && error.message) || error));
            return null;
          }
        }), "dsh-subagent-lens: session header activity strip");
      } catch (error) {
        console.warn("[dsh-subagent-lens] 会话头聚合条注册失败: " + ((error && error.message) || error));
      }

      // 3) 设置栏目。
      if (scope) {
        try {
          ctx.slots.inject("settings.section", () => ctx.slots.register({
            name: "settings.section",
            id: "dsh-subagent-lens",
            order: 76,
            label: () => L.nav,
            inject: () => ({ useScope, scope }),
          }, LensSettingsCard), "dsh-subagent-lens: settings section entry");
        } catch (error) {
          console.warn("[dsh-subagent-lens] 设置栏目注册失败: " + ((error && error.message) || error));
        }
      }

      try { ensureCss(); } catch { /* 样式失败不阻断 */ }
    }

    // ---------------------------------------------------------------------------
    // 导出（apply/inject + 全部纯函数，供 vm 沙箱单测消费）
    // ---------------------------------------------------------------------------
    exports.apply = apply;
    exports.inject = ["slots", "remote", "remote.settings", "sessions"];
    exports.DEFAULT_TOOL_NAMES = DEFAULT_TOOL_NAMES;
    exports.classifyActivityTool = classifyActivityTool;
    exports.pickPath = pickPath;
    exports.parseArgsSafe = parseArgsSafe;
    exports.truncateText = truncateText;
    exports.firstLineOf = firstLineOf;
    exports.splitToolNames = splitToolNames;
    exports.activityEntryOf = activityEntryOf;
    exports.childWindowEvents = childWindowEvents;
    exports.activityFromEvents = activityFromEvents;
    exports.activityFromEventsCached = activityFromEventsCached;
    exports.stripSummaryCached = stripSummaryCached;
    exports.activityFromBlocks = activityFromBlocks;
    exports.mergeFiles = mergeFiles;
    exports.summarizeActivity = summarizeActivity;
    exports.parseBlockFace = parseBlockFace;
    exports.matchChildEntry = matchChildEntry;
    exports.toolCallRootsFromChatSnapshot = toolCallRootsFromChatSnapshot;
    return module.exports;
  }
});
