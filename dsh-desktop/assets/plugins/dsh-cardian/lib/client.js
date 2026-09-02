window.__ModuleLoader__.load({
	id: "dsh-cardian",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/controller.ts
		function isErrorPayload(v) {
			if (typeof v !== "object" || v === null) return false;
			const o = v;
			return o.ok === false && typeof o.error === "object" && o.error !== null;
		}
		function isOkEnvelope(v) {
			if (typeof v !== "object" || v === null) return false;
			const o = v;
			return o.ok === true && "value" in o;
		}
		function looseCodec() {
			return {
				mode: "strict",
				typeSymbol: "dsh-cardian/types#Json",
				schema: { parse: (v) => v }
			};
		}
		const BRIDGE_METHODS = [
			"describe",
			"sectionList",
			"sectionGet",
			"sectionUpsert",
			"sectionRemove",
			"ingestProject",
			"ingestStatus",
			"listModels",
			"pauseIngest",
			"resumeIngest",
			"cancelIngest",
			"rescanDiff",
			"status",
			"tagCloud",
			"backlinks",
			"related",
			"graph",
			"doctor",
			"schema",
			"search",
			"recall",
			"promote",
			"due",
			"exportJson",
			"exportSkill"
		];
		const ZERO_WIRE_METHODS = [
			"describe",
			"status",
			"doctor",
			"schema"
		];
		function remoteFaceDescriptor() {
			return {
				package: "dsh-cardian",
				descriptors: BRIDGE_METHODS.map((method) => ({
					id: `dsh-cardian#cardianRemote/${method}`,
					service: "cardianRemote",
					namespace: "cardian",
					method,
					invocation: { kind: "direct" },
					parameters: ZERO_WIRE_METHODS.includes(method) ? [] : [{
						name: "params",
						wire: "params",
						source: "json",
						codec: looseCodec()
					}],
					result: looseCodec()
				}))
			};
		}
		const FACE_RETRY = {
			tries: 10,
			delay: 50
		};
		var KnowledgeController = class {
			ctx;
			listeners = /* @__PURE__ */ new Set();
			mountPromise;
			faceResolvedOnce = false;
			open = false;
			constructor(ctx) {
				this.ctx = ctx;
				this.mountPromise = ctx.remote.$mount(remoteFaceDescriptor()).then((dispose) => {
					if (typeof this.ctx.effect === "function") this.ctx.effect(() => dispose, "dsh-cardian: remote face");
					return true;
				}, (err) => {
					console.error("[cardian] remote face 挂载失败:", err);
					return false;
				});
			}
			async face() {
				if (!await this.mountPromise) throw new Error("cardian 远端网关未就绪");
				const cands = [
					["remote.cardian", () => this.ctx?.remote?.["cardian"]],
					["remote.cardianRemote", () => this.ctx?.remote?.["cardianRemote"]],
					["get.cardianRemote", () => this.ctx.get ? this.ctx.get("cardianRemote") : void 0],
					["get.remote.cardian", () => this.ctx.get ? this.ctx.get("remote.cardian") : void 0],
					["get.remote.cardianRemote", () => this.ctx.get ? this.ctx.get("remote.cardianRemote") : void 0]
				];
				const remoteRoot = this.ctx?.remote;
				let lastDiag = "";
				for (let i = 0; i < FACE_RETRY.tries; i++) {
					for (const [name, getter] of cands) try {
						const face = getter();
						if (face && (typeof face === "object" || typeof face === "function")) {
							if (!this.faceResolvedOnce) {
								console.log("[cardian] 远端网关解析成功 via " + name);
								this.faceResolvedOnce = true;
							}
							return face;
						}
						if (name === "remote.cardian" && face) lastDiag = "已返回对象但形状不符: keys=" + Object.keys(face).join(",");
					} catch {}
					lastDiag = "remoteRoot=" + (remoteRoot ? "keys=" + Object.keys(remoteRoot).join(",") : String(remoteRoot));
					await new Promise((r) => setTimeout(r, FACE_RETRY.delay));
				}
				throw new Error("[cardian] 远端网关不可达。候选路径=" + cands.map((c2) => c2[0]).join("/") + ";最后诊断=" + lastDiag);
			}
			async callHost(method, params) {
				const face = await this.face();
				let result;
				try {
					result = params === void 0 ? await face[method]() : await face[method](params);
				} catch (err) {
					throw new Error(err instanceof Error ? err.message : String(err));
				}
				if (isErrorPayload(result)) {
					const e = new Error(result.error.message ?? "cardian 调用失败");
					e.code = result.error.code;
					e.suggestion = result.error.suggestion;
					throw e;
				}
				if (isOkEnvelope(result)) return result.value;
				return result;
			}
			subscribe(fn) {
				this.listeners.add(fn);
				return () => this.listeners.delete(fn);
			}
			emit() {
				for (const fn of this.listeners) fn();
			}
			describe() {
				return this.callHost("describe");
			}
			sectionList(key, filters = {}) {
				return this.callHost("sectionList", {
					key,
					...filters
				});
			}
			sectionGet(key, ref, group) {
				return this.callHost("sectionGet", {
					key,
					ref,
					group
				});
			}
			sectionUpsert(key, args) {
				return this.callHost("sectionUpsert", {
					key,
					args
				});
			}
			sectionRemove(key, ref, group) {
				return this.callHost("sectionRemove", {
					key,
					ref,
					group
				});
			}
			async getStatus() {
				return this.callHost("status");
			}
			async tagCloud() {
				return this.callHost("tagCloud", {});
			}
			async backlinks(ref) {
				return this.callHost("backlinks", { ref });
			}
			async related(ref) {
				return this.callHost("related", { ref });
			}
			async graph(repo) {
				if (!repo) return null;
				return this.callHost("graph", { repo });
			}
			async getDoctor() {
				return this.callHost("doctor");
			}
			async getSchema() {
				return this.callHost("schema");
			}
			async crossSearch(query) {
				return this.callHost("search", { query });
			}
			ingestProject(options) {
				return this.callHost("ingestProject", options);
			}
			ingestStatus() {
				return this.callHost("ingestStatus", {});
			}
			listModels() {
				return this.callHost("listModels", {});
			}
			/** 暂停扫盘：中断在途模型调用，已完成卡片保留。 */
			pauseIngest(jobId) {
				return this.callHost("pauseIngest", { jobId });
			}
			/** 继续扫盘：只处理剩余未回填项（幂等）。 */
			resumeIngest(jobId) {
				return this.callHost("resumeIngest", { jobId });
			}
			/** 停止扫盘：不再处理剩余项（已落盘卡片保留）。 */
			cancelIngest(jobId) {
				return this.callHost("cancelIngest", { jobId });
			}
			/** 仅扫描变更：added/changed 走 AI 回填，removed 剪孤儿卡。 */
			rescanDiff(options) {
				return this.callHost("rescanDiff", options);
			}
			promote(ref, target = "shared") {
				return this.callHost("promote", {
					ref,
					target
				});
			}
			due(deck) {
				return this.callHost("due", deck ? { deck } : {});
			}
			exportVault() {
				return this.callHost("exportJson", {});
			}
			exportSkill(options) {
				return this.callHost("exportSkill", options);
			}
			listWorkspaces() {
				try {
					const snap = this.ctx.get("workspaces")?.list?.getSnapshot?.();
					const items = Array.isArray(snap?.items) ? snap.items : [];
					const out = [];
					for (const it of items) {
						let view;
						try {
							view = typeof it?.getSnapshot === "function" ? it.getSnapshot()?.view : it;
						} catch {
							view = it;
						}
						if (typeof view !== "object" || view === null) continue;
						const v = view;
						if (typeof v.path !== "string") continue;
						out.push({
							id: String(v.workspaceId ?? v.id ?? ""),
							path: v.path,
							title: typeof v.title === "string" ? v.title : void 0
						});
					}
					return out;
				} catch (err) {
					console.warn("[cardian] 读取工作区列表失败:", err);
					return [];
				}
			}
			triggerProps() {
				return { controller: this };
			}
			panelProps() {
				return { controller: this };
			}
		};
		//#endregion
		//#region src/client/styles.ts
		const CARDian_CSS = `
/* ============ 基础：触发钮 ============ */
.cardian-kt-trigger {
  box-sizing: border-box; cursor: pointer;
  width: calc(100% + 8px); height: 34px;
  color: var(--dsw-alias-label-primary); background: transparent; border: none; border-radius: 12px;
  flex: none; align-items: center; gap: 8px; margin: 4px -4px; padding: 6px 2px 6px 10px;
  font-family: inherit; font-size: 14px; line-height: 22px; display: flex; overflow: hidden;
  transition: background .12s, color .12s; outline: none;
}
.cardian-kt-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-trigger[data-on='1'] {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%, transparent);
}
.cardian-kt-trigger[data-rail='1'] {
  border-radius: 50%; justify-content: center; gap: 0;
  width: 36px; height: 36px; margin: 8px 0 10px; padding: 0;
}
.cardian-kt-trigger-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ============ 面板骨架 ============ */
.cardian-kt-panel {
  position: absolute; top: 0; bottom: 0; left: 0; right: 0;
  z-index: 21; pointer-events: auto;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px;
}
.kt-icon { display: block; flex: none; }
.cardian-kt-flex { flex: 1; }

/* ---- 顶栏 ---- */
/* padding-right 比 padding-left 大 36px：面板右缘与宿主右侧栏/窗口控件切换钮
   重合，右上角操作钮组（新建/刷新/关闭）整体左移，避免被宿主浮动按钮遮挡。 */
.cardian-kt-header {
  display: flex; align-items: center; gap: 10px; flex: none;
  height: 54px; padding: 0 40px 0 16px; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.cardian-kt-logo {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 9px; flex: none;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
}
.cardian-kt-title { font-weight: 650; font-size: 15px; white-space: nowrap; }
.cardian-kt-vault {
  font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 99px; padding: 2px 10px;
}

/* ---- 错误横幅 ---- */
.cardian-kt-banner {
  flex: none; margin: 10px 16px 0; padding: 9px 12px; display: flex; gap: 8px;
  align-items: flex-start; border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent);
  color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5;
}
.cardian-kt-banner-text { flex: 1; word-break: break-word; }
.cardian-kt-banner-close {
  flex: none; border: none; background: transparent; color: inherit;
  cursor: pointer; padding: 2px; display: flex;
}

/* ============ 双栏布局 ============ */
.cardian-kt-layout { flex: 1; display: flex; min-height: 0; }

/* ---- 左栏 ---- */
.cardian-kt-rail {
  width: 280px; flex: none; display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 4%, var(--dsw-alias-bg-base));
}
.cardian-kt-searchwrap {
  flex: none; display: flex; align-items: center; gap: 7px; margin: 12px 12px 8px;
  padding: 0 10px; height: 32px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-tertiary); transition: border-color .12s;
}
.cardian-kt-searchwrap:focus-within { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-search {
  flex: 1; min-width: 0; border: none; background: transparent; color: inherit;
  font-size: 12.5px; outline: none; font-family: inherit; padding: 0;
}
.cardian-kt-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.cardian-kt-search-clear {
  border: none; background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; display: flex; padding: 2px;
}
.cardian-kt-search-clear:hover { color: var(--dsw-alias-label-primary); }

.cardian-kt-nav { flex: none; display: flex; flex-direction: column; gap: 2px; padding: 0 8px; }
.cardian-kt-nav-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 9px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
  font-family: inherit; font-size: 13px; text-align: left;
  transition: background .12s, color .12s;
}
.cardian-kt-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-nav-item--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); font-weight: 600;
}
.cardian-kt-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cardian-kt-nav-count {
  flex: none; font-size: 10.5px; font-weight: 500; min-width: 20px; text-align: center;
  color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover);
  border-radius: 99px; padding: 1px 7px;
}
.cardian-kt-nav-item--active .cardian-kt-nav-count {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 18%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}

.cardian-kt-rail-tree {
  flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 8px;
}
.cardian-kt-hint { padding: 14px 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); text-align: center; line-height: 1.6; }

.cardian-kt-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 2px 8px; }
.cardian-kt-chip-f {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 11px; border-radius: 99px;
  padding: 2px 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: inherit; transition: color .12s, border-color .12s, background .12s;
}
.cardian-kt-chip-f:hover { color: var(--dsw-alias-label-primary); }
.cardian-kt-chip-f--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.cardian-kt-chip-n { opacity: 0.65; margin-left: 3px; font-size: 10px; }

/* ---- 知识树 ---- */
.cardian-kt-tree-node, .cardian-kt-tree-item {
  display: flex; align-items: center; gap: 6px; width: 100%;
  border: none; background: transparent; color: inherit; cursor: pointer;
  border-radius: 8px; min-height: 29px; padding: 0 8px 0 0; text-align: left;
  box-sizing: border-box; font-family: inherit; font-size: 12.5px; overflow: hidden;
}
.cardian-kt-tree-node:hover, .cardian-kt-tree-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-tree-node { color: var(--dsw-alias-label-secondary); }
.cardian-kt-tree-node .cardian-kt-tree-title { font-weight: 600; color: var(--dsw-alias-label-primary); }
.cardian-kt-chev {
  display: inline-flex; flex: none; width: 14px; justify-content: center;
  color: var(--dsw-alias-label-tertiary); transition: transform .14s ease;
}
.cardian-kt-chev--open { transform: rotate(90deg); }
.cardian-kt-tree-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cardian-kt-tree-count {
  flex: none; font-size: 10px; color: var(--dsw-alias-label-tertiary); margin-right: 4px;
}
.cardian-kt-tree-meta { flex: none; font-size: 10px; opacity: 0.55; margin-right: 4px; }
.cardian-kt-tree-item { color: var(--dsw-alias-label-secondary); }
.cardian-kt-tree-item .kt-icon { color: var(--dsw-alias-label-tertiary); }
.cardian-kt-tree-item--active {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
/* 层级树（总览 → 模块 → 文件）：分支行 = 展开钮 + 节点 + 可选「打开此卡」小钮。 */
.cardian-kt-tree-branch { display: flex; align-items: center; gap: 2px; }
.cardian-kt-tree-branch > .cardian-kt-tree-node { flex: 1; min-width: 0; }
.cardian-kt-tree-branch--card > .cardian-kt-tree-node .cardian-kt-tree-title { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-tree-openbtn {
  flex: none; display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-right: 4px; padding: 0; border-radius: 6px;
  border: none; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-tertiary); font-family: inherit;
  opacity: 0; transition: opacity .12s, background .12s, color .12s;
}
.cardian-kt-tree-branch:hover .cardian-kt-tree-openbtn { opacity: 1; }
.cardian-kt-tree-openbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-tree-badge {
  flex: none; font-size: 9.5px; line-height: 1; padding: 3px 5px; border-radius: 5px; margin-right: 4px;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
}
.cardian-kt-tree-badge:not(:first-of-type) { opacity: 0.85; }

/* ---- 左栏底部：深度洞察 ---- */
.cardian-kt-rail-foot {
  flex: none; border-top: 1px solid var(--dsw-alias-border-l1);
  padding: 8px; display: flex; flex-direction: column; gap: 1px;
}
.cardian-kt-rail-foot-label {
  font-size: 10.5px; color: var(--dsw-alias-label-tertiary); margin: 2px 10px 5px;
  text-transform: uppercase; letter-spacing: .06em;
}
.cardian-kt-nav-item--flat { padding: 6px 10px; font-size: 12.5px; }

/* ---- 右栏 ---- */
.cardian-kt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.cardian-kt-scroll { flex: 1; overflow-y: auto; }
.cardian-kt-page { max-width: 840px; margin: 0 auto; padding: 20px 32px 56px; box-sizing: border-box; }
.cardian-kt-h3 {
  font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-tertiary);
  letter-spacing: .04em; margin: 26px 0 10px; text-transform: uppercase;
}

/* ============ 总览 ============ */
.cardian-kt-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cardian-kt-stat {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  padding: 16px; border-radius: 14px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent;
  color: inherit; font-family: inherit; transition: border-color .12s, background .12s, transform .12s;
}
.cardian-kt-stat:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-stat--active {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
}
.cardian-kt-stat--static { cursor: default; }
.cardian-kt-stat-icon {
  display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;
  border-radius: 10px; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
}
.cardian-kt-stat-num { font-size: 24px; font-weight: 700; line-height: 1; letter-spacing: -.01em; }
.cardian-kt-stat-label { font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ---- 仓库网格 ---- */
.cardian-kt-repo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.cardian-kt-repo-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit;
  font-family: inherit; transition: border-color .12s, background .12s, transform .12s;
}
.cardian-kt-repo-card:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: var(--dsw-alias-interactive-bg-hover);
}
.cardian-kt-repo-icon { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); display: flex; }
.cardian-kt-repo-name {
  font-weight: 600; font-size: 13px; margin-top: 4px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-repo-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary); }

/* ---- 最近更新条目卡 ---- */
.cardian-kt-entry-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.cardian-kt-entry-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  padding: 14px 16px; border-radius: 12px; cursor: pointer; text-align: left;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit;
  font-family: inherit; transition: border-color .12s, background .12s;
}
.cardian-kt-entry-card:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-entry-card-title {
  font-size: 13px; font-weight: 600; line-height: 1.45; max-width: 100%;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cardian-kt-entry-card-meta { font-size: 11px; color: var(--dsw-alias-label-tertiary); }

/* ---- 空态 ---- */
.cardian-kt-empty {
  margin-top: 48px; padding: 36px 20px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 16px;
}
.cardian-kt-empty-icon { display: inline-flex; color: var(--dsw-alias-label-tertiary); margin-bottom: 10px; }
.cardian-kt-empty-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; }
.cardian-kt-empty-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 1.7; margin: 0 auto; max-width: 420px; }

/* ============ 详情 ============ */
.cardian-kt-crumb { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; min-width: 0; }
.cardian-kt-back {
  display: inline-flex; align-items: center; gap: 5px; flex: none; border: none;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
  font-size: 12px; font-family: inherit; padding: 5px 9px; border-radius: 8px;
}
.cardian-kt-back:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-crumb-sep { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.cardian-kt-crumb-text {
  font-size: 12.5px; color: var(--dsw-alias-label-tertiary); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-article { animation: kt-fade .16s ease; }
@keyframes kt-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.cardian-kt-article-title { font-size: 22px; font-weight: 700; line-height: 1.35; margin: 0 0 10px; letter-spacing: -.01em; }
.cardian-kt-article-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.cardian-kt-chip {
  font-size: 11px; background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary); border-radius: 99px; padding: 3px 10px;
  max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-chip--tag { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.cardian-kt-lead {
  font-size: 13.5px; color: var(--dsw-alias-label-secondary); line-height: 1.7; margin: 0 0 14px;
  padding-left: 12px; border-left: 3px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
}
.cardian-kt-matches { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); margin-bottom: 8px; }

/* ---- 关联知识 ---- */
.cardian-kt-rel { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 14px; }
.cardian-kt-rel-label {
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: .05em; margin: 0 0 8px;
}
.cardian-kt-rel-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-rel-chip {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font-size: 12px; font-family: inherit;
  border-radius: 8px; padding: 4px 10px; max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: all .12s;
}
.cardian-kt-rel-chip:hover {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 50%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 8%, transparent);
}

/* ============ Markdown 正文 ============ */
.kt-md { font-size: 13.5px; line-height: 1.75; color: var(--dsw-alias-label-primary); }
.kt-md-p { margin: 0 0 12px; white-space: pre-wrap; overflow-wrap: break-word; }
.kt-md-h { font-weight: 680; line-height: 1.4; margin: 22px 0 10px; }
.kt-md-h1, .kt-md-h2 { font-size: 17px; padding-bottom: 6px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.kt-md-h3 { font-size: 15px; }
.kt-md-h4 { font-size: 13.5px; }
.kt-md-h5 { font-size: 13px; }
.kt-md-list { margin: 0 0 12px; padding-left: 22px; display: flex; flex-direction: column; gap: 4px; }
.kt-md-list li::marker { color: var(--dsw-alias-label-tertiary); }
.kt-md-task { color: var(--dsw-alias-label-tertiary); }
.kt-md-task--done { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.kt-md-quote {
  margin: 0 0 14px; padding: 8px 14px; border-radius: 0 10px 10px 0;
  border-left: 3px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
  color: var(--dsw-alias-label-secondary);
}
.kt-md-quote span { display: block; }
.cardian-kt-pre, .kt-md-pre {
  white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  background: var(--dsw-alias-markdown-code-block); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; padding: 12px 14px; margin: 0 0 14px; overflow-x: auto;
}
.kt-md-code {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.92em;
  background: var(--dsw-alias-markdown-code-block); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 5px; padding: 1px 5px;
}
.kt-md-wikilink {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 9%, transparent);
  border-radius: 5px; padding: 1px 5px;
}
.kt-md-wikilink--link {
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 40%, transparent);
  transition: background .12s, border-color .12s;
}
.kt-md-wikilink--link:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 18%, transparent);
  border-bottom-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.kt-md-wikilink--link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  outline-offset: 1px;
}
.kt-md-mark, .cardian-kt-mark {
  background: color-mix(in srgb, var(--dsw-static-yellowish-500, #ffd24f) 42%, transparent);
  color: inherit; border-radius: 3px; padding: 0 1px;
}
.kt-md a { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); text-decoration: none; }
.kt-md a:hover { text-decoration: underline; }
.kt-md-hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 18px 0; }
.kt-md-tablewrap { overflow-x: auto; margin: 0 0 14px; }
.kt-md-table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.kt-md-table th, .kt-md-table td {
  border: 1px solid var(--dsw-alias-border-l1); padding: 6px 10px; text-align: left; vertical-align: top;
}
.kt-md-table th { background: var(--dsw-alias-interactive-bg-hover); font-weight: 600; }

/* ============ 表单 ============ */
.cardian-kt-form {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; align-items: start;
  animation: kt-fade .16s ease;
}
.cardian-kt-form-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.cardian-kt-form-field--wide { grid-column: 1 / -1; }
.cardian-kt-form-label { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.cardian-kt-form-required { color: var(--dsw-alias-state-error-secondary, var(--dsw-alias-state-error-primary)); font-style: normal; }
.cardian-kt-form-input, .cardian-kt-form-textarea {
  width: 100%; box-sizing: border-box; padding: 8px 11px; border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-specific-input-major);
  color: inherit; font-size: 13px; outline: none; font-family: inherit;
  transition: border-color .12s;
}
.cardian-kt-form-input:focus, .cardian-kt-form-textarea:focus {
  border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
}
.cardian-kt-form-textarea { resize: vertical; line-height: 1.6; min-height: 64px; }
.cardian-kt-form-textarea[name='content'] { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
.cardian-kt-form-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

/* ============ 按钮 ============ */
.cardian-kt-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: inherit; cursor: pointer; font-size: 12.5px; font-family: inherit;
  padding: 6px 14px; border-radius: 9px; transition: background .12s, border-color .12s;
}
.cardian-kt-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-btn--primary {
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  border-color: transparent; color: var(--dsw-static-neutral-00);
}
.cardian-kt-btn--primary:hover { filter: brightness(1.06); background: var(--dsw-alias-button-info-hover); }
.cardian-kt-btn--danger {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-btn--danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent); }
.cardian-kt-btn:disabled { opacity: 0.5; cursor: default; }
.cardian-kt-iconbtn {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer; transition: background .12s, color .12s;
}
.cardian-kt-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cardian-kt-iconbtn:disabled { opacity: 0.4; cursor: default; }
.cardian-kt-iconbtn--danger:hover {
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
}
.cardian-kt-btn:focus-visible, .cardian-kt-iconbtn:focus-visible, .cardian-kt-nav-item:focus-visible,
.cardian-kt-tree-item:focus-visible, .cardian-kt-tree-node:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  outline-offset: 1px;
}

/* ---- 删除确认条 ---- */
.cardian-kt-confirm {
  flex: none; border-top: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);
  padding: 10px 16px; display: flex; align-items: center; gap: 10px;
}
.cardian-kt-confirm-text { flex: 1; font-size: 12px; margin: 0; word-break: break-word; color: var(--dsw-alias-state-error-primary); }
.cardian-kt-confirm-actions { flex: none; display: flex; gap: 8px; }

/* ---- 崩溃横幅 ---- */
.cardian-kt-crash {
  position: absolute; inset: 0; z-index: 25; pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: 24px; text-align: center;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px;
}
.cardian-kt-crash-title { font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
.cardian-kt-crash-text {
  max-width: 560px; max-height: 40vh; overflow: auto; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.6; margin: 0; padding: 10px 12px; border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  color: var(--dsw-alias-state-error-primary); text-align: left;
}
.cardian-kt-crash-actions { display: flex; gap: 8px; }

/* ============ 工作区沉淀 dock ============ */
.cardian-kt-project-dock {
  margin-top: 26px; padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.cardian-kt-project-dock-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cardian-kt-project-dock-title {
  display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 650;
  color: var(--dsw-alias-label-primary);
}
.cardian-kt-project-dock-hint {
  font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-tertiary); margin: 0 0 4px;
}
.cardian-kt-ws-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
  transition: background .12s;
}
.cardian-kt-ws-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cardian-kt-ws-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cardian-kt-ws-title {
  display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600;
  color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-ws-path {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-ws-action {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); cursor: pointer;
  font-size: 12px; font-family: inherit; padding: 5px 12px; border-radius: 8px; flex-shrink: 0;
  transition: background .12s, border-color .12s;
}
.cardian-kt-ws-action:hover {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, transparent);
}
.cardian-kt-ws-action:disabled { opacity: 0.5; cursor: default; }
.cardian-kt-ws-action--danger {
  color: var(--dsw-alias-state-error-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2));
}
.cardian-kt-ws-action--danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
.cardian-kt-ws-state {
  flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 52px; text-align: right;
}
.cardian-kt-ws-progress { flex-shrink: 0; width: 170px; display: flex; flex-direction: column; gap: 4px; }
.cardian-kt-ws-progress-meta {
  font-size: 10px; color: var(--dsw-alias-label-tertiary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-bar {
  height: 6px; border-radius: 99px; background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  overflow: hidden;
}
.cardian-kt-bar-fill {
  height: 100%; border-radius: 99px;
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  transition: width 0.25s ease;
}
.cardian-kt-ws-ai {
  flex-shrink: 0; max-width: 260px; display: flex; align-items: flex-start; gap: 5px;
  font-size: 11px; line-height: 1.45; color: var(--dsw-alias-label-secondary);
}
.cardian-kt-ws-ai-icon { flex-shrink: 0; display: flex; margin-top: 1px; }
.cardian-kt-ws-ai-text { overflow: hidden; text-overflow: ellipsis; }

/* ============ AI 扫盘建库 ============ */
/* ---- 入口 CTA（wiki 总览顶部）---- */
.cardian-kt-scan-cta {
  display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap;
  margin-top: 18px; padding: 14px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 30%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 6%, transparent);
}
.cardian-kt-scan-cta-main {
  flex: 1; min-width: 260px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  text-align: left; cursor: pointer; font-family: inherit; border-radius: 11px; padding: 12px 14px;
  color: var(--dsw-alias-label-primary);
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 12%, transparent);
  transition: background .12s, filter .12s;
}
.cardian-kt-scan-cta-main:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 20%, transparent); }
.cardian-kt-scan-cta-main:disabled { opacity: 0.55; cursor: default; }
.cardian-kt-scan-cta-label { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 650; }
.cardian-kt-scan-cta-sub { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); font-weight: 400; }
.cardian-kt-scan-cta-side { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; justify-content: center; }
.cardian-kt-scan-cta-model { font-size: 11px; color: var(--dsw-alias-label-tertiary); max-width: 240px; line-height: 1.5; }

/* ---- 进度卡（分阶段 + 暂停/继续/停止）---- */
.cardian-kt-scanprog {
  margin-top: 12px; padding: 14px 16px; border-radius: 14px; animation: kt-fade .16s ease;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-interactive-bg-hover);
  display: flex; flex-direction: column; gap: 8px;
}
.cardian-kt-scanprog--running { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 45%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog--paused { border-color: color-mix(in srgb, var(--dsw-alias-state-warning-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)) 55%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog--error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1)); }
.cardian-kt-scanprog-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.cardian-kt-scanprog-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; }
.cardian-kt-scanprog-state { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.cardian-kt-scanprog > .cardian-kt-bar { height: 7px; }
.cardian-kt-stages { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-stage {
  font-size: 11px; border-radius: 99px; padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary); white-space: nowrap;
}
.cardian-kt-stage--done { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 40%, transparent); }
.cardian-kt-stage--active {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
  font-weight: 600;
}
.cardian-kt-stage--pending { opacity: 0.6; }
.cardian-kt-scanprog-cur {
  margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cardian-kt-scanprog-stats { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.cardian-kt-scanprog-diff, .cardian-kt-scanprog-note { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-secondary); line-height: 1.6; }
.cardian-kt-scanprog-error { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.cardian-kt-scanprog-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }

/* ---- 扫盘向导 overlay ---- */
.cardian-kt-scan-overlay {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: flex-start; justify-content: center;
  padding: 56px 24px 24px; overflow-y: auto; box-sizing: border-box;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent);
  backdrop-filter: blur(2px);
}
.cardian-kt-scan {
  width: 100%; max-width: 560px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px;
  margin: auto 0; padding: 20px 22px; border-radius: 16px; animation: kt-fade .16s ease;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  color: var(--dsw-alias-label-primary); font-size: 13px;
}
.cardian-kt-scan-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cardian-kt-scan-title { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 680; }
.cardian-kt-scan-note { margin: 0; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-scan-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.cardian-kt-scan-field--sm { flex: 0 0 108px; }
.cardian-kt-scan-row { display: flex; gap: 12px; flex-wrap: wrap; }
.cardian-kt-scan-label { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); letter-spacing: .02em; }
.cardian-kt-scan-input {
  width: 100%; box-sizing: border-box; font-family: inherit; font-size: 12.5px; line-height: 1.5;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 9px; padding: 7px 10px; outline: none;
}
.cardian-kt-scan-input:focus { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 60%, transparent); }
select.cardian-kt-scan-input { cursor: pointer; appearance: none; }
.cardian-kt-scan-help { font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-scan-ws { display: flex; flex-wrap: wrap; gap: 6px; }
.cardian-kt-scan-actions { display: flex; justify-content: flex-end; gap: 10px; }
/* 向导里的工作区快捷钮：复用 .cardian-kt-chip 外观，补上 button 需要的交互样式 */
button.cardian-kt-chip {
  display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent;
  cursor: pointer; font-family: inherit; max-width: 100%; transition: background .12s, border-color .12s, color .12s;
}
button.cardian-kt-chip:hover { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover)); }
.cardian-kt-chip--active {
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 14%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 55%, transparent);
}

/* ============ 洞察 ============ */
.cardian-kt-insight-card {
  margin-top: 16px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px; display: flex; flex-direction: column; gap: 6px; animation: kt-fade .16s ease;
}
.cardian-kt-insight-line { font-size: 12.5px; line-height: 1.7; margin: 0; color: var(--dsw-alias-label-secondary); word-break: break-word; }
.cardian-kt-tagcloud { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.cardian-kt-bar-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; min-width: 0; }
.cardian-kt-bar-name {
  flex: none; width: 150px; font-size: 12px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cardian-kt-bar-track {
  flex: 1; height: 8px; border-radius: 99px; min-width: 40px;
  background: var(--dsw-alias-interactive-bg-hover); overflow: hidden;
}
.cardian-kt-bar-value {
  display: block; height: 100%; border-radius: 99px;
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 65%, transparent),
    var(--dsw-alias-brand-primary-new-colorprimary-new-color));
  transition: width .3s ease;
}
.cardian-kt-bar-num { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); width: 64px; text-align: right; }
.cardian-kt-doctor-head {
  display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 650; margin: 0 0 8px;
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-doctor-head--ok { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color)); }
.cardian-kt-level {
  display: inline-block; font-size: 10px; font-weight: 600; border-radius: 5px;
  padding: 1px 6px; margin-right: 8px; text-transform: uppercase;
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary);
}
.cardian-kt-level--error {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.cardian-kt-level--warn {
  background: color-mix(in srgb, #f5a623 16%, transparent);
  color: #b76e10;
}

/* ---- 依赖图谱（纯 SVG 力导向，零依赖） ---- */
.cardian-kt-graph-card { gap: 12px; }
.cardian-kt-graph-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cardian-kt-graph-head .cardian-kt-insight-line {
  display: flex; align-items: center; gap: 6px; font-weight: 650; color: var(--dsw-alias-label-primary);
}
.cardian-kt-graph-tip { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.cardian-kt-graph {
  width: 100%; overflow: hidden; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 3%, var(--dsw-alias-bg-base));
}
.cardian-kt-graph-svg { display: block; width: 100%; height: auto; max-height: 480px; }
.cardian-kt-graph-edge {
  stroke: color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, transparent);
  stroke-width: 1.2; transition: stroke .14s, opacity .14s;
}
.cardian-kt-graph-edge--hi { stroke: var(--dsw-alias-brand-primary-new-colorprimary-new-color); stroke-width: 1.8; }
.cardian-kt-graph-edge--dim { opacity: 0.15; }
.cardian-kt-graph-node { cursor: pointer; transition: opacity .14s; }
.cardian-kt-graph-node--dim { opacity: 0.32; }
.cardian-kt-graph-dot {
  fill: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 82%, var(--dsw-alias-bg-base));
  stroke: var(--dsw-alias-bg-base); stroke-width: 1.5; transition: fill .14s;
}
.cardian-kt-graph-node:hover .cardian-kt-graph-dot,
.cardian-kt-graph-node--active .cardian-kt-graph-dot {
  fill: var(--dsw-alias-brand-primary-new-colorprimary-new-color);
  stroke: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color) 30%, var(--dsw-alias-bg-base));
}
.cardian-kt-graph-node:focus { outline: none; }
.cardian-kt-graph-node:focus-visible .cardian-kt-graph-dot {
  stroke: var(--dsw-alias-brand-primary-new-colorprimary-new-color); stroke-width: 2.5;
}
.cardian-kt-graph-label {
  font-size: 9.5px; fill: var(--dsw-alias-label-secondary); pointer-events: none; font-family: inherit;
  paint-order: stroke; stroke: var(--dsw-alias-bg-base); stroke-width: 2.5px; stroke-linejoin: round;
}
.cardian-kt-graph-node--active .cardian-kt-graph-label {
  fill: var(--dsw-alias-brand-primary-new-colorprimary-new-color); font-weight: 600;
}

/* ---- 筛选后空态 ---- */
.cardian-kt-filter-empty {
  margin-top: 22px; padding: 22px; text-align: center;
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 14px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.cardian-kt-filter-empty-text { font-size: 12.5px; color: var(--dsw-alias-label-tertiary); margin: 0; }

/* ============ 细节 ============ */
.cardian-kt-rail-tree::-webkit-scrollbar, .cardian-kt-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.cardian-kt-rail-tree::-webkit-scrollbar-thumb, .cardian-kt-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent);
  border-radius: 99px; border: 3px solid transparent; background-clip: content-box;
}
.cardian-kt-rail-tree::-webkit-scrollbar-thumb:hover, .cardian-kt-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 45%, transparent);
  background-clip: content-box;
}

@media (max-width: 980px) {
  .cardian-kt-rail { width: 224px; }
  .cardian-kt-page { padding: 16px 20px 48px; }
  .cardian-kt-stats { grid-template-columns: 1fr; }
  .cardian-kt-form { grid-template-columns: 1fr; }
}
`;
		//#endregion
		//#region src/client/inline-pattern.txt
		var inline_pattern_default = "!B*{2}([^!B*!N]+)!B*!B*|!B*([^!B*!N]+)!B*|`([^`!N]+)`|!B[!B[([^!B]!N]+)!B]!B]|!B[([^!B]!N]+)!B]!B(([^!B) !N]+)!B)\r\n";
		//#endregion
		//#region src/client/ui.tsx
		const PATHS = {
			knowledge: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v14" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" })] }),
			cards: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" })
			] }),
			memory: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 18h6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 22h4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" })
			] }),
			wiki: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }),
			search: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "11",
				cy: "11",
				r: "8"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m21 21-4.3-4.3" })] }),
			refresh: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 3v5h5" })] }),
			close: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18 6 6 18" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 6 12 12" })] }),
			plus: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 12h14" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 5v14" })] }),
			chevron: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m9 18 6-6-6-6" }),
			file: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 13h8" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 17h5" })
			] }),
			folder: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }),
			folderOpen: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" }),
			repo: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m3.3 7 8.7 5 8.7-5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 22V12" })
			] }),
			edit: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" }),
			trash: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 6h18" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 11v6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 11v6" })
			] }),
			back: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m12 19-7-7 7-7" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M19 12H5" })] }),
			status: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18 17V9" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 17V5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 17v-3" })
			] }),
			tag: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "7.5",
				cy: "7.5",
				r: ".8"
			})] }),
			graph: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "5",
					r: "2.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "5",
					cy: "19",
					r: "2.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "19",
					cy: "19",
					r: "2.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m10.4 7 -4 10" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m13.6 7 4 10" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7.6 19h8.8" })
			] }),
			doctor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" }),
			sparkle: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" }),
			link: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" })] }),
			ingest: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m7 10 5 5 5-5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 15V3" })
			] }),
			check: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m9 11 3 3 9-9" })] }),
			alert: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 9v4" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 17h.01" })
			] }),
			empty: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" })] }),
			pause: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "6",
				y: "4",
				width: "4",
				height: "16",
				rx: "1"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "14",
				y: "4",
				width: "4",
				height: "16",
				rx: "1"
			})] }),
			play: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polygon", { points: "6 3 20 12 6 21 6 3" }),
			stop: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "5",
				y: "5",
				width: "14",
				height: "14",
				rx: "2"
			}),
			module: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v5.5l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m7 16.5-4.74-2.85" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 19v-5.5l4.74-2.85" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 13.5V8.32a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0L6 7" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 10.5 1.26 7.65" })
			] }),
			diff: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "10",
					cy: "12",
					r: "3"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "14",
					cy: "18",
					r: "3"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 9V5a2 2 0 0 1 2-2h5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 12h2" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M17 5h3" })
			] })
		};
		function Icon({ name, size = 15, strokeWidth = 1.8 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: "kt-icon",
				viewBox: "0 0 24 24",
				width: size,
				height: size,
				fill: "none",
				stroke: "currentColor",
				strokeWidth,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: PATHS[name]
			});
		}
		function escapeRe(s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function markText(plain, hl, keyBase) {
			if (!plain) return [];
			if (!hl) return [plain];
			const parts = plain.split(new RegExp(`(${escapeRe(hl)})`, "gi"));
			const out = [];
			parts.forEach((p, i) => {
				if (!p) return;
				out.push(p.toLowerCase() === hl.toLowerCase() ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("mark", {
					className: "kt-md-mark",
					children: p
				}, `${keyBase}-h${i}`) : p);
			});
			return out;
		}
		const BS = String.fromCharCode(92);
		const LF = String.fromCharCode(10);
		const INLINE_SRC = String(inline_pattern_default).trim().split("!B").join(BS).split("!N").join(LF);
		function safeHref(u) {
			const s = String(u ?? "").trim().toLowerCase();
			return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("mailto:") || s.startsWith("obsidian://");
		}
		function inline(text, hl, keyBase, onWiki) {
			const re = new RegExp(INLINE_SRC, "g");
			const nodes = [];
			let last = 0;
			let i = 0;
			let m;
			while (m = re.exec(text)) {
				nodes.push(...markText(text.slice(last, m.index), hl, `${keyBase}p${i}`));
				const k = `${keyBase}i${i++}`;
				if (m[1] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: inline(m[1], hl, k, onWiki) }, k));
				else if (m[2] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", { children: inline(m[2], hl, k, onWiki) }, k));
				else if (m[3] !== void 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: m[3] }, k));
				else if (m[4] !== void 0) {
					const title = String(m[4]);
					nodes.push(onWiki ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "kt-md-wikilink kt-md-wikilink--link",
						role: "button",
						tabIndex: 0,
						title: `跳转到：${title}`,
						onClick: (e) => {
							e.stopPropagation();
							onWiki(title);
						},
						onKeyDown: (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onWiki(title);
							}
						},
						children: title
					}, k) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "kt-md-wikilink",
						children: title
					}, k));
				} else if (m[5] !== void 0) {
					const raw = String(m[6] ?? "");
					const href = safeHref(raw) ? raw : void 0;
					nodes.push(href ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href,
						target: "_blank",
						rel: "noreferrer",
						children: m[5]
					}, k) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "kt-md-linktext",
						children: m[5]
					}, k));
				}
				last = m.index + m[0].length;
			}
			nodes.push(...markText(text.slice(last), hl, `${keyBase}z`));
			return nodes;
		}
		const RE_FENCE = /^\s{0,3}```\s*([\w+#.-]*)\s*$/;
		const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
		const RE_HR = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
		const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
		const RE_LI_UL = /^\s*[-*+]\s+(.*)$/;
		const RE_LI_OL = /^\s*\d+[.)]\s+(.*)$/;
		const RE_TASK = /^\[( |x|X)\]\s*(.*)$/;
		function isBlockStart(line) {
			return RE_FENCE.test(line) || RE_HEADING.test(line) || RE_HR.test(line) || RE_QUOTE.test(line) || RE_LI_UL.test(line) || RE_LI_OL.test(line);
		}
		function Markdown({ text, highlight = "", onWikiSelect }) {
			const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
			const blocks = [];
			let i = 0;
			let b = 0;
			const hl = highlight.trim();
			while (i < lines.length) {
				const line = lines[i];
				if (!line.trim()) {
					i++;
					continue;
				}
				const kb = `b${b++}`;
				const fence = RE_FENCE.exec(line);
				if (fence) {
					const buf = [];
					i++;
					while (i < lines.length && !/^\s{0,3}```\s*$/.test(lines[i])) {
						buf.push(lines[i]);
						i++;
					}
					i++;
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "kt-md-pre",
						"data-lang": fence[1] || void 0,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: buf.join("\n") })
					}, kb));
					continue;
				}
				const h = RE_HEADING.exec(line);
				if (h) {
					const lvl = Math.min(h[1].length, 5);
					blocks.push((0, react.createElement)(`h${Math.max(lvl, 2)}`, {
						key: kb,
						className: `kt-md-h kt-md-h${lvl}`
					}, ...inline(h[2], hl, kb, onWikiSelect)));
					i++;
					continue;
				}
				if (RE_HR.test(line)) {
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", { className: "kt-md-hr" }, kb));
					i++;
					continue;
				}
				if (RE_QUOTE.test(line)) {
					const buf = [];
					while (i < lines.length && RE_QUOTE.test(lines[i])) {
						buf.push(RE_QUOTE.exec(lines[i])[1]);
						i++;
					}
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("blockquote", {
						className: "kt-md-quote",
						children: buf.map((l, j) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: inline(l, hl, `${kb}q${j}`, onWikiSelect) }, j))
					}, kb));
					continue;
				}
				const ul = RE_LI_UL.exec(line);
				const ol = RE_LI_OL.exec(line);
				if (ul || ol) {
					const ordered = Boolean(ol);
					const items = [];
					while (i < lines.length) {
						const mm = (ordered ? RE_LI_OL : RE_LI_UL).exec(lines[i]);
						if (!mm) break;
						let content = inline(mm[1], hl, `${kb}l${items.length}`, onWikiSelect);
						const task = RE_TASK.exec(mm[1]);
						if (task && !ordered) content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `kt-md-task${task[1].toLowerCase() === "x" ? " kt-md-task--done" : ""}`,
								children: task[1].toLowerCase() === "x" ? "☑" : "☐"
							}),
							" ",
							inline(task[2], hl, `${kb}l${items.length}`, onWikiSelect)
						] });
						items.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: content }, items.length));
						i++;
					}
					blocks.push(ordered ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
						className: "kt-md-list",
						children: items
					}, kb) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "kt-md-list",
						children: items
					}, kb));
					continue;
				}
				if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
					const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
					const header = cells(line);
					i += 2;
					const rows = [];
					while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
						rows.push(cells(lines[i]));
						i++;
					}
					blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "kt-md-tablewrap",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
							className: "kt-md-table",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: header.map((c, j) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: inline(c, hl, `${kb}th${j}`, onWikiSelect) }, j)) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((r, j) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: r.map((c, k) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: inline(c, hl, `${kb}td${j}-${k}`, onWikiSelect) }, k)) }, j)) })]
						})
					}, kb));
					continue;
				}
				const para = [];
				while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
					para.push(lines[i]);
					i++;
				}
				const nodes = [];
				para.forEach((l, j) => {
					if (j > 0) nodes.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}, `${kb}br${j}`));
					nodes.push(...inline(l, hl, `${kb}t${j}`, onWikiSelect));
				});
				blocks.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "kt-md-p",
					children: nodes
				}, kb));
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "kt-md",
				children: blocks
			});
		}
		//#endregion
		//#region src/client/KnowledgeTree.tsx
		const SECTIONS = [
			{
				key: "cards",
				label: "知识卡片",
				icon: "cards"
			},
			{
				key: "memory",
				label: "记忆",
				icon: "memory"
			},
			{
				key: "wiki",
				label: "RepoWiki",
				icon: "wiki"
			}
		];
		const SECTION_TITLES = {
			cards: "知识卡片",
			memory: "记忆",
			wiki: "RepoWiki"
		};
		const INSIGHTS = [
			{
				key: "status",
				label: "状态总览",
				icon: "status"
			},
			{
				key: "tagCloud",
				label: "标签洞察",
				icon: "tag"
			},
			{
				key: "graph",
				label: "依赖图谱",
				icon: "graph"
			},
			{
				key: "doctor",
				label: "健康检查",
				icon: "doctor"
			}
		];
		function KnowledgeTreeTrigger({ controller, wide }) {
			const [, force] = (0, react.useState)(0);
			(0, react.useEffect)(() => controller.subscribe(() => force((n) => n + 1)), [controller]);
			const onToggle = (0, react.useCallback)(() => {
				controller.open = !controller.open;
				controller.emit();
			}, [controller]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "cardian-kt-trigger",
				"data-rail": wide ? "0" : "1",
				"data-on": controller.open ? "1" : "0",
				onClick: onToggle,
				"aria-label": "知识中心",
				"aria-haspopup": "dialog",
				"aria-expanded": controller.open,
				title: "知识中心",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
					name: "knowledge",
					size: wide ? 15 : 17
				}), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cardian-kt-trigger-label",
					children: "知识中心"
				})]
			});
		}
		const SECTION_FIELDS = {
			cards: [
				{
					name: "title",
					label: "标题",
					type: "text",
					required: true,
					placeholder: "给这条知识起个名字",
					wide: true
				},
				{
					name: "content",
					label: "正文",
					type: "textarea",
					required: true,
					placeholder: "支持 Markdown：标题 / 列表 / 代码块 / [[双向链接]]…",
					wide: true
				},
				{
					name: "cardType",
					label: "卡片类型",
					type: "select",
					options: [
						"overview",
						"tech stack",
						"convention",
						"setup & commands"
					],
					hint: "机读分类（Agent 消费结构化上下文用）"
				},
				{
					name: "category",
					label: "分类",
					type: "text",
					placeholder: "general"
				},
				{
					name: "tags",
					label: "标签",
					type: "text",
					hint: "逗号分隔"
				},
				{
					name: "status",
					label: "状态",
					type: "select",
					options: ["published", "draft"]
				},
				{
					name: "source",
					label: "来源",
					type: "text"
				},
				{
					name: "confidence",
					label: "置信度 0-1",
					type: "number"
				},
				{
					name: "summary",
					label: "摘要",
					type: "textarea",
					wide: true
				},
				{
					name: "aliases",
					label: "别名",
					type: "text",
					hint: "逗号分隔"
				},
				{
					name: "front",
					label: "闪卡正面",
					type: "textarea",
					hint: "填写后成为可复习的闪卡"
				},
				{
					name: "back",
					label: "闪卡背面",
					type: "textarea"
				},
				{
					name: "deck",
					label: "闪卡牌组",
					type: "text"
				},
				{
					name: "as_of",
					label: "事实截止日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				},
				{
					name: "expires",
					label: "过期日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				}
			],
			memory: [
				{
					name: "title",
					label: "标题",
					type: "text",
					required: true,
					placeholder: "这条记忆的主题",
					wide: true
				},
				{
					name: "content",
					label: "内容",
					type: "textarea",
					required: true,
					placeholder: "Markdown 内容…",
					wide: true
				},
				{
					name: "scope",
					label: "作用域",
					type: "text",
					hint: "留空默认 global"
				},
				{
					name: "kind",
					label: "类型",
					type: "select",
					options: [
						"semantic",
						"episodic",
						"procedural"
					]
				},
				{
					name: "importance",
					label: "重要度 1-5",
					type: "number"
				},
				{
					name: "tags",
					label: "标签",
					type: "text",
					hint: "逗号分隔"
				},
				{
					name: "facts",
					label: "关键事实",
					type: "textarea",
					hint: "每行一条",
					wide: true
				},
				{
					name: "status",
					label: "状态",
					type: "select",
					options: ["published", "draft"]
				},
				{
					name: "confidence",
					label: "置信度 0-1",
					type: "number"
				},
				{
					name: "summary",
					label: "摘要",
					type: "textarea",
					wide: true
				},
				{
					name: "aliases",
					label: "别名",
					type: "text"
				},
				{
					name: "as_of",
					label: "事实截止日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				},
				{
					name: "expires",
					label: "过期日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				}
			],
			wiki: [
				{
					name: "repo",
					label: "仓库",
					type: "text",
					required: true,
					placeholder: "仓库名（slug）"
				},
				{
					name: "path",
					label: "文件路径",
					type: "text",
					required: true,
					placeholder: "src/lib/store.js"
				},
				{
					name: "title",
					label: "标题",
					type: "text",
					hint: "默认同文件路径",
					wide: true
				},
				{
					name: "content",
					label: "内容",
					type: "textarea",
					required: true,
					placeholder: "该文件的语义化描述…",
					wide: true
				},
				{
					name: "language",
					label: "语言",
					type: "text"
				},
				{
					name: "tags",
					label: "标签",
					type: "text",
					hint: "逗号分隔"
				},
				{
					name: "status",
					label: "状态",
					type: "select",
					options: ["published", "draft"]
				},
				{
					name: "confidence",
					label: "置信度 0-1",
					type: "number"
				},
				{
					name: "summary",
					label: "摘要",
					type: "textarea",
					wide: true
				},
				{
					name: "aliases",
					label: "别名",
					type: "text"
				},
				{
					name: "as_of",
					label: "事实截止日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				},
				{
					name: "expires",
					label: "过期日期",
					type: "text",
					placeholder: "YYYY-MM-DD"
				}
			]
		};
		function msg(err) {
			return err instanceof Error ? err.message : String(err);
		}
		function fmtDate(s) {
			return String(s ?? "").slice(0, 10);
		}
		function sectionOfRel(rel) {
			const p = String(rel ?? "").toLowerCase();
			if (p.startsWith("cards/")) return "cards";
			if (p.startsWith("memory/")) return "memory";
			if (p.startsWith("repos/")) return "wiki";
			return null;
		}
		var PanelBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(err) {
				return {
					error: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : void 0
				};
			}
			componentDidCatch(err) {
				console.error("[cardian] 面板渲染异常（已拦截，槽入口保留）:", err);
			}
			render() {
				if (this.state.error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cardian-kt-crash",
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "cardian-kt-crash-title",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "alert",
								size: 16
							}), " 知识中心面板渲染出错"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("pre", {
							className: "cardian-kt-crash-text",
							children: [this.state.error, this.state.stack ? `\n\n${this.state.stack}` : ""]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cardian-kt-crash-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-btn cardian-kt-btn--primary",
								onClick: () => this.setState({ error: null }),
								children: "重试"
							}), this.props.onClose && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-btn",
								onClick: this.props.onClose,
								children: "关闭面板"
							})]
						})
					]
				});
				return this.props.children;
			}
		};
		function KnowledgeTreePanelSafe({ controller }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelBoundary, {
				onClose: () => {
					controller.open = false;
					controller.emit();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KnowledgeTreePanel, { controller })
			});
		}
		function sameDir(a, b) {
			if (!a || !b) return false;
			return a === b || a.toLowerCase() === b.toLowerCase();
		}
		function titleFromPath(p) {
			const parts = p.split(/[\\/]/).filter(Boolean);
			return parts[parts.length - 1] ?? p;
		}
		function splitList(s) {
			return s.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
		}
		function typeKeyOf(e, key) {
			const rec = e;
			if (key === "memory") return String(rec.kind ?? "untyped");
			return String(rec.cardType ?? "untyped");
		}
		const INGEST_STAGES = [
			{
				key: "scan",
				label: "① 扫描文件"
			},
			{
				key: "plan",
				label: "② 规划层级"
			},
			{
				key: "enrich",
				label: "③ 逐文件回填"
			}
		];
		/** 阶段状态：前面的阶段已完成，当前阶段进行中（暂停时仍标进行中）。 */
		function stageStateOf(job, stage) {
			const order = [
				"scan",
				"plan",
				"enrich"
			];
			if (job.status === "done") return "done";
			const cur = order.indexOf(job.phase ?? "scan");
			const at = order.indexOf(stage);
			if (at < cur) return "done";
			if (at === cur) return "active";
			return "pending";
		}
		function jobStatusText(job) {
			if (job.status === "paused") return "已暂停";
			if (job.status === "cancelled") return "已停止";
			if (job.status === "error") return "失败";
			if (job.status === "running") return `${job.pct}%`;
			return "完成";
		}
		function ScanProgress({ job, busy, onView, onControl, onRescan }) {
			const pct = Math.min(100, Math.max(0, Number(job.pct) || 0));
			const live = job.status === "running" || job.status === "paused";
			const diff = job.diff;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `cardian-kt-scanprog cardian-kt-scanprog--${job.status}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-scanprog-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "cardian-kt-scanprog-title",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: job.kind === "diff" ? "diff" : "sparkle",
									size: 13
								}),
								job.kind === "diff" ? "增量扫描" : "AI 扫盘",
								" · ",
								job.repoName
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "cardian-kt-scanprog-state",
							children: [jobStatusText(job), job.model ? ` · ${job.model.provider}/${job.model.model}` : " · 仅骨架"]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cardian-kt-bar",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cardian-kt-bar-fill",
							style: { width: `${pct}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cardian-kt-stages",
						children: INGEST_STAGES.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `cardian-kt-stage cardian-kt-stage--${stageStateOf(job, s.key)}`,
							children: s.label
						}, s.key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cardian-kt-scanprog-cur",
						title: job.current,
						children: job.current || job.error || "…"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-scanprog-stats",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["总览 ", job.overviewCount ?? 0] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["模块 ", job.moduleCount ?? 0] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["已回填 ", job.enrichedCount ?? 0] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["跳过 ", job.skippedCount ?? 0] }),
							Number(job.failedCount) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["回退骨架 ", job.failedCount] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"进度 ",
								job.done,
								"/",
								job.total
							] })
						]
					}),
					diff && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cardian-kt-scanprog-diff",
						children: [
							"新增 ",
							diff.addedCount,
							" · 变更 ",
							diff.changedCount,
							" · 删除 ",
							diff.removedCount,
							" · 未变更 ",
							diff.unchangedCount,
							diff.truncated ? "（清单触顶，不剪孤儿卡）" : "",
							(diff.unenrichedCount ?? 0) > 0 ? `· ${diff.unenrichedCount} 张仍是骨架，可跑一次全量扫盘` : ""
						]
					}),
					job.aiMessage && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cardian-kt-scanprog-note",
						children: job.aiMessage
					}),
					job.error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cardian-kt-scanprog-error",
						children: job.error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-scanprog-actions",
						children: [
							job.status === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-ws-action",
								disabled: busy,
								onClick: () => onControl("pause", job.jobId),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "pause",
									size: 11
								}), " 暂停"]
							}),
							job.status === "paused" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-ws-action",
								disabled: busy,
								onClick: () => onControl("resume", job.jobId),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "play",
									size: 11
								}), " 继续"]
							}),
							live && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-ws-action cardian-kt-ws-action--danger",
								disabled: busy,
								onClick: () => onControl("cancel", job.jobId),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "stop",
									size: 11
								}), " 停止"]
							}),
							job.status === "done" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-ws-action",
								onClick: () => onView(job.repoName),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "repo",
									size: 11
								}), " 查看项目"]
							}),
							job.status !== "running" && job.status !== "paused" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-ws-action",
								disabled: busy,
								onClick: () => onRescan(job.dir, job.repoName),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "diff",
									size: 11
								}), " 再扫变更"]
							})
						]
					})
				]
			});
		}
		function cardLevelOf(e) {
			const p = String(e.path ?? "");
			if (e.level === "project" || p === "__OVERVIEW__") return "project";
			if (e.level === "module" || p.startsWith("__MODULE__")) return "module";
			return "file";
		}
		function fileLabel(entry, fallbackBase = "") {
			const t = entry.title ?? "";
			const p = entry.path ?? "";
			if (t && t !== p) return t;
			return fallbackBase || titleFromPath(p) || t || "(无标题)";
		}
		const TREE_KIND_RANK = {
			group: 0,
			overview: 0,
			module: 1,
			dir: 2,
			file: 3
		};
		function sortTree(node) {
			node.children.sort((a, b) => {
				const ra = TREE_KIND_RANK[a.kind];
				const rb = TREE_KIND_RANK[b.kind];
				if (ra !== rb) return ra - rb;
				return a.label.localeCompare(b.label);
			});
			for (const c of node.children) sortTree(c);
		}
		function buildWikiLevelTree(list, g) {
			const nodes = /* @__PURE__ */ new Map();
			let hasHierarchy = false;
			for (const e of list) {
				const lvl = cardLevelOf(e);
				if (e.parent || lvl !== "file") hasHierarchy = true;
				const id = String(e.id ?? e.rel ?? "");
				if (!id) continue;
				nodes.set(id, {
					key: `h:${g}:${id}`,
					label: lvl === "file" ? fileLabel(e) : e.title || "(无标题)",
					kind: lvl === "project" ? "overview" : lvl === "module" ? "module" : "file",
					entry: e,
					children: []
				});
			}
			if (!hasHierarchy) return null;
			const buckets = [];
			for (const e of list) {
				const id = String(e.id ?? e.rel ?? "");
				const node = nodes.get(id);
				if (!node) continue;
				const parent = e.parent ? nodes.get(String(e.parent)) : void 0;
				if (parent && parent !== node) parent.children.push(node);
				else buckets.push(node);
			}
			const root = buckets.find((n) => n.kind === "overview");
			if (root) {
				const rest = [];
				for (const n of buckets) if (n === root || n.kind === "module" || n.kind === "overview") rest.push(n);
				else root.children.push(n);
				buckets.length = 0;
				buckets.push(...rest, root);
			}
			buckets.sort((a, b) => TREE_KIND_RANK[a.kind] - TREE_KIND_RANK[b.kind] || a.label.localeCompare(b.label));
			return buckets;
		}
		function buildTree(entries, key) {
			const byGroup = /* @__PURE__ */ new Map();
			for (const e of entries ?? []) {
				const g = e.group ?? "未分组";
				const list = byGroup.get(g) ?? [];
				list.push(e);
				byGroup.set(g, list);
			}
			const out = [];
			for (const [g, list] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
				const children = [];
				if (key === "wiki") {
					const hierarchical = buildWikiLevelTree(list, g);
					if (hierarchical) {
						for (const node of hierarchical) sortTree(node);
						children.push(...hierarchical);
					} else {
						const dirs = /* @__PURE__ */ new Map();
						const sorted = [...list].sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));
						for (const entry of sorted) {
							const segs = (entry.path ?? "").split("/").filter(Boolean);
							if (segs.length <= 1) {
								children.push({
									key: `g:${g}:f:${entry.id ?? entry.rel}`,
									label: fileLabel(entry, segs[0]),
									kind: "file",
									entry,
									children: []
								});
								continue;
							}
							let parent = children;
							let acc = "";
							for (let i = 0; i < segs.length - 1; i++) {
								acc = acc ? `${acc}/${segs[i]}` : segs[i];
								const dk = `d:${g}:${acc}`;
								let node = dirs.get(dk);
								if (!node) {
									node = {
										key: dk,
										label: segs[i],
										kind: "dir",
										children: []
									};
									dirs.set(dk, node);
									parent.push(node);
								}
								parent = node.children;
							}
							parent.push({
								key: `g:${g}:f:${entry.id ?? entry.rel}`,
								label: fileLabel(entry, segs[segs.length - 1]),
								kind: "file",
								entry,
								children: []
							});
						}
					}
				} else for (const entry of list) children.push({
					key: `g:${g}:f:${entry.id ?? entry.rel}`,
					label: entry.title ?? "(无标题)",
					kind: "file",
					entry,
					children: []
				});
				const groupNode = {
					key: `g:${g}`,
					label: g,
					kind: "group",
					children
				};
				sortTree(groupNode);
				out.push(groupNode);
			}
			return out;
		}
		function escapeRegExp(s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function countMatches(text, term) {
			if (!term) return 0;
			return text.split(new RegExp(escapeRegExp(term), "gi")).length - 1;
		}
		function highlightTitle(text, term) {
			if (!term) return text;
			return text.split(new RegExp(`(${escapeRegExp(term)})`, "gi")).map((p, i) => p.toLowerCase() === term.toLowerCase() ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("mark", {
				className: "kt-md-mark",
				children: p
			}, i) : p);
		}
		function pickDefined(form, keys) {
			const out = {};
			for (const k of keys) {
				const v = form[k];
				if (v !== void 0 && v !== "") out[k] = v;
			}
			return out;
		}
		function buildArgs(key, form) {
			const args = {
				title: (form.title ?? "").trim(),
				content: form.content ?? ""
			};
			if (key === "cards") {
				Object.assign(args, pickDefined(form, [
					"cardType",
					"category",
					"source",
					"summary",
					"front",
					"back",
					"deck",
					"as_of",
					"expires"
				]));
				if (form.status) args.status = form.status;
			} else if (key === "memory") {
				Object.assign(args, pickDefined(form, [
					"scope",
					"kind",
					"summary",
					"as_of",
					"expires"
				]));
				if (form.status) args.status = form.status;
				if (form.facts) args.facts = splitList(form.facts);
				if (form.importance !== "") {
					const n = Math.round(Number(form.importance));
					if (Number.isFinite(n)) args.importance = Math.min(5, Math.max(1, n));
				}
			} else {
				Object.assign(args, pickDefined(form, [
					"repo",
					"path",
					"title",
					"language",
					"summary",
					"as_of",
					"expires"
				]));
				if (form.status) args.status = form.status;
			}
			if (form.tags) args.tags = splitList(form.tags);
			if (form.aliases) args.aliases = splitList(form.aliases);
			if (form.confidence !== "") {
				const n = Number(form.confidence);
				if (Number.isFinite(n)) args.confidence = Math.min(1, Math.max(0, n));
			}
			return args;
		}
		function toForm(key, note) {
			if (!note) return {};
			const join = (v) => Array.isArray(v) ? v.map(String).join(", ") : v != null ? String(v) : "";
			return {
				title: String(note.title ?? ""),
				content: String(note.body ?? "").replace(/\n+$/, ""),
				...key === "cards" ? {
					category: join(note.category ?? note.group),
					cardType: join(note.cardType),
					source: join(note.source),
					front: join(note.front),
					back: join(note.back),
					deck: join(note.deck)
				} : key === "memory" ? {
					scope: join(note.scope ?? note.group),
					kind: join(note.kind),
					importance: note.importance != null ? String(note.importance) : "",
					facts: Array.isArray(note.facts) ? note.facts.map(String).join("\n") : ""
				} : {
					repo: join(note.repo ?? note.group),
					path: join(note.path),
					language: join(note.language)
				},
				tags: join(note.tags),
				status: join(note.status),
				confidence: note.confidence != null ? String(note.confidence) : "",
				summary: join(note.summary),
				aliases: join(note.aliases),
				as_of: join(note.as_of),
				expires: join(note.expires)
			};
		}
		function GraphView({ nodes, edges, onSelect }) {
			const [hover, setHover] = (0, react.useState)(null);
			const { vnodes, vedges, adjacency } = (0, react.useMemo)(() => {
				const seen = /* @__PURE__ */ new Map();
				for (const n of nodes ?? []) {
					const p = String(n?.path ?? "");
					if (p && !seen.has(p)) seen.set(p, {
						path: p,
						title: n?.title,
						degree: 0
					});
				}
				const ve = [];
				const adj = /* @__PURE__ */ new Map();
				for (const e of edges ?? []) {
					const f = String(e?.from ?? "");
					const t = String(e?.to ?? "");
					if (!seen.has(f) || !seen.has(t) || f === t) continue;
					ve.push({
						from: f,
						to: t
					});
					const fn = seen.get(f);
					const tn = seen.get(t);
					fn.degree = (fn.degree ?? 0) + 1;
					tn.degree = (tn.degree ?? 0) + 1;
					(adj.get(f) ?? /* @__PURE__ */ new Set()).add(t);
					(adj.get(t) ?? /* @__PURE__ */ new Set()).add(f);
					adj.set(f, adj.get(f));
					adj.set(t, adj.get(t));
				}
				return {
					vnodes: [...seen.values()],
					vedges: ve,
					adjacency: adj
				};
			}, [nodes, edges]);
			const layout = (0, react.useMemo)(() => {
				const W = 680;
				const H = 470;
				const CX = W / 2;
				const CY = H / 2;
				const n = vnodes.length;
				if (n === 0) return {
					W,
					H,
					pts: []
				};
				const pts = vnodes.map((node, i) => {
					const a = i / n * Math.PI * 2;
					const r = n <= 1 ? 0 : Math.min(W, H) * .34;
					return {
						node,
						x: CX + Math.cos(a) * r,
						y: CY + Math.sin(a) * r,
						vx: 0,
						vy: 0
					};
				});
				const idx = new Map(vnodes.map((node, i) => [node.path, i]));
				const springs = vedges.map((e) => ({
					a: idx.get(e.from),
					b: idx.get(e.to)
				})).filter((s) => s.a !== void 0 && s.b !== void 0);
				const ITER = 180;
				const REP = 7e3;
				const SPRING = .02;
				const SPRING_LEN = 96;
				const CENTER = .012;
				const DAMP = .86;
				for (let step = 0; step < ITER; step++) {
					for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
						let dx = pts[i].x - pts[j].x;
						let dy = pts[i].y - pts[j].y;
						let d2 = dx * dx + dy * dy;
						if (d2 < .01) {
							dx = (i - j) * .5 + .3;
							dy = .4;
							d2 = dx * dx + dy * dy;
						}
						const d = Math.sqrt(d2) || 1;
						const f = REP / d2;
						const fx = dx / d * f;
						const fy = dy / d * f;
						pts[i].vx += fx;
						pts[i].vy += fy;
						pts[j].vx -= fx;
						pts[j].vy -= fy;
					}
					for (const s of springs) {
						const a = pts[s.a];
						const b = pts[s.b];
						const dx = b.x - a.x;
						const dy = b.y - a.y;
						const d = Math.sqrt(dx * dx + dy * dy) || 1;
						const f = (d - SPRING_LEN) * SPRING;
						const fx = dx / d * f;
						const fy = dy / d * f;
						a.vx += fx;
						a.vy += fy;
						b.vx -= fx;
						b.vy -= fy;
					}
					for (const p of pts) {
						p.vx += (CX - p.x) * CENTER;
						p.vy += (CY - p.y) * CENTER;
						p.vx *= DAMP;
						p.vy *= DAMP;
						p.x += Math.max(-14, Math.min(14, p.vx));
						p.y += Math.max(-14, Math.min(14, p.vy));
					}
				}
				const xs = pts.map((p) => p.x);
				const ys = pts.map((p) => p.y);
				const minX = Math.min(...xs);
				const maxX = Math.max(...xs);
				const minY = Math.min(...ys);
				const maxY = Math.max(...ys);
				const s = Math.min(576 / Math.max(1, maxX - minX), 366 / Math.max(1, maxY - minY));
				const ox = (W - (maxX - minX) * s) / 2 - minX * s;
				const oy = (H - (maxY - minY) * s) / 2 - minY * s;
				return {
					W,
					H,
					pts: pts.map((p) => ({
						node: p.node,
						x: p.x * s + ox,
						y: p.y * s + oy
					}))
				};
			}, [vnodes, vedges]);
			const posByPath = new Map(layout.pts.map((p) => [p.node.path, p]));
			const isNeighbor = (p) => hover === p || (adjacency.get(hover ?? "")?.has(p) ?? false);
			if (vnodes.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "cardian-kt-hint",
				children: "该仓库暂无可解析的依赖节点。"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cardian-kt-graph",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					viewBox: `0 0 ${layout.W} ${layout.H}`,
					className: "cardian-kt-graph-svg",
					preserveAspectRatio: "xMidYMid meet",
					role: "img",
					"aria-label": "依赖图谱",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
						className: "cardian-kt-graph-edges",
						children: vedges.map((e, i) => {
							const a = posByPath.get(e.from);
							const b = posByPath.get(e.to);
							if (!a || !b) return null;
							const active = hover !== null && (e.from === hover || e.to === hover);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
								x1: a.x,
								y1: a.y,
								x2: b.x,
								y2: b.y,
								className: `cardian-kt-graph-edge${hover && !active ? " cardian-kt-graph-edge--dim" : ""}${active ? " cardian-kt-graph-edge--hi" : ""}`
							}, `e${i}`);
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
						className: "cardian-kt-graph-nodes",
						children: layout.pts.map((p) => {
							const r = 5 + Math.min(9, (p.node.degree ?? 0) * 1.5);
							const dim = hover !== null && !isNeighbor(p.node.path);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
								className: `cardian-kt-graph-node${hover === p.node.path ? " cardian-kt-graph-node--active" : ""}${dim ? " cardian-kt-graph-node--dim" : ""}`,
								transform: `translate(${p.x},${p.y})`,
								role: "button",
								tabIndex: 0,
								"aria-label": p.node.title ?? p.node.path,
								onMouseEnter: () => setHover(p.node.path),
								onMouseLeave: () => setHover((cur) => cur === p.node.path ? null : cur),
								onFocus: () => setHover(p.node.path),
								onBlur: () => setHover((cur) => cur === p.node.path ? null : cur),
								onClick: () => onSelect?.(p.node),
								onKeyDown: (e) => {
									if ((e.key === "Enter" || e.key === " ") && onSelect) {
										e.preventDefault();
										onSelect(p.node);
									}
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
									r,
									className: "cardian-kt-graph-dot"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
									y: -r - 5,
									textAnchor: "middle",
									className: "cardian-kt-graph-label",
									children: titleFromPath(p.node.title || p.node.path)
								})]
							}, p.node.path);
						})
					})]
				})
			});
		}
		function KnowledgeTreePanel({ controller }) {
			const [, force] = (0, react.useState)(0);
			const [vaultPath, setVaultPath] = (0, react.useState)("");
			const [activeTab, setActiveTab] = (0, react.useState)("cards");
			const [counts, setCounts] = (0, react.useState)({
				cards: 0,
				memory: 0,
				wiki: 0
			});
			const [query, setQuery] = (0, react.useState)("");
			const [activeGroup, setActiveGroup] = (0, react.useState)(null);
			const [entries, setEntries] = (0, react.useState)([]);
			const [groupPool, setGroupPool] = (0, react.useState)([]);
			const [expanded, setExpanded] = (0, react.useState)({});
			const [loading, setLoading] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [content, setContent] = (0, react.useState)({ kind: "overview" });
			const [confirmEntry, setConfirmEntry] = (0, react.useState)(null);
			const [formState, setFormState] = (0, react.useState)({});
			const [insightData, setInsightData] = (0, react.useState)(null);
			const [typeFilter, setTypeFilter] = (0, react.useState)(null);
			const [relLinks, setRelLinks] = (0, react.useState)(null);
			const detailSeq = (0, react.useRef)(0);
			const [jobs, setJobs] = (0, react.useState)([]);
			const [workspaces, setWorkspaces] = (0, react.useState)([]);
			const [ingestBusy, setIngestBusy] = (0, react.useState)(false);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [catalogBusy, setCatalogBusy] = (0, react.useState)(false);
			const [scanOpen, setScanOpen] = (0, react.useState)(false);
			const [scanMode, setScanMode] = (0, react.useState)("full");
			const [scanDir, setScanDir] = (0, react.useState)("");
			const [scanRepo, setScanRepo] = (0, react.useState)("");
			const [scanMax, setScanMax] = (0, react.useState)("50");
			const [scanDepth, setScanDepth] = (0, react.useState)("2");
			const [scanModel, setScanModel] = (0, react.useState)("");
			(0, react.useEffect)(() => controller.subscribe(() => force((n) => n + 1)), [controller]);
			(0, react.useEffect)(() => {
				if (typeof document === "undefined") return;
				if (document.querySelector("style[data-plugin-css=\"cardian-kt\"]")) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-cardian";
				tag.dataset.pluginCss = "cardian-kt";
				tag.textContent = CARDian_CSS;
				document.head.appendChild(tag);
			}, []);
			const panelRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				if (!controller.open) return;
				if (typeof document === "undefined") return;
				try {
					const frame = document.querySelector("[data-shell-overlay]")?.parentElement;
					if (!frame) {
						console.warn("[cardian] 未找到 shell overlay 层，面板保持全幅覆盖");
						return;
					}
					if (frame.children.length < 4) {
						console.warn(`[cardian] frame 子节点不足 4（实际 ${frame.children.length}），跳过几何定位（面板保持全幅）`);
						return;
					}
					const sidebarCol = frame.children[0];
					const centerCol = frame.children[1];
					const detailsCol = frame.children[2];
					const panel = panelRef.current;
					if (!sidebarCol || !centerCol || !panel) {
						console.warn("[cardian] 几何定位缺少列/面板引用，面板保持全幅");
						return;
					}
					const sync = () => {
						panel.style.left = `${sidebarCol.offsetWidth}px`;
						panel.style.right = `${detailsCol ? detailsCol.offsetWidth : 0}px`;
					};
					const previousVisibility = centerCol.style.visibility;
					centerCol.style.visibility = "hidden";
					sync();
					const ro = new ResizeObserver(sync);
					ro.observe(sidebarCol);
					if (detailsCol) ro.observe(detailsCol);
					window.addEventListener("resize", sync);
					return () => {
						ro.disconnect();
						window.removeEventListener("resize", sync);
						centerCol.style.visibility = previousVisibility;
						panel.style.left = "";
						panel.style.right = "";
					};
				} catch (err) {
					console.warn("[cardian] 面板几何定位异常（面板保持全幅）:", err);
				}
			}, [controller.open]);
			const reload = (0, react.useCallback)(async (key, q, group) => {
				setLoading(true);
				setError(null);
				try {
					const r = await controller.sectionList(key, {
						...q.trim() ? { query: q.trim() } : {},
						...group ? { group } : {}
					});
					const list = Array.isArray(r && r.entries) ? r.entries : [];
					setEntries(list);
					if (!group && !q.trim()) setGroupPool([...new Set(list.map((e) => e.group).filter(Boolean))].sort());
					setCounts((prev) => ({
						...prev,
						[key]: typeof r.count === "number" ? r.count : list.length
					}));
					return r;
				} catch (err) {
					setError(msg(err));
					return null;
				} finally {
					setLoading(false);
				}
			}, [controller]);
			(0, react.useEffect)(() => {
				if (!controller.open) return;
				setError(null);
				setContent({ kind: "overview" });
				setConfirmEntry(null);
				setQuery("");
				setTypeFilter(null);
				setActiveGroup(null);
				setGroupPool([]);
				setWorkspaces(controller.listWorkspaces());
				setCatalogBusy(true);
				controller.listModels().then((c) => setCatalog(c)).catch(() => setCatalog({
					available: false,
					models: [],
					default: null
				})).finally(() => setCatalogBusy(false));
				controller.describe().then((t) => {
					setVaultPath(t.vaultPath ?? "");
					const c = {
						cards: 0,
						memory: 0,
						wiki: 0
					};
					for (const s of t.sections ?? []) c[s.key] = s.count;
					setCounts(c);
				}).catch((err) => setError(msg(err)));
			}, [controller.open, controller]);
			(0, react.useEffect)(() => {
				if (!controller.open) return;
				const t = setTimeout(() => reload(activeTab, query, activeGroup), query ? 200 : 0);
				return () => clearTimeout(t);
			}, [
				controller.open,
				activeTab,
				query,
				activeGroup,
				reload
			]);
			const runningKey = jobs.map((j) => `${j.jobId}:${j.status}`).join("|");
			(0, react.useEffect)(() => {
				if (!controller.open) return;
				if (activeTab !== "wiki" && !jobs.some((j) => j.status === "running")) return;
				let alive = true;
				const tick = async () => {
					try {
						const r = await controller.ingestStatus();
						if (!alive) return;
						setJobs(Array.isArray(r.jobs) ? r.jobs : []);
					} catch {}
				};
				tick();
				const timer = setInterval(tick, 1e3);
				return () => {
					alive = false;
					clearInterval(timer);
				};
			}, [
				controller.open,
				activeTab,
				runningKey
			]);
			const cardSignal = jobs.map((j) => `${j.jobId}:${(j.enrichedCount ?? 0) + (j.skippedCount ?? 0) + (j.moduleCount ?? 0) + (j.overviewCount ?? 0)}`).join("|");
			(0, react.useEffect)(() => {
				if (!controller.open || !cardSignal) return;
				reload(activeTab, query, activeGroup);
			}, [cardSignal]);
			const switchTab = (key) => {
				setActiveTab(key);
				setQuery("");
				setTypeFilter(null);
				setActiveGroup(null);
				setContent({ kind: "overview" });
				setConfirmEntry(null);
				setError(null);
			};
			const openDetail = async (entry, key = activeTab, ref, group) => {
				const seq = ++detailSeq.current;
				const useKey = key;
				const useRef = ref ?? entry.id ?? entry.rel ?? "";
				const useGroup = ref !== void 0 ? group ?? null : entry.group ?? null;
				setContent({
					kind: "detail",
					key: useKey,
					entry,
					note: null,
					highlight: query.trim()
				});
				setRelLinks(null);
				setError(null);
				setLoading(true);
				try {
					const note = await controller.sectionGet(useKey, useRef, useGroup ?? void 0);
					if (seq === detailSeq.current) setContent((c) => c.kind === "detail" ? {
						...c,
						note
					} : c);
				} catch (err) {
					if (seq === detailSeq.current) setError(msg(err));
				} finally {
					if (seq === detailSeq.current) setLoading(false);
				}
				(async () => {
					try {
						const [bl, rl] = await Promise.all([controller.backlinks(useRef), controller.related(useRef)]);
						if (seq !== detailSeq.current) return;
						setRelLinks({
							backlinks: Array.isArray(bl) ? bl : [],
							related: Array.isArray(rl) ? rl : []
						});
					} catch {}
				})();
			};
			const jumpToRef = (hit) => {
				const key = sectionOfRel(hit.path);
				if (!key) return;
				openDetail({
					rel: hit.path,
					title: hit.title ?? hit.path
				}, key, hit.title ?? hit.path, null);
			};
			const openWikiTitle = (title) => {
				const t = title.trim();
				if (!t) return;
				(async () => {
					try {
						const hits = await controller.crossSearch(t);
						const hit = Array.isArray(hits) && hits.length > 0 ? hits[0] : null;
						if (hit) {
							const key = sectionOfRel(hit.rel) ?? activeTab;
							openDetail(hit, key, hit.title ?? hit.rel ?? t, hit.group ?? null);
							return;
						}
					} catch {}
					openDetail({
						rel: t,
						title: t
					}, activeTab, t, null);
				})();
			};
			const backToOverview = () => {
				detailSeq.current++;
				setContent({ kind: "overview" });
				setConfirmEntry(null);
				setError(null);
			};
			const openCreate = () => {
				setFormState({});
				setContent({
					kind: "form",
					key: activeTab,
					entry: null
				});
				setError(null);
			};
			const openEdit = (entry, note, key) => {
				setFormState(toForm(key, note));
				setContent({
					kind: "form",
					key,
					entry
				});
				setError(null);
			};
			const setField = (name, value) => setFormState((f) => ({
				...f,
				[name]: value
			}));
			const submitForm = async (e) => {
				e.preventDefault();
				if (content.kind !== "form") return;
				const key = content.key;
				setSaving(true);
				setError(null);
				try {
					const args = buildArgs(key, formState);
					if (content.entry?.id) args.id = content.entry.id;
					await controller.sectionUpsert(key, args);
					setFormState({});
					setContent({ kind: "overview" });
					setConfirmEntry(null);
					await reload(key, "", activeGroup);
				} catch (err) {
					setError(msg(err));
				} finally {
					setSaving(false);
				}
			};
			const doDelete = async () => {
				if (content.kind !== "detail" || !confirmEntry) return;
				const key = content.key;
				setLoading(true);
				setError(null);
				try {
					if (!await controller.sectionRemove(key, confirmEntry.id ?? confirmEntry.rel, confirmEntry.group)) setError("删除失败：未找到该条目");
					setConfirmEntry(null);
					setContent({ kind: "overview" });
					await reload(key, "", activeGroup);
				} catch (err) {
					setError(msg(err));
				} finally {
					setLoading(false);
				}
			};
			const openInsight = (key) => {
				if (content.kind === "insight" && content.insight === key) {
					setContent({ kind: "overview" });
					return;
				}
				setContent({
					kind: "insight",
					insight: key
				});
				setInsightData(null);
				setError(null);
				(async () => {
					try {
						let data;
						if (key === "status") data = await controller.getStatus();
						else if (key === "tagCloud") data = await controller.tagCloud();
						else if (key === "graph") data = await controller.graph(activeGroup ?? null);
						else data = await controller.getDoctor();
						setInsightData(data ?? { info: "先在左侧 RepoWiki 选中一个仓库分组，再查看依赖图谱。" });
					} catch (err) {
						setInsightData({ error: msg(err) });
					}
				})();
			};
			const refreshJobs = (0, react.useCallback)(async () => {
				try {
					const r = await controller.ingestStatus();
					setJobs(Array.isArray(r.jobs) ? r.jobs : []);
				} catch {}
			}, [controller]);
			const loadWorkspaces = (0, react.useCallback)(() => {
				setWorkspaces(controller.listWorkspaces());
			}, [controller]);
			/** 把向导里的模型选项（'provider/model' / ''）解成 host 要的 {provider,model}。 */
			const resolveScanModel = () => {
				const s = scanModel.trim();
				if (s) {
					const i = s.indexOf("/");
					if (i > 0 && i < s.length - 1) return {
						provider: s.slice(0, i),
						model: s.slice(i + 1)
					};
				}
				return catalog?.default ?? null;
			};
			const openScan = (mode, preset) => {
				setScanMode(mode);
				setScanDir(preset?.dir ?? scanDir ?? workspaces[0]?.path ?? "");
				setScanRepo(preset?.repoName ?? (preset?.dir ? titleFromPath(preset.dir) : scanRepo));
				setScanOpen(true);
				if (!catalog && !catalogBusy) {
					setCatalogBusy(true);
					controller.listModels().then((c) => setCatalog(c)).catch(() => setCatalog({
						available: false,
						models: [],
						default: null
					})).finally(() => setCatalogBusy(false));
				}
			};
			const submitScan = async (e) => {
				e.preventDefault();
				const dir = scanDir.trim();
				if (!dir) {
					setError("请填写要扫描的项目文件夹路径");
					return;
				}
				setIngestBusy(true);
				setError(null);
				try {
					const options = {
						dir,
						...scanRepo.trim() ? { repoName: scanRepo.trim() } : {},
						maxFiles: Number(scanMax) > 0 ? Number(scanMax) : void 0,
						depth: Number(scanDepth) > 0 ? Number(scanDepth) : void 0,
						model: resolveScanModel()
					};
					if (scanMode === "diff") await controller.rescanDiff(options);
					else await controller.ingestProject(options);
					setScanOpen(false);
					setActiveTab("wiki");
					await refreshJobs();
				} catch (err) {
					setError(msg(err));
				} finally {
					setIngestBusy(false);
				}
			};
			const controlIngest = async (op, jobId) => {
				setIngestBusy(true);
				setError(null);
				try {
					if (op === "pause") await controller.pauseIngest(jobId);
					else if (op === "resume") await controller.resumeIngest(jobId);
					else await controller.cancelIngest(jobId);
					await refreshJobs();
				} catch (err) {
					setError(msg(err));
				} finally {
					setIngestBusy(false);
				}
			};
			const startIngestPath = async (path, title) => {
				setIngestBusy(true);
				setError(null);
				try {
					await controller.ingestProject({
						dir: path,
						...title && title.trim() ? { repoName: title.trim() } : {},
						model: resolveScanModel()
					});
					await refreshJobs();
				} catch (err) {
					setError(msg(err));
				} finally {
					setIngestBusy(false);
				}
			};
			const viewProject = (repoName) => {
				setActiveTab("wiki");
				setQuery("");
				setActiveGroup(repoName);
				setContent({ kind: "overview" });
				setConfirmEntry(null);
				setError(null);
			};
			const visibleEntries = (0, react.useMemo)(() => typeFilter ? (entries ?? []).filter((e) => typeKeyOf(e, activeTab) === typeFilter) : entries ?? [], [
				entries,
				typeFilter,
				activeTab
			]);
			const tree = (0, react.useMemo)(() => buildTree(visibleEntries, activeTab), [visibleEntries, activeTab]);
			const wikiRepoCards = (0, react.useMemo)(() => {
				if (activeTab !== "wiki" || activeGroup) return [];
				const agg = /* @__PURE__ */ new Map();
				for (const e of entries ?? []) {
					const g = e.group ?? "未分组";
					const cur = agg.get(g) ?? {
						group: g,
						count: 0,
						updated: null
					};
					cur.count += 1;
					if (!cur.updated || String(e.updated ?? "") > String(cur.updated)) cur.updated = e.updated ?? null;
					agg.set(g, cur);
				}
				return [...agg.values()].sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
			}, [
				entries,
				activeTab,
				activeGroup
			]);
			const scanJobs = (0, react.useMemo)(() => {
				const live = (jobs ?? []).filter((j) => j.status === "running" || j.status === "paused");
				const rest = (jobs ?? []).filter((j) => j.status !== "running" && j.status !== "paused").sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));
				return live.length > 0 ? [...live, ...rest.slice(0, 1)] : rest.slice(0, 1);
			}, [jobs]);
			const cardTypes = (0, react.useMemo)(() => {
				const m = /* @__PURE__ */ new Map();
				for (const e of entries ?? []) {
					const k = typeKeyOf(e, activeTab);
					m.set(k, (m.get(k) ?? 0) + 1);
				}
				return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
			}, [entries, activeTab]);
			const recentEntries = (0, react.useMemo)(() => [...visibleEntries ?? []].sort((a, b) => String(b.updated ?? "").localeCompare(String(a.updated ?? ""))).slice(0, 9), [visibleEntries]);
			const isOpen = (node) => expanded[node.key] !== void 0 ? expanded[node.key] : node.kind === "overview" || node.kind === "module" || node.kind === "group" && !!activeGroup;
			const toggleNode = (key) => setExpanded((prev) => ({
				...prev,
				[key]: !prev[key]
			}));
			const countLeaves = (node) => node.kind === "file" ? 1 : node.children.reduce((n, c) => n + countLeaves(c), 0);
			const selectedRel = content.kind === "detail" ? content.entry.rel : null;
			const renderTree = (nodes, depth) => nodes.map((node) => {
				if (node.kind === "file" && node.children.length === 0) {
					const active = node.entry && selectedRel === node.entry.rel;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: `cardian-kt-tree-item${active ? " cardian-kt-tree-item--active" : ""}`,
						style: { paddingLeft: `${10 + depth * 14}px` },
						onClick: () => node.entry && openDetail(node.entry),
						title: node.label,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "file",
								size: 13
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-tree-title",
								children: highlightTitle(node.label, query.trim())
							}),
							node.entry?.analysisLevel === "ai" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-tree-badge",
								children: "AI"
							}),
							node.entry?.analysisLevel === "static" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-tree-badge",
								children: "骨架"
							}),
							node.entry && node.entry.status !== "published" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "cardian-kt-tree-meta",
								children: ["#", node.entry.status]
							})
						]
					}, node.key);
				}
				const open = isOpen(node);
				const branchIcon = node.kind === "overview" ? "knowledge" : node.kind === "module" ? "module" : open ? "folderOpen" : "folder";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `cardian-kt-tree-branch${node.entry ? " cardian-kt-tree-branch--card" : ""}`,
					style: { paddingLeft: `${8 + depth * 14}px` },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "cardian-kt-tree-node",
						onClick: () => toggleNode(node.key),
						"aria-expanded": open,
						title: node.label,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `cardian-kt-chev${open ? " cardian-kt-chev--open" : ""}`,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "chevron",
									size: 11,
									strokeWidth: 2.4
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: branchIcon,
								size: 13
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-tree-title",
								children: node.label
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-tree-count",
								children: countLeaves(node)
							})
						]
					}), node.entry && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "cardian-kt-tree-openbtn",
						onClick: () => node.entry && openDetail(node.entry),
						title: "打开这张卡片",
						"aria-label": "打开这张卡片",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "file",
							size: 11
						})
					})]
				}), open && node.children.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: renderTree(node.children, depth + 1) })] }, node.key);
			});
			if (!controller.open) return null;
			const rail = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: "cardian-kt-rail",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-searchwrap",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "search",
								size: 13
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "cardian-kt-search",
								value: query,
								onChange: (e) => setQuery(e.target.value),
								placeholder: `搜索${SECTION_TITLES[activeTab]}…`,
								"aria-label": "搜索"
							}),
							query && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-search-clear",
								onClick: () => setQuery(""),
								"aria-label": "清空搜索",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "close",
									size: 11,
									strokeWidth: 2.4
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
						className: "cardian-kt-nav",
						role: "tablist",
						"aria-label": "知识分区",
						children: SECTIONS.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "tab",
							"aria-selected": activeTab === s.key,
							className: `cardian-kt-nav-item${activeTab === s.key ? " cardian-kt-nav-item--active" : ""}`,
							onClick: () => switchTab(s.key),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: s.icon,
									size: 15
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-nav-label",
									children: s.label
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-nav-count",
									children: counts[s.key]
								})
							]
						}, s.key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-rail-tree",
						children: [
							cardTypes.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-chips",
								role: "group",
								"aria-label": "按类型筛选",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `cardian-kt-chip-f${typeFilter === null ? " cardian-kt-chip-f--active" : ""}`,
									onClick: () => setTypeFilter(null),
									children: "全部"
								}), cardTypes.map(([k, n]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `cardian-kt-chip-f${typeFilter === k ? " cardian-kt-chip-f--active" : ""}`,
									onClick: () => setTypeFilter(typeFilter === k ? null : k),
									children: [
										k,
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-chip-n",
											children: n
										})
									]
								}, k))]
							}),
							groupPool.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-chips",
								role: "group",
								"aria-label": "分组筛选",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `cardian-kt-chip-f${activeGroup === null ? " cardian-kt-chip-f--active" : ""}`,
									onClick: () => setActiveGroup(null),
									children: "全部组"
								}), groupPool.map((g) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `cardian-kt-chip-f${activeGroup === g ? " cardian-kt-chip-f--active" : ""}`,
									onClick: () => setActiveGroup(activeGroup === g ? null : g),
									title: g,
									children: g
								}, g))]
							}),
							loading && entries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: "加载中…"
							}),
							!loading && visibleEntries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: query.trim() ? `没有匹配「${query.trim()}」的结果` : "这个分区还是空的"
							}),
							query.trim() && !loading ? visibleEntries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `cardian-kt-tree-item${selectedRel === entry.rel ? " cardian-kt-tree-item--active" : ""}`,
								onClick: () => openDetail(entry),
								title: entry.title,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "file",
										size: 13
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-tree-title",
										children: highlightTitle(entry.title, query.trim())
									}),
									entry.group && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-tree-meta",
										children: entry.group
									})
								]
							}, entry.rel ?? entry.id)) : renderTree(tree, 0)
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-rail-foot",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "cardian-kt-rail-foot-label",
							children: "深度洞察"
						}), INSIGHTS.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: `cardian-kt-nav-item cardian-kt-nav-item--flat${content.kind === "insight" && content.insight === s.key ? " cardian-kt-nav-item--active" : ""}`,
							onClick: () => openInsight(s.key),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: s.icon,
								size: 14
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-nav-label",
								children: s.label
							})]
						}, s.key))]
					})
				]
			});
			const statCards = SECTIONS.map((s) => ({
				...s,
				n: counts[s.key]
			}));
			const overviewView = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cardian-kt-scroll",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cardian-kt-page",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cardian-kt-stats",
							children: statCards.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `cardian-kt-stat${activeTab === s.key ? " cardian-kt-stat--active" : ""}`,
								onClick: () => switchTab(s.key),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-stat-icon",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: s.icon,
											size: 17
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-stat-num",
										children: s.n
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-stat-label",
										children: s.label
									})
								]
							}, s.key))
						}),
						activeTab === "wiki" && !activeGroup && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-scan-cta",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "cardian-kt-scan-cta-main",
									onClick: () => openScan("full"),
									disabled: ingestBusy,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "sparkle",
											size: 16
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-scan-cta-label",
											children: "AI 扫描项目 · 建立知识库"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-scan-cta-sub",
											children: "先由模型把项目梳理成「总览 → 模块」层级，再逐文件回填职责/关键实现/依赖/注意点；全程只读目标仓库，写入只落在知识库。"
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-cta-side",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "cardian-kt-ws-action",
										onClick: () => openScan("diff"),
										disabled: ingestBusy,
										title: "只重扫磁盘上新增/变更的文件，并清理已删除文件的孤儿卡",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "diff",
											size: 12
										}), " 仅扫描变更"]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-scan-cta-model",
										children: catalogBusy ? "模型目录加载中…" : !catalog ? "未取到模型目录（将仅生成静态骨架卡）" : !catalog.available ? "宿主无 llm 服务 → 仅生成静态骨架卡" : catalog.default ? `默认模型：${catalog.default.provider}/${catalog.default.model}` : catalog.models.length > 0 ? "宿主未设默认模型，请在向导里选一个" : "宿主未配置任何模型 → 仅生成静态骨架卡"
									})]
								})]
							}),
							scanJobs.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScanProgress, {
								job,
								busy: ingestBusy,
								onView: viewProject,
								onControl: controlIngest,
								onRescan: (dir, repoName) => openScan("diff", {
									dir,
									repoName
								})
							}, job.jobId)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-project-dock",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cardian-kt-project-dock-head",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "cardian-kt-project-dock-title",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "ingest",
												size: 14
											}), " 已打开的工作区（快捷沉淀）"]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "cardian-kt-iconbtn",
											onClick: loadWorkspaces,
											title: "刷新工作区列表",
											"aria-label": "刷新工作区列表",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "refresh",
												size: 13
											})
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "cardian-kt-project-dock-hint",
										children: "点「沉淀」用上方选定的模型（默认取宿主默认模型）直接扫这个目录；点「向导」可改模型、文件上限与层级深度。进度与暂停/继续见上方进度卡。"
									}),
									workspaces.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "cardian-kt-hint",
										children: "没有可用的工作区。先在侧边栏打开一个工作区目录，再回来点「沉淀」。"
									}),
									workspaces.map((w) => {
										const job = jobs.find((j) => sameDir(j.dir, w.path));
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cardian-kt-ws-row",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "cardian-kt-ws-info",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "cardian-kt-ws-title",
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
																name: "folder",
																size: 13
															}),
															" ",
															w.title || titleFromPath(w.path)
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "cardian-kt-ws-path",
														title: w.path,
														children: w.path
													})]
												}),
												job && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "cardian-kt-ws-state",
													children: [jobStatusText(job), job.status === "running" || job.status === "paused" ? ` ${job.done}/${job.total}` : ""]
												}),
												(!job || job.status === "done" || job.status === "error" || job.status === "cancelled") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "cardian-kt-ws-action",
													onClick: () => startIngestPath(w.path, w.title),
													disabled: ingestBusy,
													children: job && job.status === "error" ? "重试" : job && job.status === "done" ? "重扫" : "沉淀"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "cardian-kt-ws-action",
													onClick: () => openScan("full", {
														dir: w.path,
														repoName: w.title
													}),
													disabled: ingestBusy,
													children: "向导"
												})
											]
										}, w.id || w.path);
									})
								]
							}),
							wikiRepoCards.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: "cardian-kt-h3",
								children: "已沉淀的仓库"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cardian-kt-repo-grid",
								children: wikiRepoCards.map((r) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "cardian-kt-repo-card",
									onClick: () => setActiveGroup(r.group),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-repo-icon",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "repo",
												size: 16
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-repo-name",
											children: r.group
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "cardian-kt-repo-meta",
											children: [
												r.count,
												" 页 · 更新于 ",
												fmtDate(r.updated) || "—"
											]
										})
									]
								}, r.group))
							})] })
						] }),
						loading && entries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "cardian-kt-hint",
							children: "加载中…"
						}),
						!loading && entries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cardian-kt-empty",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-empty-icon",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "empty",
										size: 26
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "cardian-kt-empty-title",
									children: ["还没有", SECTION_TITLES[activeTab]]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "cardian-kt-empty-hint",
									children: [
										activeTab === "cards" && "点右上角「新建」沉淀第一张卡片；或在对活用 cardian.card.upsert 工具写入知识。",
										activeTab === "memory" && "点右上角「新建」记录第一条记忆；或在对活用 cardian.memory.commit 提交。",
										activeTab === "wiki" && "用上方「工作区沉淀」一键扫描项目生成骨架卡，或用 cardian.wiki.ingest 工具扫描仓库。"
									]
								})
							]
						}),
						!loading && entries.length > 0 && visibleEntries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cardian-kt-filter-empty",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "cardian-kt-filter-empty-text",
								children: [
									"当前分区没有类型为「",
									typeFilter,
									"」的条目。"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-chip-f cardian-kt-chip-f--active",
								onClick: () => setTypeFilter(null),
								children: "清除筛选"
							})]
						}),
						visibleEntries.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							className: "cardian-kt-h3",
							children: [
								activeGroup ? `${activeGroup} · ` : "",
								typeFilter ? `类型「${typeFilter}」· ` : "",
								"最近更新"
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cardian-kt-entry-grid",
							children: recentEntries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-entry-card",
								onClick: () => openDetail(entry),
								title: entry.title,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-entry-card-title",
									children: entry.title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-entry-card-meta",
									children: [
										entry.group,
										entry.status !== "published" ? `#${entry.status}` : null,
										fmtDate(entry.updated)
									].filter(Boolean).join(" · ")
								})]
							}, entry.rel ?? entry.id))
						})] })
					]
				})
			});
			const detailView = (() => {
				if (content.kind !== "detail") return null;
				const { entry, note } = content;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cardian-kt-scroll",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-page",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-crumb",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "cardian-kt-back",
										onClick: backToOverview,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "back",
											size: 13
										}), " 返回"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-sep",
										children: "/"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-text",
										children: SECTION_TITLES[content.key]
									}),
									entry.group && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-sep",
										children: "/"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-text",
										children: entry.group
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cardian-kt-flex" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "cardian-kt-iconbtn",
										onClick: () => openEdit(entry, note, content.key),
										title: "编辑",
										"aria-label": "编辑",
										disabled: !note,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "edit",
											size: 14
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "cardian-kt-iconbtn cardian-kt-iconbtn--danger",
										onClick: () => setConfirmEntry(entry),
										title: "删除",
										"aria-label": "删除",
										disabled: !note,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "trash",
											size: 14
										})
									})
								]
							}),
							loading && !note && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: "加载中…"
							}),
							note && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "cardian-kt-article",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
										className: "cardian-kt-article-title",
										children: note.title ?? entry.title
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cardian-kt-article-meta",
										children: [
											[note.type, note.status !== "published" ? `#${note.status}` : null].filter(Boolean).map((x) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-chip",
												children: String(x)
											}, String(x))),
											note.updated ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "cardian-kt-chip",
												children: ["更新于 ", fmtDate(note.updated)]
											}) : null,
											typeof note.confidence === "number" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "cardian-kt-chip",
												children: ["置信度 ", note.confidence]
											}),
											Array.isArray(note.tags) && note.tags.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "cardian-kt-chip cardian-kt-chip--tag",
												children: ["#", t]
											}, t))
										]
									}),
									note.summary ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "cardian-kt-lead",
										children: String(note.summary)
									}) : null,
									(() => {
										const term = content.highlight ?? "";
										const hits = term ? countMatches(String(note.body ?? ""), term) : 0;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [term && hits > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cardian-kt-matches",
											children: [
												"共 ",
												hits,
												" 处匹配「",
												term,
												"」"
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Markdown, {
											text: String(note.body ?? ""),
											highlight: term,
											onWikiSelect: openWikiTitle
										})] });
									})(),
									relLinks && (relLinks.backlinks.length > 0 || relLinks.related.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cardian-kt-rel",
										children: [relLinks.related.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cardian-kt-rel-block",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
												className: "cardian-kt-rel-label",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
													name: "link",
													size: 12
												}), " 关联条目"]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "cardian-kt-rel-chips",
												children: relLinks.related.map((r) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "cardian-kt-rel-chip",
													onClick: () => jumpToRef(r),
													title: r.relation ?? "related",
													children: r.title ?? r.path
												}, `r:${r.path}`))
											})]
										}), relLinks.backlinks.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cardian-kt-rel-block",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
												className: "cardian-kt-rel-label",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
													name: "ingest",
													size: 12
												}), " 被引用"]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "cardian-kt-rel-chips",
												children: relLinks.backlinks.map((r) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "cardian-kt-rel-chip",
													onClick: () => jumpToRef(r),
													title: r.path,
													children: r.title ?? r.path
												}, `b:${r.path}`))
											})]
										})]
									})
								]
							}),
							!loading && !note && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: "无法加载该条目。"
							})
						]
					}), confirmEntry && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-confirm",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "cardian-kt-confirm-text",
							children: [
								"确定删除「",
								confirmEntry.title,
								"」？此操作不可恢复。"
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cardian-kt-confirm-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-btn",
								onClick: () => setConfirmEntry(null),
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-btn cardian-kt-btn--danger",
								onClick: doDelete,
								disabled: loading,
								children: loading ? "删除中…" : "确认删除"
							})]
						})]
					})]
				});
			})();
			const formView = (() => {
				if (content.kind !== "form") return null;
				const key = content.key;
				const isEdit = content.entry !== null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cardian-kt-scroll",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-page",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cardian-kt-crumb",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "cardian-kt-back",
									onClick: backToOverview,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: "back",
										size: 13
									}), " 返回"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-crumb-sep",
									children: "/"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cardian-kt-crumb-text",
									children: isEdit ? `编辑 · ${content.entry?.title ?? ""}` : `新建 · ${SECTION_TITLES[key]}`
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: "cardian-kt-form",
							onSubmit: submitForm,
							children: [(SECTION_FIELDS[key] ?? []).map((f) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: `cardian-kt-form-field${f.wide || f.type === "textarea" ? " cardian-kt-form-field--wide" : ""}`,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cardian-kt-form-label",
										children: [f.label, f.required ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
											className: "cardian-kt-form-required",
											children: " *"
										}) : null]
									}),
									f.type === "textarea" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "cardian-kt-form-textarea",
										value: formState[f.name] ?? "",
										onChange: (e) => setField(f.name, e.target.value),
										placeholder: f.placeholder,
										rows: f.name === "content" ? 8 : 3,
										required: f.required
									}) : f.type === "select" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "cardian-kt-form-input",
										value: formState[f.name] ?? "",
										onChange: (e) => setField(f.name, e.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "（默认）"
										}), (f.options ?? []).map((o) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: o,
											children: o
										}, o))]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "cardian-kt-form-input",
										type: f.type,
										value: formState[f.name] ?? "",
										onChange: (e) => setField(f.name, e.target.value),
										placeholder: f.placeholder,
										required: f.required
									}),
									key === "wiki" && f.name === "repo" && groupPool.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cardian-kt-form-hint",
										children: ["已有仓库：", groupPool.join("、")]
									}),
									f.hint && !(key === "wiki" && f.name === "repo") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-form-hint",
										children: f.hint
									})
								]
							}, f.name)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-form-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "cardian-kt-btn",
									onClick: backToOverview,
									children: "取消"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									className: "cardian-kt-btn cardian-kt-btn--primary",
									disabled: saving,
									children: saving ? "保存中…" : isEdit ? "保存修改" : "创建"
								})]
							})]
						})]
					})
				});
			})();
			const insightView = (() => {
				if (content.kind !== "insight") return null;
				const meta = INSIGHTS.find((s) => s.key === content.insight);
				const d = insightData;
				const failed = d && !Array.isArray(d) && "error" in d && d.error;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cardian-kt-scroll",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-page",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-crumb",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "cardian-kt-back",
										onClick: backToOverview,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "back",
											size: 13
										}), " 返回"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-sep",
										children: "/"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-crumb-text",
										children: meta.label
									})
								]
							}),
							!insightData && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: "加载洞察中…"
							}),
							failed && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "cardian-kt-hint",
								children: ["读取失败：", d.error]
							}),
							d && !Array.isArray(d) && d.info && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cardian-kt-hint",
								children: d.info
							}),
							content.insight === "status" && d && !Array.isArray(d) && !failed && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cardian-kt-stats",
								children: SECTIONS.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-stat cardian-kt-stat--static",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-stat-icon",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: s.icon,
												size: 17
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-stat-num",
											children: (d.sections ?? {})[s.key] ?? 0
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-stat-label",
											children: s.label
										})
									]
								}, s.key))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-insight-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "cardian-kt-insight-line",
										children: ["仓库：", d.repos && d.repos.length > 0 ? d.repos.join("、") : "暂无沉淀"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "cardian-kt-insight-line",
										children: [
											"过期条目：",
											typeof d.stale === "number" ? `${d.stale} 条` : "—",
											typeof d.stale === "number" && d.stale > 0 ? "（引用前请核实内容）" : ""
										]
									}),
									d.vaultPath && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "cardian-kt-insight-line",
										title: d.vaultPath,
										children: ["仓库路径：", d.vaultPath]
									})
								]
							})] }),
							content.insight === "tagCloud" && Array.isArray(d) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-tagcloud",
								children: [d.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cardian-kt-hint",
									children: "还没有带标签的条目。"
								}), (() => {
									const max = Math.max(1, ...d.map((t) => t.count));
									return d.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cardian-kt-chip cardian-kt-chip--tag",
										style: { fontSize: `${11 + Math.round(t.count / max * 6)}px` },
										children: [
											"#",
											t.tag,
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-chip-n",
												children: t.count
											})
										]
									}, t.tag));
								})()]
							}),
							content.insight === "graph" && d && !Array.isArray(d) && !failed && (() => {
								const gd = d;
								const gnodes = (gd.nodes ?? []).filter((x) => x && x.path);
								const gedges = (gd.edges ?? []).filter((x) => x && x.from && x.to);
								const top = Object.entries(gd.callers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
								const max = Math.max(1, ...top.map((x) => x[1]));
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-insight-card cardian-kt-graph-card",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cardian-kt-graph-head",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: "cardian-kt-insight-line",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
													name: "graph",
													size: 13
												}),
												" 节点 ",
												gnodes.length,
												" · 依赖边 ",
												gedges.length
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-graph-tip",
											children: "悬停高亮邻接，点击节点打开对应条目"
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GraphView, {
										nodes: gnodes,
										edges: gedges,
										onSelect: (nd) => void openDetail({
											rel: nd.path,
											title: nd.title ?? titleFromPath(nd.path),
											path: nd.path
										}, "wiki", nd.title ?? nd.path, activeGroup)
									})]
								}), top.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-insight-card",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "cardian-kt-rel-label",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "link",
											size: 12
										}), " 被引排行"]
									}), top.map(([p, c]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cardian-kt-bar-row",
										title: p,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-bar-name",
												children: titleFromPath(p)
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-bar-track",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cardian-kt-bar-value",
													style: { width: `${c / max * 100}%` }
												})
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "cardian-kt-bar-num",
												children: ["被引 ", c]
											})
										]
									}, p))]
								})] });
							})(),
							content.insight === "doctor" && d && !Array.isArray(d) && !failed && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cardian-kt-insight-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: `cardian-kt-doctor-head${d.healthy ? " cardian-kt-doctor-head--ok" : ""}`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
										name: d.healthy ? "check" : "alert",
										size: 14
									}), d.healthy ? "知识库状态健康" : "有若干问题需要处理"]
								}), (d.problems ?? []).map((p, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "cardian-kt-insight-line",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `cardian-kt-level cardian-kt-level--${p.level === "error" ? "error" : p.level === "warn" ? "warn" : "info"}`,
										children: p.level
									}), p.issue]
								}, i))]
							})
						]
					})
				});
			})();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cardian-kt-panel",
				role: "dialog",
				"aria-label": "知识中心",
				ref: panelRef,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "cardian-kt-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-logo",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "knowledge",
									size: 17
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-title",
								title: vaultPath ? `知识库：${vaultPath}` : void 0,
								children: "知识中心"
							}),
							vaultPath && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-vault",
								title: vaultPath,
								children: titleFromPath(vaultPath.replace(/[\\/]+$/, ""))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cardian-kt-flex" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cardian-kt-btn cardian-kt-btn--primary",
								onClick: openCreate,
								title: `新建${SECTION_TITLES[activeTab]}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "plus",
									size: 13,
									strokeWidth: 2.2
								}), " 新建"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-iconbtn",
								onClick: () => reload(activeTab, query, activeGroup),
								"aria-label": "刷新",
								title: "刷新",
								disabled: loading,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "refresh",
									size: 14
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-iconbtn",
								onClick: () => {
									controller.open = false;
									controller.emit();
								},
								"aria-label": "关闭",
								title: "关闭",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "close",
									size: 14,
									strokeWidth: 2.2
								})
							})
						]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-banner",
						role: "alert",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
								name: "alert",
								size: 13
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cardian-kt-banner-text",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cardian-kt-banner-close",
								onClick: () => setError(null),
								"aria-label": "关闭错误提示",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
									name: "close",
									size: 11,
									strokeWidth: 2.4
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cardian-kt-layout",
						children: [rail, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
							className: "cardian-kt-main",
							children: [
								content.kind === "overview" && overviewView,
								content.kind === "detail" && detailView,
								content.kind === "form" && formView,
								content.kind === "insight" && insightView
							]
						})]
					}),
					scanOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cardian-kt-scan-overlay",
						role: "presentation",
						onClick: () => setScanOpen(false),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: "cardian-kt-scan",
							onClick: (e) => e.stopPropagation(),
							onSubmit: (e) => void submitScan(e),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-head",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cardian-kt-scan-title",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: scanMode === "diff" ? "diff" : "sparkle",
											size: 15
										}), scanMode === "diff" ? "仅扫描变更 · 增量沉淀" : "AI 扫描项目 · 建立知识库"]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "cardian-kt-iconbtn",
										onClick: () => setScanOpen(false),
										"aria-label": "关闭向导",
										title: "关闭",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
											name: "close",
											size: 13,
											strokeWidth: 2.2
										})
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cardian-kt-scan-note",
									children: scanMode === "diff" ? "只重扫磁盘上新增/变更的文件，删除的文件同步清理孤儿卡；未变更的卡片不重写。" : "三个阶段：① 只读枚举文件 → ② 模型规划「总览 → 模块」层级 → ③ 逐文件回填语义正文。全过程对目标仓库只读，写入只落在知识库 vault。"
								}),
								workspaces.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-scan-label",
										children: "已打开的工作区"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "cardian-kt-scan-ws",
										children: workspaces.map((w) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: `cardian-kt-chip${scanDir === w.path ? " cardian-kt-chip--active" : ""}`,
											onClick: () => {
												setScanDir(w.path);
												setScanRepo(w.title || titleFromPath(w.path));
											},
											title: w.path,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
													name: "folder",
													size: 11
												}),
												" ",
												w.title || titleFromPath(w.path)
											]
										}, w.id || w.path))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "cardian-kt-scan-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cardian-kt-scan-label",
										children: "项目文件夹（绝对路径）*"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "cardian-kt-scan-input",
										value: scanDir,
										onChange: (e) => setScanDir(e.target.value),
										placeholder: "例如 D:/projects/my-app",
										spellCheck: false,
										autoFocus: true
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-row",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "cardian-kt-scan-field",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-scan-label",
												children: "项目名（可选）"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: "cardian-kt-scan-input",
												value: scanRepo,
												onChange: (e) => setScanRepo(e.target.value),
												placeholder: "留空则取文件夹名",
												spellCheck: false
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "cardian-kt-scan-field cardian-kt-scan-field--sm",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-scan-label",
												children: "文件上限"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: "cardian-kt-scan-input",
												type: "number",
												min: 1,
												max: 500,
												value: scanMax,
												onChange: (e) => setScanMax(e.target.value),
												title: "单次最多处理多少个文件，超出部分截断"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "cardian-kt-scan-field cardian-kt-scan-field--sm",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cardian-kt-scan-label",
												children: "层级深度"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: "cardian-kt-scan-input",
												type: "number",
												min: 1,
												max: 4,
												value: scanDepth,
												onChange: (e) => setScanDepth(e.target.value),
												title: "模块划分参考的目录层级深度"
											})]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-scan-label",
											children: "生成模型"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: "cardian-kt-scan-input",
											value: scanModel,
											onChange: (e) => setScanModel(e.target.value),
											disabled: catalogBusy,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: catalog?.default ? `宿主默认（${catalog.default.provider}/${catalog.default.model}）` : "宿主默认（未设置 → 仅骨架）"
											}), (catalog?.models ?? []).map((m) => {
												const v = `${m.provider}/${m.model}`;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: v,
													children: [
														m.title || m.model,
														" · ",
														m.provider
													]
												}, v);
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cardian-kt-scan-help",
											children: catalogBusy ? "模型目录加载中…" : catalog && !catalog.available ? "宿主未暴露 llm 服务：将降级为仅生成静态骨架卡，可稍后配好模型重扫。" : (catalog?.models ?? []).length === 0 ? "未取到可选模型：将沿用宿主默认模型，若也没有则仅生成静态骨架卡。" : `已取到 ${(catalog?.models ?? []).length} 个模型；逐文件回填会按串行推进以便控制进度与暂停。`
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cardian-kt-scan-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "cardian-kt-btn",
										onClick: () => setScanOpen(false),
										children: "取消"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "submit",
										className: "cardian-kt-btn cardian-kt-btn--primary",
										disabled: ingestBusy || !scanDir.trim(),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
												name: "sparkle",
												size: 13
											}),
											" ",
											ingestBusy ? "提交中…" : scanMode === "diff" ? "开始增量扫描" : "开始扫描"
										]
									})]
								})
							]
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			title: "知识中心",
			cards: "知识卡片",
			memory: "记忆",
			wiki: "RepoWiki",
			search: "搜索…",
			empty: "暂无内容，先用工具沉淀知识吧",
			noResults: "没有匹配结果",
			open: "知识中心",
			close: "关闭",
			refresh: "刷新",
			items: "条"
		};
		const en = {
			title: "Knowledge Center",
			cards: "Cards",
			memory: "Memory",
			wiki: "RepoWiki",
			search: "Search…",
			empty: "Nothing here yet — capture some knowledge first",
			noResults: "No matches",
			open: "Knowledge Center",
			close: "Close",
			refresh: "Refresh",
			items: "items"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "cardian.sidebar";
		const inject = [
			"slots",
			"locale",
			"remote"
		];
		function apply(ctx) {
			console.log("[cardian] 插件客户端已加载 (apply)，开始注册槽位");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "cardian: dictionaries");
			const controller = new KnowledgeController(ctx);
			ctx.effect(() => {
				try {
					return ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
						name: "sidebar.footer.action",
						id: "dsh-cardian",
						order: 10,
						locale: NS,
						inject: () => controller.triggerProps()
					}, KnowledgeTreeTrigger));
				} catch (err) {
					console.warn("[cardian] sidebar.footer.action 槽注册失败:", err);
					return;
				}
			}, "cardian: 侧边栏触发按钮");
			ctx.effect(() => {
				try {
					return ctx.slots.inject("shell.overlay", () => ctx.slots.register({
						name: "shell.overlay",
						id: "dsh-cardian",
						order: 10,
						locale: NS,
						inject: () => controller.panelProps()
					}, KnowledgeTreePanelSafe));
				} catch (err) {
					console.warn("[cardian] shell.overlay 槽注册失败:", err);
					return;
				}
			}, "cardian: 知识树面板");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map