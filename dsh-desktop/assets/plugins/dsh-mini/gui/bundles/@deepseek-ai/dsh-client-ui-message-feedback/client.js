window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-message-feedback",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/controller.js
		const INITIAL_VIEW = Object.freeze({
			status: "cold",
			items: /* @__PURE__ */ new Map(),
			error: null
		});
		const OK = Object.freeze({ ok: true });
		const DISPOSED = Object.freeze({
			ok: false,
			error: Object.freeze({
				code: "disposed",
				message: "feedback controller is disposed"
			})
		});
		/** Human-readable text for one business failure code. */
		function describe(code) {
			switch (code) {
				case "session-not-found": return "this session is no longer persisted";
				case "target-not-found": return "this message is not a persisted assistant message";
				case "version-conflict": return "feedback changed elsewhere";
				case "note-blank": return "a note must contain a non-whitespace character";
				case "note-too-large": return "the note is too long";
				default: return code;
			}
		}
		/** Build the rejected branch for one business failure code. */
		function fail(code) {
			return {
				ok: false,
				error: {
					code,
					message: describe(code)
				}
			};
		}
		/** Carrier failure rendered with the Host-supplied code and message. */
		function carrierFailure(error) {
			return {
				ok: false,
				error: {
					code: error.code,
					message: error.message
				}
			};
		}
		/**
		* Per-session feedback object layer. One instance backs every per-message
		* control in that Session, so a single list read seeds them all.
		*/
		var MessageFeedbackController = class {
			remote;
			sessionId;
			view = INITIAL_VIEW;
			listeners = /* @__PURE__ */ new Set();
			loadPromise = null;
			operationTail = Promise.resolve();
			disposed = false;
			/**
			* @param remote - the messageFeedback Remote namespace.
			* @param sessionId - Session owning every addressed assistant message.
			*/
			constructor(remote, sessionId) {
				this.remote = remote;
				this.sessionId = sessionId;
			}
			/** Return the cached immutable view. */
			getSnapshot = () => this.view;
			/** Subscribe to view replacement. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/**
			* Load once; a failed load stays retryable.
			* @returns the settled load result, shared by concurrent callers.
			*/
			ensure() {
				if (this.view.status === "ready") return Promise.resolve(OK);
				return this.refresh();
			}
			/**
			* Re-read the authoritative list, collapsing concurrent callers onto one
			* in-flight read.
			*
			* This is the unserialized read used to seed a cold controller, where no
			* mutation can be in flight yet. A reconnect must use {@link resync} instead:
			* an unserialized list response can otherwise arrive after a newer mutation's
			* reply and overwrite the version that mutation just committed.
			* @returns the settled reload result.
			*/
			refresh() {
				if (this.loadPromise !== null) return this.loadPromise;
				this.publish({
					status: "loading",
					items: this.view.items,
					error: null
				});
				const pending = this.load();
				this.loadPromise = pending;
				return pending.finally(() => {
					this.loadPromise = null;
				});
			}
			/**
			* Re-read the list behind this Session's queued mutations, so a reconnect
			* cannot resurrect a version an in-flight mutation already replaced.
			* @returns the settled reload result.
			*/
			resync() {
				return this.mutate(() => this.refresh(), { seed: false });
			}
			/**
			* Create or replace feedback for one message, comparing against the version
			* this controller last observed.
			*
			* The note is resolved here rather than by the caller: `mutate` awaits the
			* one list read first, so this body always sees the committed item, while a
			* control that rendered before that read completed would still be holding
			* `undefined`. Omitting `note` therefore keeps whatever is stored; only
			* {@link clearNote} removes one.
			* @param messageId - target assistant message.
			* @param rating - desired judgment.
			* @param note - replacement explanation; omitted keeps the stored note.
			* @returns the settled mutation result.
			*/
			rate(messageId, rating, note) {
				return this.mutate(async () => {
					const observed = this.view.items.get(messageId);
					return await this.putCommitted(messageId, rating, note ?? observed?.note, observed);
				});
			}
			/**
			* Replace one message's rating with the opposite judgment, or retract it when
			* the committed rating already matches. The decision reads the committed item
			* inside the serialized mutation, so a click that lands before the first list
			* read still toggles against the stored value rather than the empty view a
			* cold control rendered.
			* @param messageId - target assistant message.
			* @param rating - the judgment the human asked for.
			* @returns the settled mutation result.
			*/
			toggle(messageId, rating) {
				return this.mutate(async () => {
					const observed = this.view.items.get(messageId);
					if (observed?.rating === rating) return await this.deleteCommitted(messageId, observed);
					return await this.putCommitted(messageId, rating, observed?.note, observed);
				});
			}
			/**
			* Drop the note while keeping the rating. Absent feedback needs no call.
			* @param messageId - target assistant message.
			* @returns the settled mutation result.
			*/
			clearNote(messageId) {
				return this.mutate(async () => {
					const observed = this.view.items.get(messageId);
					if (observed === void 0 || observed.note === void 0) return OK;
					return await this.putCommitted(messageId, observed.rating, void 0, observed);
				});
			}
			/**
			* Remove feedback for one message. A message with no known item is already
			* in the requested state, so no call is made.
			* @param messageId - target assistant message.
			* @returns the settled mutation result.
			*/
			clear(messageId) {
				return this.mutate(async () => {
					const observed = this.view.items.get(messageId);
					if (observed === void 0) return OK;
					return await this.deleteCommitted(messageId, observed);
				});
			}
			/** Commit one put against the observed version and reconcile a conflict. */
			async putCommitted(messageId, rating, note, observed) {
				const carried = await this.remote.put({
					sessionId: this.sessionId,
					messageId,
					rating,
					...note === void 0 ? {} : { note },
					ifVersion: observed?.version ?? null
				});
				if (!carried.ok) return carrierFailure(carried.error);
				const result = carried.value;
				if (result.ok) {
					this.commit(messageId, result.value);
					return OK;
				}
				if (result.error.code === "version-conflict") this.commit(messageId, result.error.current);
				return fail(result.error.code);
			}
			/** Commit one delete against the observed version and reconcile a conflict. */
			async deleteCommitted(messageId, observed) {
				const carried = await this.remote.delete({
					sessionId: this.sessionId,
					messageId,
					ifVersion: observed.version
				});
				if (!carried.ok) return carrierFailure(carried.error);
				const result = carried.value;
				if (result.ok) {
					this.commit(messageId, null);
					return OK;
				}
				if (result.error.code === "version-conflict") this.commit(messageId, result.error.current);
				return fail(result.error.code);
			}
			/** Drop subscribers and refuse further work when the owning fiber unloads. */
			dispose() {
				this.disposed = true;
				this.listeners.clear();
			}
			/** Fetch the whole sidecar and publish it as the seeded view. */
			async load() {
				try {
					const carried = await this.remote.list({ sessionId: this.sessionId });
					if (this.disposed) return OK;
					if (!carried.ok) {
						this.publish({
							status: "error",
							items: this.view.items,
							error: carried.error.message
						});
						return carrierFailure(carried.error);
					}
					const result = carried.value;
					if (!result.ok) {
						this.publish({
							status: "error",
							items: this.view.items,
							error: describe(result.error.code)
						});
						return fail(result.error.code);
					}
					const items = /* @__PURE__ */ new Map();
					for (const item of result.value.items) items.set(item.messageId, item);
					this.publish({
						status: "ready",
						items,
						error: null
					});
					return OK;
				} catch (error) {
					if (this.disposed) return OK;
					const message = error instanceof Error ? error.message : "message feedback list failed";
					this.publish({
						status: "error",
						items: this.view.items,
						error: message
					});
					return {
						ok: false,
						error: {
							code: "transport",
							message
						}
					};
				}
			}
			/**
			* Serialize one mutation behind this Session's prior mutation so queued
			* operations always compare against the committed version, and translate a
			* transport throw into the same settled shape the controls already render.
			*/
			mutate(operation, options = {}) {
				const guarded = async () => {
					if (this.disposed) return DISPOSED;
					if (options.seed !== false) {
						const loaded = await this.ensure();
						if (!loaded.ok) return loaded;
						if (this.disposed) return DISPOSED;
					}
					try {
						return await operation();
					} catch (error) {
						return {
							ok: false,
							error: {
								code: "transport",
								message: error instanceof Error ? error.message : "message feedback mutation failed"
							}
						};
					}
				};
				const result = this.operationTail.then(guarded, guarded);
				this.operationTail = result.then(() => void 0);
				return result;
			}
			/**
			* Replace one message's entry, keeping every other entry's identity. Only a
			* `mutate` operation reaches this, and `mutate` refuses admission once the
			* controller is disposed, so no disposal guard belongs here; `publish` is
			* the single place that stops notifying after listeners are dropped.
			*/
			commit(messageId, item) {
				const items = new Map(this.view.items);
				if (item === null) items.delete(messageId);
				else items.set(messageId, item);
				this.publish({
					status: "ready",
					items,
					error: null
				});
			}
			/** Replace the view and contain subscriber failures at the observable boundary. */
			publish(view) {
				this.view = Object.freeze(view);
				for (const listener of this.listeners) try {
					listener();
				} catch (error) {
					console.error("[ui-message-feedback] subscriber threw:", error);
				}
			}
		};
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-message-feedback/src/client/MessageFeedbackActions.module.css.mjs
		const css = "._8_XoUG_action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}._8_XoUG_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}._8_XoUG_action:disabled{cursor:default;opacity:.4}._8_XoUG_action[data-active]{color:var(--dsw-alias-label-primary)}._8_XoUG_noteOpen{max-width:220px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;cursor:pointer;background:0 0;border:none;border-radius:14px;padding:0 8px;font-size:13px;line-height:28px;overflow:hidden}._8_XoUG_noteOpen:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}._8_XoUG_noteEditor{align-items:flex-start;gap:6px;display:inline-flex}._8_XoUG_noteInput{border:1px solid var(--dsw-alias-border-secondary);background:var(--dsw-alias-bg-primary);width:260px;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;border-radius:8px;padding:6px 8px;font-size:13px}._8_XoUG_noteSave,._8_XoUG_noteCancel{cursor:pointer;border:none;border-radius:14px;height:28px;padding:0 10px;font-size:13px}._8_XoUG_noteSave{background:var(--dsw-alias-interactive-bg-primary);color:var(--dsw-alias-label-inverse)}._8_XoUG_noteSave:disabled{cursor:default;opacity:.4}._8_XoUG_noteCancel{color:var(--dsw-alias-label-tertiary);background:0 0}._8_XoUG_noteCancel:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}._8_XoUG_failure{color:var(--dsw-alias-label-tertiary);padding-left:4px;font-size:13px;line-height:28px}";
		const tagId = "@deepseek-ai/dsh-client-ui-message-feedback/MessageFeedbackActions.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-message-feedback";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MessageFeedbackActions_module_css_default = {
			"noteSave": "_8_XoUG_noteSave",
			"noteInput": "_8_XoUG_noteInput",
			"noteCancel": "_8_XoUG_noteCancel",
			"action": "_8_XoUG_action",
			"noteOpen": "_8_XoUG_noteOpen",
			"failure": "_8_XoUG_failure",
			"noteEditor": "_8_XoUG_noteEditor"
		};
		//#endregion
		//#region lib/types/client/MessageFeedbackActions.js
		/**
		* Per-message feedback controls: a Like/Dislike pair plus an optional note.
		* Rendered inside the assistant message's IconActions row, so the buttons
		* reuse that row's chrome and sit between copy and branch.
		* @module @deepseek-ai/dsh-client-ui-message-feedback/client/MessageFeedbackActions
		*/
		/**
		* One message's feedback controls.
		* @param props - the owner's message identity, the injected verbs, and the
		* shared feedback hook.
		* @returns the rating buttons, plus the note editor while it is open.
		*/
		function MessageFeedbackActions({ messageId, ensure, rate, toggle, clearNote, useFeedback, t }) {
			const item = useFeedback((view) => view.items.get(messageId));
			const loadFailed = useFeedback((view) => view.status === "error");
			const rating = item?.rating;
			const [noteOpen, setNoteOpen] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const [pending, setPending] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(null);
			const seeded = (0, react.useRef)(false);
			const seed = (0, react.useCallback)(() => {
				if (seeded.current) return;
				seeded.current = true;
				ensure();
			}, [ensure]);
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				alive.current = false;
			}, []);
			const settle = (0, react.useCallback)((result) => {
				if (!alive.current) return;
				setPending(false);
				if (result.ok) {
					setFailure(null);
					return;
				}
				setFailure(result.error?.code === "version-conflict" ? t("error.conflict") : t("error.generic"));
			}, [t]);
			const onRate = (0, react.useCallback)((next) => {
				setPending(true);
				setFailure(null);
				setNoteOpen(false);
				toggle(messageId, next).then(settle);
			}, [
				messageId,
				settle,
				toggle
			]);
			const onSaveNote = (0, react.useCallback)((current) => {
				const trimmed = draft.trim();
				setPending(true);
				setFailure(null);
				(trimmed.length === 0 ? clearNote(messageId) : rate(messageId, current, trimmed)).then((result) => {
					settle(result);
					if (result.ok && alive.current) setNoteOpen(false);
				});
			}, [
				clearNote,
				draft,
				messageId,
				rate,
				settle
			]);
			const openNote = (0, react.useCallback)(() => {
				setDraft(item?.note ?? "");
				setNoteOpen(true);
			}, [item?.note]);
			const likeLabel = rating === "positive" ? t("action.likeActive") : t("action.like");
			const dislikeLabel = rating === "negative" ? t("action.dislikeActive") : t("action.dislike");
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: likeLabel,
					side: "bottom",
					children: (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MessageFeedbackActions_module_css_default.action,
						"aria-label": likeLabel,
						"aria-pressed": rating === "positive",
						"data-active": rating === "positive" || void 0,
						disabled: pending,
						onFocus: seed,
						onPointerEnter: seed,
						onClick: () => {
							onRate("positive");
						},
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLikeOutline16, {})
					})
				}),
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: dislikeLabel,
					side: "bottom",
					children: (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: MessageFeedbackActions_module_css_default.action,
						"aria-label": dislikeLabel,
						"aria-pressed": rating === "negative",
						"data-active": rating === "negative" || void 0,
						disabled: pending,
						onFocus: seed,
						onPointerEnter: seed,
						onClick: () => {
							onRate("negative");
						},
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDislikeOutline16, {})
					})
				}),
				rating !== void 0 && !noteOpen && (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: MessageFeedbackActions_module_css_default.noteOpen,
					onClick: openNote,
					children: item?.note === void 0 ? t("note.open") : item.note
				}),
				rating !== void 0 && noteOpen && (0, react_jsx_runtime.jsxs)("span", {
					className: MessageFeedbackActions_module_css_default.noteEditor,
					children: [
						(0, react_jsx_runtime.jsx)("textarea", {
							className: MessageFeedbackActions_module_css_default.noteInput,
							"aria-label": t("note.aria"),
							placeholder: t("note.placeholder"),
							value: draft,
							rows: 2,
							onChange: (event) => {
								setDraft(event.target.value);
							}
						}),
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MessageFeedbackActions_module_css_default.noteSave,
							disabled: pending,
							onClick: () => {
								onSaveNote(rating);
							},
							children: t("note.save")
						}),
						(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MessageFeedbackActions_module_css_default.noteCancel,
							onClick: () => {
								setNoteOpen(false);
							},
							children: t("note.cancel")
						})
					]
				}),
				failure === null && loadFailed && (0, react_jsx_runtime.jsx)("span", {
					className: MessageFeedbackActions_module_css_default.failure,
					role: "status",
					children: t("error.load")
				}),
				failure !== null && (0, react_jsx_runtime.jsx)("span", {
					className: MessageFeedbackActions_module_css_default.failure,
					role: "status",
					children: failure
				})
			] });
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `feedback` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"action.like": "好的回答",
			"action.likeActive": "取消标记",
			"action.dislike": "有问题的回答",
			"action.dislikeActive": "取消标记",
			"note.open": "补充说明",
			"note.placeholder": "这条回答哪里好，或哪里有问题？（可选）",
			"note.save": "保存",
			"note.cancel": "取消",
			"note.aria": "反馈说明",
			"error.conflict": "这条反馈已在别处改动，已显示最新状态",
			"error.load": "反馈状态加载失败",
			"error.generic": "反馈保存失败"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"action.like": "Good response",
			"action.likeActive": "Remove rating",
			"action.dislike": "Bad response",
			"action.dislikeActive": "Remove rating",
			"note.open": "Add a note",
			"note.placeholder": "What was good, or what went wrong? (optional)",
			"note.save": "Save",
			"note.cancel": "Cancel",
			"note.aria": "Feedback note",
			"error.conflict": "This feedback changed elsewhere; the latest state is shown",
			"error.load": "Could not load feedback",
			"error.generic": "Could not save feedback"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Message feedback plugin, browser half: the Like/Dislike entry in the
		* conversation.chat.assistant-actions strip. One MessageFeedbackController per
		* Session backs every message control in that Session, so a single list read
		* seeds the whole transcript. Mutations go through the generated
		* messageFeedback Remote; the Host owns per-item compare-and-set.
		* @module @deepseek-ai/dsh-client-ui-message-feedback/client
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "feedback";
		/** Required services: the slot registry, the Remote namespace, and the copy. */
		const inject = [
			"slots",
			"remote",
			"remote.messageFeedback",
			"locale"
		];
		/**
		* Client plugin body: the per-message feedback entry and its per-session
		* object layer.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-message-feedback: dictionaries");
			const controllers = /* @__PURE__ */ new Map();
			const controllerFor = (sessionId) => {
				let controller = controllers.get(sessionId);
				if (controller === void 0) {
					controller = new MessageFeedbackController(ctx.remote.messageFeedback, sessionId);
					controllers.set(sessionId, controller);
				}
				return controller;
			};
			ctx.on("connection/reset", () => {
				for (const controller of controllers.values()) if (controller.getSnapshot().status !== "cold") controller.resync();
			});
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				const dispose = ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "feedback",
					order: 10,
					locale: NS,
					inject: (sessionId) => {
						const controller = controllerFor(sessionId);
						return {
							hooks: { feedback: controller },
							ensure: () => controller.ensure(),
							rate: (messageId, rating, note) => controller.rate(messageId, rating, note),
							toggle: (messageId, rating) => controller.toggle(messageId, rating),
							clearNote: (messageId) => controller.clearNote(messageId),
							clear: (messageId) => controller.clear(messageId)
						};
					}
				}, MessageFeedbackActions);
				return () => {
					dispose();
					for (const controller of controllers.values()) controller.dispose();
					controllers.clear();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map