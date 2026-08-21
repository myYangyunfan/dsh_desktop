// @deepseek-ai/dsh-openclaw-bridge 客户端半边：DSH 设置页的「ClawBot / IM 桥接」配置栏。
// 结构（SPEC v0.7.0 §8）：
//  1) 桥接设置（通用）：接收模型 + 桥接 Token + 工作目录 + 旧白名单 + 第三方端点
//  2) IM 渠道三卡：微信（即时可用）/ 飞书（P1）/ QQ（P2）——每卡：开关 / 状态 /
//     凭据 / 白名单 / 操作按钮（扫码/配对码/断开）。
// 打包格式与 dsh-client-ui-settings-models 的 lib/client.js 相同。
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-openclaw-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		// bindSnapshotSelector 三级回落（高级设置空白根因修复，issue #124）：
		// rc.8 的 dsh-client-ui-renderer 只导出 apply/inject——require 成功但解构
		// useSyncExternalStoreWithSelector 得 undefined（try 不抛、catch 永不触发），
		// 组件首渲染即 TypeError → slot entry crash 退位 → dead cell → 栏目空白。
		//   1) renderer.useSyncExternalStoreWithSelector —— 仅当真实导出（typeof 校验）
		//   2) web-react.bindSnapshotSelector —— rc.7 官方包（Tauri 由 client-compat
		//      注入页面模块表；Electron 0.4.x 前端 dist 自带）
		//   3) react 原生 useSyncExternalStore 兜底 —— 整快照引用稳定（宿主源均
		//      freeze 快照），selector 每渲染求值；isEqual 语义退化为 Object.is。
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
		} catch { /* 模块不在页面表（rc.7 及更早内核）→ 走下一级回落 */ }

		if (!bindSnapshotSelector) {
			const { useSyncExternalStore } = require("react");
			bindSnapshotSelector = (source) => {
				const subscribe = (fn) => source.subscribe(fn);
				const getSnapshot = () => source.getSnapshot();
				return (selector) => selector(useSyncExternalStore(subscribe, getSnapshot));
			};
		}
		const { Button, Input } = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "openclaw-bridge";

		const L = {
			nav: "ClawBot",
			navSub: "IM 桥接：微信 / 飞书 / QQ → DSH 会话",
			modelLabel: "接收模型",
			modelHint: "形如 provider/model（如 deepseek-official/deepseek-v4-pro）；留空 = 使用 DSH 默认模型",
			tokenLabel: "桥接 Token",
			tokenHint: "留空保存 = 保持现状（回环地址访问无需 Token）",
			workspaceLabel: "工作目录（远程办公）",
			workspaceHint: "绝对路径，如 C:\\Users\\you\\Desktop\\work；留空 = 隔离的桥接工作区",
			allowlistLabel: "微信用户白名单（旧字段）",
			allowlistHint: "已迁移到下方微信卡片的白名单；两处都留空 = 允许所有发消息的人",
			customTitle: "第三方模型端点（OpenAI 兼容）",
			customBaseLabel: "baseURL",
			customBaseHint: "填了它就改用这个端点（如 https://api.siliconflow.cn/v1）；留空 = 用上面的接收模型",
			customKeyLabel: "API Key",
			customKeyHint: "留空保存 = 保持现状",
			customModelLabel: "模型名",
			customModelHint: "该端点上的模型 id（如 deepseek-ai/DeepSeek-V3）",
			endpoint: "接入端点（OpenAI 兼容）：",
			endpointPath: "/openclaw-bridge/v1/chat/completions",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			loading: "加载中…",
			unavailable: "设置不可用（需要在本机浏览器中打开）",
			channelsTitle: "IM 渠道",
			enable: "启用",
			disable: "停用",
			enabled: "已启用",
			disabled: "已停用",
			whitelistLabel: "白名单",
			whitelistHint: "逗号分隔的用户 id；留空 = 允许所有发消息的人",
			credentialHint: "留空保存 = 保持现状",
			eta: "开发中（",
			etaEnd: "）",
			wxDisconnected: "未连接",
			wxWaitingQr: "正在生成二维码…",
			wxWaitingScan: "请用微信扫码绑定（ClawBot 插件里点绑定，扫这个码）：",
			wxNeedVerify: "微信已扫码，请输入微信上显示的配对码：",
			wxConnected: "已连接",
			wxExpired: "会话已过期，请重新扫码",
			connect: "连接",
			disconnect: "断开",
			submitCode: "提交配对码",
			codePlaceholder: "数字配对码",
			hoursLeft: "剩余约 X 小时（每 24h 需重扫）",
			scanLink: "也可以点开链接绑定：",
			stateConnecting: "连接中…",
			stateReconnecting: "重连中…",
			stateFailed: "连接失败",
			testConn: "连接测试",
			testConnOk: "凭据有效",
			groupSignatureLabel: "群聊署名",
			groupSignatureHint: "群聊回复给发言者加 [昵称] 前缀（默认开）",
			maxAgentsLabel: "会话池上限",
			maxAgentsHint: "同时保留的 agent 会话数（默认 16，超限按 LRU 淘汰）",
			signatureOn: "署名：开",
			signatureOff: "署名：关",
			sandboxLabel: "沙箱环境",
			sandboxHint: "QQ 机器人沙箱模式（默认开；切正式环境请关闭）",
			sandboxOn: "沙箱：开",
			sandboxOff: "沙箱：关",
			clearBtn: "清除",
			authAlwaysLabel: "严格鉴权（回环也要 Token）",
			authAlwaysHint: "默认关：回环地址免 Token；打开后所有请求都要求 Bearer Token",
			authOn: "严格鉴权：开（回环也要 Token）",
			authOff: "严格鉴权：关（回环免 Token）",
			qqOfficialEta: "由官方 @tencent-connect/dsh-qqbot 提供",
			qqOfficialNote: "QQ 通道不再由本插件自研实现，改由官方插件 @tencent-connect/dsh-qqbot 独立提供。\n\n安装后重启 DSH 即自动装配；凭据二选一：\n  · 环境变量 QQBOT_APPID / QQBOT_SECRET；\n  · 或首次运行在插件日志/终端出现授权码时扫码绑定。\n\n收到 QQ 消息将直达 DSH 会话并自动回复，无需本插件额外配置。"
		};

		// 渠道表（与服务端 CHANNEL_TABLE 对齐；implemented=false 的渠道仅占位 + 配置）
		const CHANNELS = [
			{
				id: "wechat",
				title: "微信",
				implemented: true,
				eta: "",
				enableKey: "enableWechat",
				whitelistKey: "whitelistWechat",
				statusPath: "/openclaw-bridge/wechat/status",
				loginPath: "/openclaw-bridge/wechat/login",
				logoutPath: "/openclaw-bridge/wechat/logout",
				verifyPath: "/openclaw-bridge/wechat/verify",
				whitelistPh: "user1@im.wechat,user2@im.wechat",
				fields: []
			},
			{
				id: "feishu",
				title: "飞书",
				implemented: true,
				eta: "",
				enableKey: "enableFeishu",
				whitelistKey: "whitelistFeishu",
				statusPath: "/openclaw-bridge/channels/feishu/status",
				loginPath: "/openclaw-bridge/channels/feishu/login",
				logoutPath: "/openclaw-bridge/channels/feishu/logout",
				verifyPath: "",
				validatePath: "/openclaw-bridge/channels/feishu/validate",
				whitelistPh: "ou_xxx,ou_yyy",
				fields: [
					{ key: "feishuAppId", label: "App ID", ph: "cli_xxx", secret: false },
					{ key: "feishuAppSecret", label: "App Secret", ph: "留空保存 = 保持现状", secret: true },
					{ key: "feishuEncryptKey", label: "Encrypt Key", ph: "留空 = 不加密", secret: true }
				]
			},
			{
				id: "qq",
				title: "QQ",
				implemented: false,
				eta: L.qqOfficialEta,
				enableKey: "enableQq",
				whitelistKey: "whitelistQq",
				statusPath: "",
				loginPath: "",
				logoutPath: "",
				verifyPath: "",
				whitelistPh: "",
				fields: []
			}
		];

		function fieldRow(label, hint, input) {
			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 4 },
				children: [
					jsx("span", { children: label }),
					input,
					hint ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: hint }) : null
				]
			});
		}

		function SettingsBlock(props) {
			const { useScope, scope } = props;
			const snap = useScope((s) => s);
			const [model, setModel] = react.useState("");
			const [token, setToken] = react.useState("");
			const [workspace, setWorkspace] = react.useState("");
			const [allowlist, setAllowlist] = react.useState("");
			const [customBaseURL, setCustomBaseURL] = react.useState("");
			const [customApiKey, setCustomApiKey] = react.useState("");
			const [customModel, setCustomModel] = react.useState("");
			const [groupSignature, setGroupSignature] = react.useState("1");
			const [maxAgents, setMaxAgents] = react.useState("");
			const [authAlways, setAuthAlways] = react.useState("");
			const [err, setErr] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [saved, setSaved] = react.useState(false);

			react.useEffect(() => {
				if (snap.status !== "ready") return;
				setModel((snap.value && snap.value.model) || "");
				setToken("");
				setWorkspace((snap.value && snap.value.workspace) || "");
				setAllowlist((snap.value && snap.value.allowlist) || "");
				setCustomBaseURL((snap.value && snap.value.customBaseURL) || "");
				setCustomApiKey("");
				setCustomModel((snap.value && snap.value.customModel) || "");
				setGroupSignature(String((snap.value && snap.value.groupSignature) || "1"));
				setMaxAgents(String((snap.value && snap.value.maxAgents) || ""));
				setAuthAlways(String((snap.value && snap.value.authAlways) || ""));
				setErr("");
			}, [snap.status]);

			if (snap.status !== "ready") {
				return jsx("div", { children: snap.status === "loading" ? L.loading : L.unavailable });
			}

			const save = async () => {
				setBusy(true);
				setSaved(false);
				try {
					const wantModel = model.trim();
					const haveModel = (snap.value && snap.value.model) || "";
					if (wantModel !== haveModel) await scope.set("model", wantModel);
					const wantToken = token.trim();
					if (wantToken !== "") await scope.set("token", wantToken);
					const wantWorkspace = workspace.trim();
					const haveWorkspace = (snap.value && snap.value.workspace) || "";
					if (wantWorkspace !== haveWorkspace) await scope.set("workspace", wantWorkspace);
					const wantAllowlist = allowlist.trim();
					const haveAllowlist = (snap.value && snap.value.allowlist) || "";
					if (wantAllowlist !== haveAllowlist) await scope.set("allowlist", wantAllowlist);
					const wantCustomBase = customBaseURL.trim();
					const haveCustomBase = (snap.value && snap.value.customBaseURL) || "";
					if (wantCustomBase !== haveCustomBase) await scope.set("customBaseURL", wantCustomBase);
					const wantCustomKey = customApiKey.trim();
					if (wantCustomKey !== "") await scope.set("customApiKey", wantCustomKey);
					const wantCustomModel = customModel.trim();
					const haveCustomModel = (snap.value && snap.value.customModel) || "";
					if (wantCustomModel !== haveCustomModel) await scope.set("customModel", wantCustomModel);
					const wantSig = groupSignature.trim() || "1";
					const haveSig = String((snap.value && snap.value.groupSignature) || "1");
					if (wantSig !== haveSig) await scope.set("groupSignature", wantSig);
					const wantMax = maxAgents.trim();
					const haveMax = String((snap.value && snap.value.maxAgents) || "");
					if (wantMax !== haveMax) await scope.set("maxAgents", wantMax);
					setSaved(true);
				} finally {
					setBusy(false);
				}
			};

			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 12 },
				children: [
					fieldRow(L.modelLabel, L.modelHint, jsx(Input, {
						value: model,
						placeholder: "provider/model",
						onChange: (e) => setModel(e.target.value)
					})),
					fieldRow(L.tokenLabel, L.tokenHint, jsxs("div", {
						style: { display: "flex", gap: 8, alignItems: "center" },
						children: [
							jsx(Input, {
								value: token,
								placeholder: "（留空保持现状，清除请点右边按钮）",
								onChange: (e) => setToken(e.target.value)
							}),
							jsx(Button, {
								size: "sm",
								variant: "ghost",
								disabled: busy || !snap.writable,
								onClick: async () => {
									try {
										setBusy(true);
										setSaved(false);
										setErr("");
										setToken("");
										await scope.set("token", ""); // 修复⑦：显式清空已保存的 Token
										setSaved(true);
									} catch (e) {
										setErr(String(e));
									} finally {
										setBusy(false);
									}
								},
								children: L.clearBtn
							})
						]
					})),
					fieldRow(L.workspaceLabel, L.workspaceHint, jsx(Input, {
						value: workspace,
						placeholder: "留空 = 隔离工作区",
						onChange: (e) => setWorkspace(e.target.value)
					})),
					fieldRow(L.allowlistLabel, L.allowlistHint, jsx(Input, {
						value: allowlist,
						placeholder: "user1@im.wechat,user2@im.wechat",
						onChange: (e) => setAllowlist(e.target.value)
					})),
					jsx("h3", { children: L.customTitle }),
					fieldRow(L.customBaseLabel, L.customBaseHint, jsx(Input, {
						value: customBaseURL,
						placeholder: "https://api.example.com/v1",
						onChange: (e) => setCustomBaseURL(e.target.value)
					})),
					fieldRow(L.customKeyLabel, L.customKeyHint, jsxs("div", {
						style: { display: "flex", gap: 8, alignItems: "center" },
						children: [
							jsx(Input, {
								value: customApiKey,
								placeholder: "sk-...",
								onChange: (e) => setCustomApiKey(e.target.value)
							}),
							jsx(Button, {
								size: "sm",
								variant: "ghost",
								disabled: busy || !snap.writable,
								onClick: async () => {
									try {
										setBusy(true);
										setSaved(false);
										setErr("");
										setCustomApiKey("");
										await scope.set("customApiKey", ""); // 修复⑦：显式清空已保存的 API Key
										setSaved(true);
									} catch (e) {
										setErr(String(e));
									} finally {
										setBusy(false);
									}
								},
								children: L.clearBtn
							})
						]
					})),
					fieldRow(L.customModelLabel, L.customModelHint, jsx(Input, {
						value: customModel,
						placeholder: "model-id",
						onChange: (e) => setCustomModel(e.target.value)
					})),
					jsx("div", { style: { fontSize: 12, opacity: 0.65 }, children: L.endpoint + " " + L.endpointPath }),
					jsx("h3", { children: "高级" }),
					fieldRow(L.groupSignatureLabel, L.groupSignatureHint, jsx(Button, {
						variant: groupSignature !== "0" ? "primary" : "ghost",
						size: "sm",
						disabled: busy || !snap.writable,
						onClick: () => setGroupSignature(groupSignature === "0" ? "1" : "0"),
						children: groupSignature !== "0" ? L.signatureOn : L.signatureOff
					})),
					fieldRow(L.maxAgentsLabel, L.maxAgentsHint, jsx(Input, {
						value: maxAgents,
						placeholder: "16",
						onChange: (e) => setMaxAgents(e.target.value)
					})),
					fieldRow(L.authAlwaysLabel, L.authAlwaysHint, jsx(Button, {
						variant: authAlways === "1" ? "primary" : "ghost",
						size: "sm",
						disabled: busy || !snap.writable,
						onClick: async () => {
							try {
								setBusy(true);
								setSaved(false);
								setErr("");
								const next = authAlways === "1" ? "" : "1"; // 修复⑧：回环也要求 Token 的开关
								setAuthAlways(next);
								await scope.set("authAlways", next);
								setSaved(true);
							} catch (e) {
								setErr(String(e));
							} finally {
								setBusy(false);
							}
						},
						children: authAlways === "1" ? L.authOn : L.authOff
					})),
					jsxs("div", {
						style: { display: "flex", alignItems: "center", gap: 8 },
						children: [
							jsx(Button, {
								variant: "primary",
								size: "sm",
								disabled: busy || !snap.writable,
								onClick: save,
								children: busy ? L.saving : L.save
							}),
							saved ? jsx("span", { children: L.saved }) : null,
							err ? jsx("span", { style: { color: "var(--dsw-alias-state-error-primary, #ec1313)" }, children: err }) : null
						]
					})
				]
			});
		}

		// ---- 单渠道卡片：开关 / 状态 / 凭据 / 白名单 / 操作 ----
		function ChannelCard(props) {
			const { ch, useScope, scope, snap } = props;
			const stored = snap.status === "ready" && snap.value ? snap.value : {};
			// 微信缺省开（与服务端 isChannelEnabled 语义一致）
			const flag = String(stored[ch.enableKey] || "");
			const effectiveOn = flag !== "0";
			const [whitelist, setWhitelist] = react.useState("");
			const [fieldVals, setFieldVals] = react.useState({});
			const [busy, setBusy] = react.useState(false);
			const [saved, setSaved] = react.useState(false);
			const [st, setSt] = react.useState(null);
			const [code, setCode] = react.useState("");
			const [err, setErr] = react.useState("");
			const [info, setInfo] = react.useState("");
			const [sandbox, setSandbox] = react.useState("1");

			react.useEffect(() => {
				if (snap.status !== "ready") return;
				if (!ch.implemented) return; // 外部提供渠道（QQ）不需回填凭据/状态
				// 迁移：微信新白名单为空时，沿用旧 allowlist 的值（SPEC §5）
				const legacy = ch.id === "wechat" ? (snap.value && snap.value.allowlist) || "" : "";
				setWhitelist(String((snap.value && snap.value[ch.whitelistKey]) || legacy || ""));
				const init = {};
				for (const f of ch.fields) init[f.key] = f.secret ? "" : String((snap.value && snap.value[f.key]) || "");
				setFieldVals(init);
				if (ch.sandboxKey) setSandbox(String((snap.value && snap.value[ch.sandboxKey]) || "1"));
			}, [snap.status]);

			const refresh = react.useCallback(async () => {
				if (!ch.implemented || !ch.statusPath) return;
				try {
					const r = await fetch(ch.statusPath, { cache: "no-store" });
					if (r.ok) setSt(await r.json());
					else setSt(null);
				} catch {
					setSt(null);
				}
			}, [ch]);

			react.useEffect(() => {
				refresh();
				if (!ch.implemented) return;
				const timer = setInterval(refresh, 4000);
				return () => clearInterval(timer);
			}, [refresh, ch]);

			const post = async (path, body) => {
				setBusy(true);
				setErr("");
				try {
					const r = await fetch(path, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: body === void 0 ? "{}" : JSON.stringify(body),
					});
					const data = await r.json().catch(() => ({}));
					setSt(data);
					if (!r.ok && data && data.error) setErr(String(data.error));
				} catch (e) {
					setErr(String(e));
				} finally {
					setBusy(false);
				}
			};

			const save = async () => {
				setBusy(true);
				setSaved(false);
				try {
					const wantWl = whitelist.trim();
					const haveWl = String(stored[ch.whitelistKey] || "");
					if (wantWl !== haveWl) await scope.set(ch.whitelistKey, wantWl);
					for (const f of ch.fields) {
						const val = String(fieldVals[f.key] || "").trim();
						if (!f.secret && val === String(stored[f.key] || "")) continue;
						if (f.secret && val === "") continue; // 密文字段留空 = 保持现状
						await scope.set(f.key, val);
					}
					if (ch.sandboxKey) {
						const wantSb = sandbox.trim() || "1";
						const haveSb = String((snap.value && snap.value[ch.sandboxKey]) || "1");
						if (wantSb !== haveSb) await scope.set(ch.sandboxKey, wantSb);
					}
					setSaved(true);
				} finally {
					setBusy(false);
				}
			};

			const toggle = async () => {
				setBusy(true);
				setErr("");
				try {
					await scope.set(ch.enableKey, effectiveOn ? "0" : "1");
					setSaved(true);
				} catch (e) {
					setErr(String(e));
				} finally {
					setBusy(false);
				}
			};

			const stateLabel = () => {
				if (!ch.implemented) return L.eta + (ch.eta || "?") + L.etaEnd;
				if (!st) return L.unavailable;
				if (st.state === "disconnected") return L.wxDisconnected;
				if (st.state === "connecting") return L.stateConnecting;
				if (st.state === "waiting-qr") return L.wxWaitingQr;
				if (st.state === "waiting-scan") return L.wxWaitingScan;
				if (st.state === "need-verifycode") return L.wxNeedVerify;
				if (st.state === "connected") return L.wxConnected;
				if (st.state === "reconnecting") return L.stateReconnecting;
				if (st.state === "failed") return L.stateFailed;
				if (st.state === "expired") return L.wxExpired;
				return st.state;
			};

			const qrImg = ch.implemented && st && st.qrcodeUrl
				? "/openclaw-bridge/qr?text=" + encodeURIComponent(st.qrcodeUrl) + "&size=220"
				: null;
			const hoursLeft = ch.implemented && st && st.expiresAt
				? Math.max(0, Math.round((st.expiresAt - Date.now()) / 3600000))
				: null;

			// v0.8.0：外部提供渠道（QQ 由官方 @tencent-connect/dsh-qqbot 接管）→ 只显示说明卡
			if (!ch.implemented) {
				return jsxs("div", {
					style: { display: "flex", flexDirection: "column", gap: 8, padding: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.12))", borderRadius: 8 },
					children: [
						jsx("h3", { style: { margin: 0 }, children: ch.title }),
						jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: ch.eta || L.eta + L.etaEnd }),
						jsx("span", { style: { fontSize: 12, opacity: 0.65, whiteSpace: "pre-wrap", lineHeight: 1.6 }, children: L.qqOfficialNote })
					]
				});
			}

			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 10, padding: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.12))", borderRadius: 8 },
				children: [
					jsxs("div", {
						style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
						children: [
							jsx("h3", { style: { margin: 0 }, children: ch.title }),
							jsx("span", { children: effectiveOn ? L.enabled : L.disabled }),
							jsx(Button, {
								size: "sm",
								disabled: busy || snap.status !== "ready",
								onClick: toggle,
								children: effectiveOn ? L.disable : L.enable
							}),
							jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: stateLabel() })
						]
					}),
					ch.implemented && st && st.botId ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: st.botId }) : null,
					hoursLeft !== null ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: L.hoursLeft.replace("X", String(hoursLeft)) }) : null,
					qrImg ? jsx("img", { src: qrImg, alt: ch.title + " QR", style: { width: 220, height: 220 } }) : null,
					ch.implemented && st && st.qrcodeUrl ? jsx("a", { href: st.qrcodeUrl, target: "_blank", rel: "noreferrer", children: L.scanLink }) : null,
					ch.implemented && st && st.state === "need-verifycode" ? jsxs("div", {
						style: { display: "flex", gap: 8, alignItems: "center" },
						children: [
							jsx(Input, { value: code, placeholder: L.codePlaceholder, onChange: (e) => setCode(e.target.value) }),
							jsx(Button, { variant: "primary", size: "sm", disabled: busy, onClick: () => post(ch.verifyPath, { code }), children: L.submitCode })
						]
					}) : null,
					ch.implemented ? 				jsxs("div", {
						style: { display: "flex", gap: 8 },
						children: [
							st && (st.state === "disconnected" || st.state === "expired") ? jsx(Button, {
								variant: "primary",
								size: "sm",
								disabled: busy || !effectiveOn,
								onClick: () => post(ch.loginPath),
								children: L.connect
							}) : null,
							st && st.state === "connected" ? jsx(Button, {
								size: "sm",
								disabled: busy,
								onClick: () => post(ch.logoutPath),
								children: L.disconnect
							}) : null,
							ch.validatePath ? jsx(Button, {
								variant: "outline",
								size: "sm",
								disabled: busy || snap.status !== "ready",
								onClick: async () => {
									setErr("");
									setInfo("");
									try {
										const r = await fetch(ch.validatePath, {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: "{}"
										});
										const d = await r.json().catch(() => ({}));
										if (r.ok && d.ok) setInfo(L.testConnOk + (d.detail ? "：" + d.detail : ""));
										else setErr(L.testConn + "失败：" + (d.detail || d.error || "未知"));
									} catch (e) {
										setErr(String(e));
									}
								},
								children: L.testConn
							}) : null
						]
					}) : null,
					ch.fields.map((f) => fieldRow(f.label, f.secret ? L.credentialHint : null, jsx(Input, {
						value: String(fieldVals[f.key] || ""),
						placeholder: f.ph,
						onChange: (e) => setFieldVals((prev) => ({ ...prev, [f.key]: e.target.value }))
					}))),
				fieldRow(L.whitelistLabel, L.whitelistHint, jsx(Input, {
					value: whitelist,
					placeholder: ch.whitelistPh,
					onChange: (e) => setWhitelist(e.target.value)
				})),
				ch.sandboxKey ? fieldRow(L.sandboxLabel, L.sandboxHint, jsx(Button, {
					variant: sandbox !== "0" ? "primary" : "ghost",
					size: "sm",
					onClick: () => setSandbox(sandbox === "0" ? "1" : "0"),
					children: sandbox !== "0" ? L.sandboxOn : L.sandboxOff
				})) : null,
				jsxs("div", {
						style: { display: "flex", alignItems: "center", gap: 8 },
						children: [
							jsx(Button, {
								variant: "primary",
								size: "sm",
								disabled: busy || snap.status !== "ready",
								onClick: save,
								children: busy ? L.saving : L.save
							}),
							saved ? jsx("span", { children: L.saved }) : null
						]
					}),
					info ? jsx("span", { style: { color: "var(--dsw-alias-state-success-primary, #228c3e)" }, children: info }) : null,
				err ? jsx("span", { style: { color: "var(--dsw-alias-state-error-primary, #ec1313)" }, children: err }) : null
				]
			});
		}

		function ClawBotCard(props) {
			const { useScope, scope } = props;
			const snap = useScope((s) => s);
			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 16, padding: 16, maxWidth: 560 },
				children: [
					jsx("h2", { children: L.navSub }),
					jsx(SettingsBlock, { useScope, scope }),
					jsx("h3", { children: L.channelsTitle }),
					CHANNELS.map((ch) => jsx(ChannelCard, { ch, useScope, scope, snap, key: ch.id }))
				]
			});
		}

		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: NS });
			const useScope = bindSnapshotSelector(scope);
			const injected = () => ({ useScope, scope });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "openclaw-bridge",
				order: 50,
				label: () => L.nav,
				inject: injected
			}, ClawBotCard), "dsh-openclaw-bridge: settings section entry");
		}

		const inject = ["slots", "settingsScope"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
