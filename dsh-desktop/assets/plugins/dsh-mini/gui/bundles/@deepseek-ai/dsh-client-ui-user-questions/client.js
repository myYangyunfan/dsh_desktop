window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-user-questions",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region lib/types/client/contract/slots.js
		/**
		* Narrow a request to a renderable plan review, or return undefined to leave it
		* to the generic question flow.
		*
		* The card is one decision over one plan, and it claims a request only when it
		* can send every answer that request allows — an intent changes the layout,
		* never which answers are reachable. So the batch must be a single question
		* that declares the intent, carries the plan as its detail, offers the approve
		* label the intent names, and is a binary single choice: at most one option
		* besides approve, and not multi-select. A third option or a multi-select batch
		* has answers two buttons cannot express, so the generic flow keeps it — as it
		* keeps any request whose intent the asker's own service would have rejected,
		* because the client sits downstream of a wire boundary and every request must
		* stay answerable.
		*
		* @param questions - the request's whole question batch.
		* @returns The narrowed review, or undefined when the generic flow owns it.
		*/
		function planReviewOf(questions) {
			if (questions.length !== 1) return void 0;
			const question = questions[0];
			const intent = question.intent;
			if (intent?.kind !== "plan-review" || question.detail === void 0) return void 0;
			if (question.multiSelect === true) return void 0;
			const options = question.options ?? [];
			if (options.length > 2) return void 0;
			const approve = options.find((option) => option.label === intent.approve);
			if (approve === void 0) return void 0;
			const decline = options.find((option) => option.label !== intent.approve);
			return {
				id: question.id,
				question: question.question,
				plan: question.detail,
				approve,
				...decline === void 0 ? {} : { decline }
			};
		}
		/**
		* Question domain face over the carrier: render identity and questions
		* transparently forwarded; answer/cancel own the wire encoding (the success
		* fields and the cancelled error) and turn a rejected carrier receipt into a
		* thrown error. Components mint one per carrier via useMemo (never inside a
		* select — a per-dispatch mint would churn identity and break memoization).
		*/
		var PendingQuestion = class {
			wait;
			/**
			* @param wait - the runtime carrier for one pending question request.
			*/
			constructor(wait) {
				this.wait = wait;
			}
			/** Opaque render identity (React key / draft remount axis), forwarded from the carrier. */
			get key() {
				return this.wait.key;
			}
			/** The request's question list, forwarded from the carrier payload. */
			get questions() {
				return this.wait.payload.questions;
			}
			/**
			* Deliver the whole answer batch; a rejected carrier receipt throws.
			* @param answer - complete structured answer batch.
			*/
			async answer(answer) {
				const receipt = await this.wait.respond({
					ok: true,
					value: {
						sessionId: this.wait.sessionId,
						answer
					}
				});
				if (!receipt.accepted) throw new Error(`question response rejected: ${receipt.reason}`);
			}
			/** Reject the whole wait (the host resolves the tool call as cancelled); a rejected receipt throws. */
			async cancel() {
				const receipt = await this.wait.respond({
					ok: false,
					error: {
						code: "cancelled",
						message: "the user closed this question request",
						details: {}
					}
				});
				if (!receipt.accepted) throw new Error(`question cancellation rejected: ${receipt.reason}`);
			}
		};
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-user-questions/src/client/PlanReviewPanel.module.css.mjs
		const css$1 = ".LVzXQa_frame{padding:6px calc(var(--dsh-composer-side-clearance) + 16px) 10px;justify-content:center;display:flex}.LVzXQa_card{width:100%;max-width:var(--dsh-chat-content-width);border:1px solid var(--dsw-alias-state-warn-secondary);background:var(--dsw-specific-input-major);max-height:min(60vh,520px);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;flex-direction:column;display:flex;overflow:hidden}.LVzXQa_card,.LVzXQa_card *{box-sizing:border-box}.LVzXQa_strip{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);flex-shrink:0;align-items:center;gap:8px;padding:10px 16px;font-size:13px;line-height:18px;display:flex}.LVzXQa_dot{background:var(--dsw-alias-state-warn-primary);border-radius:50%;width:8px;height:8px}.LVzXQa_body{overscroll-behavior:contain;flex:auto;min-height:0;padding:12px 16px 4px;font-size:14px;line-height:22px;overflow-y:auto}.LVzXQa_footer{flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px 12px;display:flex}.LVzXQa_feedback{min-height:16px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}.LVzXQa_actions{flex-shrink:0;align-items:center;gap:8px;display:flex}.LVzXQa_discuss{color:var(--dsw-alias-label-secondary);gap:6px}.LVzXQa_discuss:hover:not(:disabled){color:var(--dsw-alias-label-primary)}@media (width<=720px){.LVzXQa_card{border-radius:16px}.LVzXQa_body{padding:10px 12px 4px}.LVzXQa_footer{align-items:flex-end;padding:8px 12px 10px}}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-user-questions/PlanReviewPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-user-questions";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var PlanReviewPanel_module_css_default = {
			"dot": "LVzXQa_dot",
			"feedback": "LVzXQa_feedback",
			"frame": "LVzXQa_frame",
			"strip": "LVzXQa_strip",
			"body": "LVzXQa_body",
			"card": "LVzXQa_card",
			"actions": "LVzXQa_actions",
			"discuss": "LVzXQa_discuss",
			"footer": "LVzXQa_footer"
		};
		//#endregion
		//#region lib/types/client/PlanReviewPanel.js
		/**
		* Optional-prop spread for a decision button's tooltip: `title` is optional on
		* the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
		*
		* @param description - the asker's option description, when it carries one.
		* @returns The `title` prop to spread, or nothing.
		*/
		function tooltip(description) {
			return description === void 0 ? {} : { title: description };
		}
		/**
		* Render a plan review as a decision card.
		*
		* @param props - the question domain face, the narrowed plan review, and `t`.
		* @returns The plan-review takeover for this request.
		*/
		function PlanReviewPanel({ pending, review, t }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const settle = (send) => {
				setBusy(true);
				setError(null);
				send().catch((cause) => {
					setBusy(false);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			const decide = (label) => {
				settle(() => pending.answer({ answers: [{
					id: review.id,
					selected: [label]
				}] }));
			};
			const decline = review.decline;
			return (0, react_jsx_runtime.jsx)("div", {
				className: PlanReviewPanel_module_css_default.frame,
				"data-plan-review-key": pending.key,
				children: (0, react_jsx_runtime.jsxs)("section", {
					className: PlanReviewPanel_module_css_default.card,
					"aria-label": review.question,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: PlanReviewPanel_module_css_default.strip,
							children: [(0, react_jsx_runtime.jsx)("span", { className: PlanReviewPanel_module_css_default.dot }), t("plan.header")]
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: PlanReviewPanel_module_css_default.body,
							"data-plan-review-scroll": true,
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: review.plan })
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: PlanReviewPanel_module_css_default.footer,
							children: [(0, react_jsx_runtime.jsx)("div", {
								className: PlanReviewPanel_module_css_default.feedback,
								role: "status",
								children: error
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: PlanReviewPanel_module_css_default.actions,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										className: PlanReviewPanel_module_css_default.discuss,
										icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
										disabled: busy,
										onClick: () => {
											settle(() => pending.cancel());
										},
										children: t("plan.discuss")
									}),
									decline !== void 0 && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										...tooltip(decline.description),
										disabled: busy,
										onClick: () => {
											decide(decline.label);
										},
										children: t("plan.decline")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										...tooltip(review.approve.description),
										disabled: busy,
										onClick: () => {
											decide(review.approve.label);
										},
										children: t("plan.approve")
									})
								]
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-user-questions/src/client/QuestionComposer.module.css.mjs
		const css = ".Mbwy4a_frame{padding:6px calc(var(--dsh-composer-side-clearance) + 16px) 10px;justify-content:center;display:flex}.Mbwy4a_card{width:100%;max-width:var(--dsh-chat-content-width);border:1px solid var(--dsw-alias-border-l2-darkmode-thin);background:var(--dsw-specific-input-major);max-height:min(60vh,520px);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:20px;flex-direction:column;padding:0 0 10px;display:flex;overflow:hidden}.Mbwy4a_card,.Mbwy4a_card *{box-sizing:border-box}.Mbwy4a_header{flex-shrink:0;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 16px 0 24px;display:flex}.Mbwy4a_headingBlock{min-width:0}.Mbwy4a_eyebrow{color:var(--dsw-alias-label-tertiary);margin-bottom:5px;font-size:11px;line-height:16px}.Mbwy4a_title{margin:0;font-size:16px;font-weight:500;line-height:22px}.Mbwy4a_detail{margin:0 2px 8px}.Mbwy4a_footerActions{flex-shrink:0;align-items:center;gap:12px;display:flex}.Mbwy4a_pager{flex-shrink:0;align-items:center;gap:6px;display:flex}.Mbwy4a_progress{color:var(--dsw-alias-label-secondary);white-space:nowrap;word-spacing:-2px;padding:0 4px;font-size:14px;font-weight:500;line-height:24px}.Mbwy4a_iconButton{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;place-items:center;padding:0;display:grid}.Mbwy4a_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Mbwy4a_iconButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.Mbwy4a_body{overscroll-behavior:contain;flex-direction:column;flex:auto;min-height:0;display:flex;overflow-y:auto}.Mbwy4a_options{flex-direction:column;gap:1px;margin:8px 0 0;padding:4px 12px;display:flex}.Mbwy4a_option{width:100%;min-height:40px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:12px;flex-shrink:0;align-items:flex-start;gap:8px;padding:8px 12px 8px 8px;transition:background-color .12s,border-color .12s;display:flex}.Mbwy4a_option:hover:not(:disabled),.Mbwy4a_optionSelected{background:var(--dsw-alias-interactive-bg-hover)}.Mbwy4a_optionSelected{border-color:var(--dsw-alias-border-l2)}.Mbwy4a_option:disabled{cursor:default}.Mbwy4a_number{background:var(--dsw-alias-bg-overlay);width:20px;height:20px;color:var(--dsw-alias-label-secondary);border-radius:6px;flex:0 0 20px;place-items:center;margin-top:2px;font-size:12px;font-weight:500;line-height:18px;display:grid}.Mbwy4a_checkbox{flex:0 0 20px;place-items:center;width:20px;height:20px;margin-top:2px;display:grid}.Mbwy4a_checkbox:before{content:\"\";border:1px solid var(--dsw-alias-border-l4);border-radius:4px;grid-area:1/1;width:14px;height:14px;transition:background-color .12s,border-color .12s}.Mbwy4a_checkbox>svg{grid-area:1/1}.Mbwy4a_checkboxChecked{color:var(--dsw-alias-label-primary-foreground)}.Mbwy4a_checkboxChecked:before{border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-label-primary)}.Mbwy4a_optionCopy{flex:1;min-width:0}.Mbwy4a_optionLine{flex-wrap:wrap;align-items:baseline;gap:2px 6px;display:flex}.Mbwy4a_optionLabel{font-size:14px;font-weight:500;line-height:24px}.Mbwy4a_badge{background:var(--dsw-specific-sidebar-nav-item-active-accent);color:var(--dsw-alias-button-info-fill);border-radius:6px;padding:0 4px;font-size:11px;font-weight:600;line-height:18px}.Mbwy4a_description{color:var(--dsw-alias-label-tertiary);font-size:14px;font-weight:400;line-height:24px}.Mbwy4a_customRow{border:1px solid #0000;border-radius:12px;flex-shrink:0;align-items:flex-start;gap:8px;width:100%;min-height:40px;padding:8px 12px 8px 8px;transition:background-color .12s,border-color .12s;display:flex}.Mbwy4a_customRow:hover,.Mbwy4a_customRow:focus-within,.Mbwy4a_customRowActive{background:var(--dsw-alias-interactive-bg-hover)}.Mbwy4a_customRow:focus-within,.Mbwy4a_customRowActive{border-color:var(--dsw-alias-border-l2)}.Mbwy4a_customInput{min-width:0;color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-state-business-primary);font:inherit;background:0 0;border:none;outline:none;flex:1;padding:0;font-size:14px;line-height:24px}.Mbwy4a_customInput::placeholder{color:var(--dsw-alias-label-caption)}.Mbwy4a_customTextarea{resize:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);min-height:64px;max-height:140px;color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-state-business-primary);font:inherit;border-radius:10px;outline:none;flex-shrink:0;margin:0 12px;padding:8px 12px;font-size:14px;line-height:24px;display:block}.Mbwy4a_customTextarea:focus{border-color:var(--dsw-alias-state-business-primary)}.Mbwy4a_customTextarea::placeholder{color:var(--dsw-alias-label-caption)}.Mbwy4a_footer{flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;padding:0 10px 0 18px;display:flex}.Mbwy4a_feedback{min-height:16px;color:var(--dsw-alias-state-error-primary);text-align:right;flex:1;font-size:11px;line-height:16px}@media (width<=720px){.Mbwy4a_card{border-radius:16px}.Mbwy4a_header{padding:10px 12px 0 18px}.Mbwy4a_options{padding:4px 8px}.Mbwy4a_title{font-size:15px;line-height:21px}.Mbwy4a_option,.Mbwy4a_customRow{padding:8px 6px}.Mbwy4a_footer{align-items:flex-end;padding:0 10px}.Mbwy4a_footerActions{flex-shrink:0}}@media (prefers-reduced-motion:reduce){.Mbwy4a_option,.Mbwy4a_customRow{transition:none}}";
		const tagId = "@deepseek-ai/dsh-client-ui-user-questions/QuestionComposer.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-user-questions";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var QuestionComposer_module_css_default = {
			"pager": "Mbwy4a_pager",
			"optionCopy": "Mbwy4a_optionCopy",
			"footer": "Mbwy4a_footer",
			"iconButton": "Mbwy4a_iconButton",
			"option": "Mbwy4a_option",
			"description": "Mbwy4a_description",
			"optionLine": "Mbwy4a_optionLine",
			"card": "Mbwy4a_card",
			"customRow": "Mbwy4a_customRow",
			"eyebrow": "Mbwy4a_eyebrow",
			"options": "Mbwy4a_options",
			"body": "Mbwy4a_body",
			"customRowActive": "Mbwy4a_customRowActive",
			"detail": "Mbwy4a_detail",
			"customInput": "Mbwy4a_customInput",
			"title": "Mbwy4a_title",
			"checkbox": "Mbwy4a_checkbox",
			"feedback": "Mbwy4a_feedback",
			"headingBlock": "Mbwy4a_headingBlock",
			"progress": "Mbwy4a_progress",
			"checkboxChecked": "Mbwy4a_checkboxChecked",
			"header": "Mbwy4a_header",
			"optionLabel": "Mbwy4a_optionLabel",
			"badge": "Mbwy4a_badge",
			"customTextarea": "Mbwy4a_customTextarea",
			"footerActions": "Mbwy4a_footerActions",
			"optionSelected": "Mbwy4a_optionSelected",
			"number": "Mbwy4a_number",
			"frame": "Mbwy4a_frame"
		};
		//#endregion
		//#region lib/types/client/QuestionComposer.js
		/**
		* Split the conventional recommendation suffix without changing the answer value.
		* @param label - Original option label returned if selected.
		* @returns Display label plus recommendation state.
		*/
		function parseRecommendedLabel(label) {
			const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
			return suffix.test(label) ? {
				label: label.replace(suffix, ""),
				recommended: true
			} : {
				label,
				recommended: false
			};
		}
		/** Return whether a text-field key event belongs to an active IME composition. */
		function isComposing(event) {
			return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
		}
		/**
		* Composer takeover boundary; the carrier key keys local drafts, so a
		* same-request replay (same key, new carrier object) preserves them.
		*
		* One takeover, two shapes: a request that declares a presentation intent this
		* package renders takes that shape (a plan review is one decision over one
		* plan, not a question set), and every other request takes the generic flow.
		* The routing lives here, at the one entry that owns the composer seat, so
		* neither shape can claim a request the other is already rendering.
		*
		* @param props - the selector-matched pending question carrier plus the framework standard kit.
		* @returns The question flow, or the intent's own surface, for this request.
		*/
		function QuestionComposer(props) {
			const question = (0, react.useMemo)(() => new PendingQuestion(props.matched), [props.matched]);
			const review = (0, react.useMemo)(() => planReviewOf(question.questions), [question]);
			return review === void 0 ? (0, react_jsx_runtime.jsx)(QuestionFlow, {
				pending: question,
				t: props.t
			}, question.key) : (0, react_jsx_runtime.jsx)(PlanReviewPanel, {
				pending: question,
				review,
				t: props.t
			}, question.key);
		}
		function QuestionFlow({ pending, t }) {
			const questions = pending.questions;
			const [index, setIndex] = (0, react.useState)(0);
			const [drafts, setDrafts] = (0, react.useState)(() => questions.map(() => ({
				selected: [],
				custom: "",
				skipped: false
			})));
			const [busy, setBusy] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const question = questions[index];
			const draft = drafts[index];
			const hasOptions = (question.options?.length ?? 0) > 0;
			const cancelFlow = () => {
				setBusy("cancel");
				setError(null);
				pending.cancel().catch((cause) => {
					setBusy(null);
					setError({ text: cause instanceof Error ? cause.message : String(cause) });
				});
			};
			const updateDraft = (update) => {
				setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? update(item) : item));
				setError(null);
			};
			const choose = (label) => {
				updateDraft((current) => {
					if (question.multiSelect === true) {
						const selected = current.selected.includes(label) ? current.selected.filter((item) => item !== label) : [...current.selected, label];
						return {
							...current,
							selected,
							skipped: false
						};
					}
					return {
						selected: [label],
						custom: "",
						skipped: false
					};
				});
				if (question.multiSelect !== true && index < questions.length - 1) setIndex((current) => current + 1);
			};
			const answered = (item) => item.selected.length > 0 || item.custom.trim() !== "";
			const completed = (item) => answered(item) || item.skipped;
			const submitDrafts = (values) => {
				const missing = values.findIndex((item) => !completed(item));
				if (missing >= 0) {
					setIndex(missing);
					setError({ key: "error.incomplete" });
					return;
				}
				const answer = { answers: questions.map((item, itemIndex) => {
					const value = values[itemIndex];
					if (value.skipped) return {
						id: item.id,
						selected: []
					};
					const custom = value.custom.trim();
					return {
						id: item.id,
						selected: custom === "" || item.multiSelect === true ? value.selected : [],
						...custom === "" ? {} : { custom }
					};
				}) };
				setBusy("answer");
				setError(null);
				pending.answer(answer).catch((cause) => {
					setBusy(null);
					setError({ text: cause instanceof Error ? cause.message : String(cause) });
				});
			};
			const continueFlow = () => {
				if (!answered(draft)) {
					setError({ key: "error.unanswered" });
					return;
				}
				if (index < questions.length - 1) {
					setIndex((current) => current + 1);
					setError(null);
					return;
				}
				submitDrafts(drafts);
			};
			const draftCustom = (event) => {
				const value = event.target.value;
				updateDraft((current) => ({
					...current,
					selected: question.multiSelect === true ? current.selected : [],
					custom: value,
					skipped: false
				}));
			};
			const continueFromCustom = (event) => {
				if (event.key !== "Enter" || event.shiftKey || isComposing(event)) return;
				event.preventDefault();
				continueFlow();
			};
			const skipQuestion = () => {
				const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? {
					selected: [],
					custom: "",
					skipped: true
				} : item);
				setDrafts(nextDrafts);
				setError(null);
				if (index < questions.length - 1) {
					setIndex((current) => current + 1);
					return;
				}
				submitDrafts(nextDrafts);
			};
			return (0, react_jsx_runtime.jsx)("div", {
				className: QuestionComposer_module_css_default.frame,
				"data-question-key": pending.key,
				children: (0, react_jsx_runtime.jsxs)("section", {
					className: QuestionComposer_module_css_default.card,
					"aria-labelledby": `question-${pending.key}-${String(index)}`,
					children: [
						(0, react_jsx_runtime.jsxs)("header", {
							className: QuestionComposer_module_css_default.header,
							children: [(0, react_jsx_runtime.jsxs)("div", {
								className: QuestionComposer_module_css_default.headingBlock,
								children: [question.header !== void 0 && (0, react_jsx_runtime.jsx)("div", {
									className: QuestionComposer_module_css_default.eyebrow,
									children: question.header
								}), (0, react_jsx_runtime.jsx)("h2", {
									className: QuestionComposer_module_css_default.title,
									id: `question-${pending.key}-${String(index)}`,
									children: question.question
								})]
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: QuestionComposer_module_css_default.iconButton,
								"aria-label": t("nav.cancel"),
								title: t("nav.cancel"),
								disabled: busy !== null,
								onClick: cancelFlow,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, {})
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: QuestionComposer_module_css_default.body,
							"data-question-scroll": true,
							children: [question.detail !== void 0 && (0, react_jsx_runtime.jsx)("div", {
								className: QuestionComposer_module_css_default.detail,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: question.detail })
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: QuestionComposer_module_css_default.options,
								role: question.multiSelect === true ? "group" : "radiogroup",
								children: [(question.options ?? []).map((option, optionIndex) => {
									const selected = draft.selected.includes(option.label);
									const display = parseRecommendedLabel(option.label);
									return (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: clsx(QuestionComposer_module_css_default.option, selected && question.multiSelect !== true && QuestionComposer_module_css_default.optionSelected),
										role: question.multiSelect === true ? "checkbox" : "radio",
										"aria-checked": selected,
										"aria-label": display.label,
										disabled: busy !== null,
										onClick: () => {
											choose(option.label);
										},
										onKeyDown: (event) => {
											if (event.key !== "Enter" || !drafts.every(completed)) return;
											event.preventDefault();
											submitDrafts(drafts);
										},
										children: [question.multiSelect === true ? (0, react_jsx_runtime.jsx)("span", {
											className: clsx(QuestionComposer_module_css_default.checkbox, selected && QuestionComposer_module_css_default.checkboxChecked),
											"aria-hidden": "true",
											children: selected && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 12 })
										}) : (0, react_jsx_runtime.jsx)("span", {
											className: QuestionComposer_module_css_default.number,
											children: optionIndex + 1
										}), (0, react_jsx_runtime.jsx)("span", {
											className: QuestionComposer_module_css_default.optionCopy,
											children: (0, react_jsx_runtime.jsxs)("span", {
												className: QuestionComposer_module_css_default.optionLine,
												children: [
													(0, react_jsx_runtime.jsx)("span", {
														className: QuestionComposer_module_css_default.optionLabel,
														children: display.label
													}),
													display.recommended && (0, react_jsx_runtime.jsx)("span", {
														className: QuestionComposer_module_css_default.badge,
														children: t("option.recommended")
													}),
													option.description !== void 0 && (0, react_jsx_runtime.jsx)("span", {
														className: QuestionComposer_module_css_default.description,
														children: option.description
													})
												]
											})
										})]
									}, `${option.label}-${String(optionIndex)}`);
								}), hasOptions ? (0, react_jsx_runtime.jsxs)("div", {
									className: clsx(QuestionComposer_module_css_default.customRow, draft.custom !== "" && QuestionComposer_module_css_default.customRowActive),
									children: [question.multiSelect === true ? (0, react_jsx_runtime.jsx)("span", {
										className: clsx(QuestionComposer_module_css_default.checkbox, draft.custom !== "" && QuestionComposer_module_css_default.checkboxChecked),
										"aria-hidden": "true",
										children: draft.custom !== "" && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 12 })
									}) : (0, react_jsx_runtime.jsx)("span", {
										className: QuestionComposer_module_css_default.number,
										"aria-hidden": "true",
										children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 12 })
									}), (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										className: QuestionComposer_module_css_default.customInput,
										value: draft.custom,
										disabled: busy !== null,
										placeholder: t("custom.placeholder"),
										onChange: draftCustom,
										onKeyDown: continueFromCustom
									})]
								}) : (0, react_jsx_runtime.jsx)("textarea", {
									autoFocus: true,
									className: QuestionComposer_module_css_default.customTextarea,
									value: draft.custom,
									disabled: busy !== null,
									rows: 2,
									placeholder: t("custom.placeholder"),
									onChange: draftCustom,
									onKeyDown: continueFromCustom
								})]
							})]
						}),
						(0, react_jsx_runtime.jsxs)("footer", {
							className: QuestionComposer_module_css_default.footer,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: QuestionComposer_module_css_default.pager,
									children: [
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: QuestionComposer_module_css_default.iconButton,
											"aria-label": t("nav.prev"),
											disabled: index === 0 || busy !== null,
											onClick: () => {
												setIndex(index - 1);
												setError(null);
											},
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
										}),
										(0, react_jsx_runtime.jsxs)("span", {
											className: QuestionComposer_module_css_default.progress,
											children: [
												index + 1,
												" / ",
												questions.length
											]
										}),
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: QuestionComposer_module_css_default.iconButton,
											"aria-label": t("nav.next"),
											disabled: index === questions.length - 1 || busy !== null,
											onClick: () => {
												setIndex(index + 1);
												setError(null);
											},
											children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
										})
									]
								}),
								(0, react_jsx_runtime.jsx)("div", {
									className: QuestionComposer_module_css_default.feedback,
									role: "status",
									children: error === null ? null : "key" in error ? t(error.key) : error.text
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: QuestionComposer_module_css_default.footerActions,
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										disabled: busy !== null,
										onClick: skipQuestion,
										children: t("action.skip")
									}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										disabled: busy !== null || !answered(draft),
										onClick: continueFlow,
										children: busy === "answer" ? t("submitting") : index === questions.length - 1 ? t("submit") : t("action.next")
									})]
								})
							]
						})
					]
				})
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `question` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"error.incomplete": "请先完成这道问题。",
			"error.unanswered": "请选择一个选项或填写自定义答案。",
			"nav.prev": "上一题",
			"nav.next": "下一题",
			"nav.cancel": "放弃整组问题",
			"option.recommended": "推荐",
			"custom.placeholder": "输入你的答案",
			"action.skip": "跳过本题",
			"action.next": "下一题",
			"plan.header": "计划待审",
			"plan.approve": "确认执行",
			"plan.decline": "拒绝",
			"plan.discuss": "去聊天里说"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"error.incomplete": "Please complete this question first.",
			"error.unanswered": "Please select an option or enter a custom answer.",
			"nav.prev": "Previous question",
			"nav.next": "Next question",
			"nav.cancel": "Dismiss all questions",
			"option.recommended": "Recommended",
			"custom.placeholder": "Type your answer",
			"action.skip": "Skip this question",
			"action.next": "Next",
			"plan.header": "Plan review",
			"plan.approve": "Approve",
			"plan.decline": "Refuse",
			"plan.discuss": "Chat about it"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "question";
		/** Required services: the slot registry and the question composer's copy. */
		const inject = ["slots", "locale"];
		/** Chain routing: claim the composer while a question wait is pending (pure — owner props only). */
		function selectQuestion({ interactions }) {
			return interactions.find((i) => i.kind === "question") ?? null;
		}
		/**
		* Client plugin body: register the `question` dictionaries and the question
		* composer into the composer chain. Zero business face — data and verbs live
		* on the matched carrier; t rides the standard locale seat.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-user-questions: dictionaries");
			ctx.slots.inject("conversation.composer", () => ctx.slots.register({
				name: "conversation.composer",
				select: selectQuestion,
				locale: NS
			}, QuestionComposer));
		}
		//#endregion
		exports.PendingQuestion = PendingQuestion;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map