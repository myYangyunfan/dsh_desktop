window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-compaction-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		const { Button } = require("@deepseek-ai/dsh-client-ui-primitives");

		const L = {
			nav: "上下文管理",
			navSub: "自动压缩对话上下文，避免长会话超出模型上下文窗口。保存后写入所有 agent 预设，新会话生效。",
			autoLabel: "自动压缩",
			autoHint: "上下文占用达到阈值时自动触发压缩（compaction-basic 的 auto 开关）",
			ratioLabel: "触发阈值",
			ratioHint: "上下文占用比例，达到该值自动压缩（0.1 – 1.0，默认 0.8 = 80%）",
			maxTokensLabel: "压缩后保留",
			maxTokensHint: "压缩后保留的 token 数（默认 8192）",
			save: "保存",
			saving: "保存中…",
			saved: "已保存，新会话生效；完全生效请重启应用",
			saveError: "保存失败",
			loading: "加载中…",
			unavailable: "仅在 DSH Desktop 客户端中可用",
			invalid: "请输入有效数值（阈值 0.1–1.0，保留量 1024–1048576）"
		};

		function bridge() {
			const b = window.dshDesktop;
			if (!b || !b.compaction || typeof b.compaction.getConfig !== "function") return null;
			return b.compaction;
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

		function CompactionSettingsCard() {
			const b = bridge();
			const [auto, setAuto] = react.useState(true);
			const [ratio, setRatio] = react.useState("0.8");
			const [maxTokens, setMaxTokens] = react.useState("8192");
			const [busy, setBusy] = react.useState(false);
			const [saved, setSaved] = react.useState(false);
			const [error, setError] = react.useState("");
			const [dirty, setDirty] = react.useState(false);

			react.useEffect(() => {
				if (!b) return;
				let cancelled = false;
				b.getConfig()
					.then((c) => {
						if (!c || cancelled) return;
						setAuto(c.auto !== false);
						setRatio(String(c.thresholdRatio ?? 0.8));
						setMaxTokens(String(c.maxTokens ?? 8192));
					})
					.catch((e) => { if (!cancelled) setError(String((e && e.message) || e)); });
				return () => { cancelled = true; };
			}, []);

			if (!b) {
				return jsx("div", { style: { fontSize: 12.5, opacity: 0.7 }, children: L.unavailable });
			}

			const save = async () => {
				const r = Number(ratio);
				const m = Number(maxTokens);
				if (!Number.isFinite(r) || r <= 0 || r > 1 || !Number.isInteger(m) || m < 1024 || m > 1048576) {
					setError(L.invalid);
					return;
				}
				setBusy(true);
				setError("");
				setSaved(false);
				try {
					const res = await b.saveConfig({ auto, thresholdRatio: r, maxTokens: m });
					if (!res || res.ok !== true) {
						setError((res && res.error) || L.saveError);
						return;
					}
					setSaved(true);
					setDirty(false);
				} catch (e) {
					setError(String((e && e.message) || e));
				} finally {
					setBusy(false);
				}
			};

			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 10 },
				children: [
					jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: L.navSub }),
					fieldRow(L.autoLabel, L.autoHint, jsx("input", {
						type: "checkbox",
						checked: auto,
						onChange: (e) => { setAuto(e.target.checked); setDirty(true); setSaved(false); }
					})),
					fieldRow(L.ratioLabel, L.ratioHint, jsx("input", {
						type: "number",
						min: 0.1,
						max: 1,
						step: 0.05,
						value: ratio,
						onChange: (e) => { setRatio(e.target.value); setDirty(true); setSaved(false); }
					})),
					fieldRow(L.maxTokensLabel, L.maxTokensHint, jsx("input", {
						type: "number",
						min: 1024,
						max: 1048576,
						step: 1024,
						value: maxTokens,
						onChange: (e) => { setMaxTokens(e.target.value); setDirty(true); setSaved(false); }
					})),
					jsxs("div", {
						style: { display: "flex", alignItems: "center", gap: 10 },
						children: [
							jsx(Button, {
								variant: "primary",
								size: "sm",
								disabled: busy || !dirty,
								onClick: save,
								children: busy ? L.saving : L.save
							}),
							saved ? jsx("span", { style: { fontSize: 12, opacity: 0.75 }, children: L.saved }) : null,
							dirty && !saved ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: "有未保存的改动" }) : null
						]
					}),
					error ? jsx("div", {
						style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)" },
						children: error
					}) : null
				]
			});
		}

		function apply(ctx) {
			const injected = () => ({});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-compaction",
				order: 66,
				label: () => L.nav,
				inject: injected
			}, CompactionSettingsCard), "dsh-compaction-settings: settings section entry");
		}

		const inject = ["slots"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
