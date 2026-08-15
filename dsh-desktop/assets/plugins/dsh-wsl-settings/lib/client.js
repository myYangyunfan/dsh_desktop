window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-wsl-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		const { Button } = require("@deepseek-ai/dsh-client-ui-primitives");

		const L = {
			nav: "WSL 后端",
			navSub: "选择 dsh 运行位置：本机内置（local）或 WSL 托管（壳在 WSL 内自动安装/更新 dsh）",
			modeLabel: "后端模式",
			modeLocal: "local —— 本机内置 dsh（默认）",
			modeWsl: "wsl —— 在 WSL 内安装并更新 dsh",
			distroLabel: "WSL 发行版",
			distroPlaceholder: "留空自动检测（wsl -l -q 第一个）",
			distroHint: "例：Ubuntu / Ubuntu-24.04",
			dirLabel: "WSL 安装目录",
			dirPlaceholder: "留空默认 ~/.dsh-desktop",
			dirHint: "WSL 内绝对路径（/ 或 ~ 开头，不能含空格）；默认不占用 ~/.dsh，避免与你自己的 dsh 互相改写 profile",
			currentTitle: "当前生效",
			currentMode: "后端模式",
			currentDistro: "发行版",
			currentDir: "安装目录",
			currentNode: "node",
			currentNpm: "npm",
			currentAgent: "agent",
			agentMissing: "未安装（首次切换后自动安装，约 2–3 分钟）",
			probeError: "WSL 检测失败",
			save: "保存",
			saving: "保存中…",
			saved: "已保存，重启应用后生效",
			recheck: "重新检测",
			checking: "检测中…",
			loading: "加载中…",
			unavailable: "仅在 DSH Desktop 客户端中可用",
			restartHint: "配置改动在重启应用后生效；首次切换到 WSL 托管会自动安装 dsh（npm，约 2–3 分钟）。",
			saveError: "保存失败",
			recheckError: "检测失败"
		};

		function bridge() {
			const b = window.dshDesktop;
			if (!b || !b.wsl || typeof b.wsl.getConfig !== "function") return null;
			return b.wsl;
		}

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

		function kvRow(label, value) {
			return jsxs("div", {
				style: { display: "flex", gap: 8, fontSize: 12.5, lineHeight: "18px" },
				children: [
					jsx("span", { style: { opacity: 0.6, flex: "none", minWidth: 64 }, children: label }),
					jsx("span", { style: { wordBreak: "break-all" }, children: String(value || "—") })
				]
			});
		}

		function WslBackendCard() {
			const b = bridge();
			const [config, setConfig] = react.useState(null);
			const [backend, setBackend] = react.useState("local");
			const [distro, setDistro] = react.useState("");
			const [installDir, setInstallDir] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [saved, setSaved] = react.useState(false);
			const [error, setError] = react.useState("");

			react.useEffect(() => {
				if (!b) return;
				let alive = true;
				b.getConfig().then((cfg) => {
					if (!alive || !cfg) return;
					setConfig(cfg);
					setBackend(cfg.backend === "wsl" ? "wsl" : "local");
					setDistro(cfg.wslDistro || "");
					setInstallDir(cfg.wslInstallDir || "");
				}).catch(() => {});
				return () => { alive = false; };
			}, []);

			if (!b) return jsx("div", { children: L.unavailable });
			if (!config) return jsx("div", { children: L.loading });

			const st = config.status || {};
			const dirty = backend !== config.backend || distro !== config.wslDistro || installDir !== config.wslInstallDir;

			const save = async () => {
				setBusy(true);
				setSaved(false);
				setError("");
				try {
					const r = await b.saveConfig({ backend, wslDistro: distro.trim(), wslInstallDir: installDir.trim() });
					if (r && r.ok) {
						setSaved(true);
						const fresh = await b.getConfig().catch(() => null);
						if (fresh) setConfig(fresh);
					} else {
						setError((r && r.error) || L.saveError);
					}
				} catch (e) {
					setError(String((e && e.message) || e));
				} finally {
					setBusy(false);
				}
			};

			const recheck = async () => {
				setBusy(true);
				setError("");
				try {
					const fresh = await b.recheck();
					if (fresh) setConfig(fresh);
					else setError(L.recheckError);
				} catch (e) {
					setError(String((e && e.message) || e));
				} finally {
					setBusy(false);
				}
			};

			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 16, padding: 16, maxWidth: 560 },
				children: [
					jsx("h2", { children: L.navSub }),

					// 当前生效状态
					jsxs("div", {
						style: {
							display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px",
							border: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.1))",
							borderRadius: 10, background: "var(--dsw-alias-bg-layer-3, rgba(255,255,255,.03))"
						},
						children: [
							jsx("span", { style: { fontSize: 11, opacity: 0.6 }, children: L.currentTitle }),
							kvRow(L.currentMode, config.backend === "wsl" ? L.modeWsl : L.modeLocal),
							st.configured ? kvRow(L.currentDistro, st.distro) : null,
							st.configured ? kvRow(L.currentDir, st.installDir) : null,
							st.configured ? kvRow(L.currentNode, st.nodeVersion) : null,
							st.configured ? kvRow(L.currentNpm, st.npmVersion) : null,
							config.backend === "wsl" ? kvRow(L.currentAgent, st.agentVersion || L.agentMissing) : null,
							st.lastError ? jsx("span", {
								style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)" },
								children: L.probeError + "：" + st.lastError
							}) : null
						]
					}),

					// 配置表单
					fieldRow(L.modeLabel, null, jsx("select", {
						value: backend,
						style: { padding: "4px 8px" },
						onChange: (e) => { setBackend(e.target.value); setSaved(false); },
						children: [
							jsx("option", { value: "local", children: L.modeLocal }),
							jsx("option", { value: "wsl", children: L.modeWsl })
						]
					})),
					backend === "wsl" ? fieldRow(L.distroLabel, L.distroHint, jsx("input", {
						value: distro,
						placeholder: L.distroPlaceholder,
						style: { width: "100%", padding: "6px 8px", boxSizing: "border-box" },
						onChange: (e) => { setDistro(e.target.value); setSaved(false); }
					})) : null,
					backend === "wsl" ? fieldRow(L.dirLabel, L.dirHint, jsx("input", {
						value: installDir,
						placeholder: L.dirPlaceholder,
						style: { width: "100%", padding: "6px 8px", boxSizing: "border-box" },
						onChange: (e) => { setInstallDir(e.target.value); setSaved(false); }
					})) : null,

					jsxs("div", {
						style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
						children: [
							jsx(Button, {
								variant: "outline",
								size: "sm",
								disabled: busy,
								onClick: recheck,
								children: busy ? L.checking : L.recheck
							}),
							jsx(Button, {
								variant: "primary",
								size: "sm",
								disabled: busy,
								onClick: save,
								children: busy ? L.saving : L.save
							}),
							saved ? jsx("span", { children: L.saved }) : null,
							dirty && !saved ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: "有未保存的改动" }) : null
						]
					}),
					error ? jsx("div", {
						style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)" },
						children: error
					}) : null,
					jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: L.restartHint })
				]
			});
		}

		function apply(ctx) {
			const injected = () => ({});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-wsl",
				order: 70,
				label: () => L.nav,
				inject: injected
			}, WslBackendCard), "dsh-wsl-settings: settings section entry");
		}

		const inject = ["slots"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
