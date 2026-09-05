/**
 * dsh-offpeak — browser half (lazy-CJS 客户端 bundle，零依赖原生 DOM)。
 *
 * 拦截式提醒（v2）：
 * - 高峰时段（北京时间 9:00–12:00、14:00–18:00）用户在 composer 按 Enter
 *   或点发送按钮时，**在消息发出前拦截**：消息保留在输入框内，弹出提醒
 *   （当前模型 V4 Flash/Pro 高峰/闲时价目表 + 本条命令文本）；
 *   「继续执行」→ 重新派发原始提交事件，消息按正常路径发出；
 *   「定时执行」→ 登记到服务端（记录命令文本与时间），清空输入框，
 *   到点由服务端自动把命令提交给原会话执行；
 *   「今日不再提醒」→ 当天（北京时间）不再拦截/弹窗；
 *   关闭 × → 不发送，消息留在输入框。
 * - 中文输入法组合态（isComposing）与 Cmd/Ctrl/Shift 修饰键不拦截。
 * - 服务端 reminder 作为兜底：未拦截路径（如旧页面）发出消息后仍会弹非阻塞提醒。
 * - 分钟轮 00–59；小时栏仅 0–8、18–23 点，已过去的时间移除，23 之后滚动到次日 0–8。
 */
window.__ModuleLoader__.load({
  id: "dsh-offpeak",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    //#region styles
    const CSS_ID = "dsh-offpeak/styles.css";
    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-offpeak";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = [
        ".dspg_backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font-family:var(--dsw-alias-font-family,system-ui,sans-serif)}",
        ".dspg_modal{width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 64px);overflow:auto;background:var(--dsw-alias-bg-primary,#202127);color:var(--dsw-alias-label-primary,#e8e8ea);border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.5);padding:18px 20px;box-sizing:border-box}",
        ".dspg_head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}",
        ".dspg_title{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}",
        ".dspg_close{background:none;border:none;color:var(--dsw-alias-label-tertiary,#9a9aa2);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1}",
        ".dspg_close:hover{background:rgba(255,255,255,.08);color:var(--dsw-alias-label-primary,#e8e8ea)}",
        ".dspg_sub{font-size:12px;color:var(--dsw-alias-label-secondary,#b6b6bd);margin-bottom:12px}",
        ".dspg_blocked{font-size:12px;color:var(--dsw-alias-state-warning-primary,#f2b24c);background:rgba(242,178,76,.12);border:1px solid rgba(242,178,76,.3);border-radius:8px;padding:6px 10px;margin-bottom:10px}",
        ".dspg_model{font-size:13px;font-weight:600;margin:10px 0 6px}",
        ".dspg_table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}",
        ".dspg_table th,.dspg_table td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.08))}",
        ".dspg_table th{color:var(--dsw-alias-label-tertiary,#9a9aa2);font-weight:500}",
        ".dspg_peak{color:var(--dsw-alias-state-warning-primary,#f2b24c);font-weight:600}",
        ".dspg_off{color:var(--dsw-alias-label-tertiary,#9a9aa2)}",
        ".dspg_cmd{background:rgba(255,255,255,.05);border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.1));border-radius:8px;padding:8px 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#b6b6bd);margin-bottom:10px;max-height:96px;overflow:auto;white-space:pre-wrap;word-break:break-all}",
        ".dspg_hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#9a9aa2);margin-bottom:12px}",
        ".dspg_actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
        ".dspg_btn{flex:1;min-width:120px;padding:8px 14px;border-radius:9px;border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.14));background:rgba(255,255,255,.06);color:var(--dsw-alias-label-primary,#e8e8ea);font-size:13px;cursor:pointer;font-family:inherit}",
        ".dspg_btn:hover{background:rgba(255,255,255,.12)}",
        ".dspg_btn_primary{background:var(--dsw-alias-accent-primary,#4c8dff);border-color:transparent;color:#fff}",
        ".dspg_btn_primary:hover{background:var(--dsw-alias-accent-hover,#3d7bef)}",
        ".dspg_btn[disabled]{opacity:.5;cursor:not-allowed}",
        ".dspg_check{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#b6b6bd);cursor:pointer;margin-top:12px;user-select:none}",
        ".dspg_check input{accent-color:var(--dsw-alias-accent-primary,#4c8dff)}",
        ".dspg_picker{display:flex;gap:12px;justify-content:center;margin:6px 0 12px}",
        ".dspg_wheel{display:flex;flex-direction:column;align-items:center;gap:2px}",
        ".dspg_wheel_label{font-size:11px;color:var(--dsw-alias-label-tertiary,#9a9aa2);margin-bottom:2px}",
        ".dspg_wheel_btn{width:44px;height:26px;border:none;background:rgba(255,255,255,.06);color:var(--dsw-alias-label-primary,#e8e8ea);border-radius:7px;cursor:pointer;font-size:13px}",
        ".dspg_wheel_btn:hover{background:rgba(255,255,255,.14)}",
        ".dspg_wheel_list{height:150px;overflow-y:auto;scrollbar-width:none;border:1px solid var(--dsw-alias-border-primary,rgba(255,255,255,.1));border-radius:9px;background:rgba(0,0,0,.18);padding:4px 0;width:96px;text-align:center}",
        ".dspg_wheel_list::-webkit-scrollbar{display:none}",
        ".dspg_wheel_item{padding:6px 4px;font-size:12px;color:var(--dsw-alias-label-secondary,#b6b6bd);cursor:pointer;border-radius:6px;white-space:nowrap}",
        ".dspg_wheel_item:hover{background:rgba(255,255,255,.07)}",
        ".dspg_wheel_item_sel{background:var(--dsw-alias-accent-primary,#4c8dff);color:#fff;font-weight:600}",
        ".dspg_picker_sum{font-size:12px;color:var(--dsw-alias-label-secondary,#b6b6bd);text-align:center;margin-bottom:10px}",
        ".dspg_toast{font-size:12px;text-align:center;color:var(--dsw-alias-state-success-primary,#5ec98f);padding:8px 0}"
      ].join("\n");
      document.head.appendChild(tag);
    }
    //#endregion

    //#region state
    const POLL_MS = 4000;
    let lastState = null; // 最近一次 /state 响应
    let shownNonce = null; // 已弹过兜底提醒的 nonce
    let modalEl = null; // 当前弹窗根节点（null = 未显示）
    let pollTimer = null;
    let disposeModal = null;
    let intercepting = false; // 正在派发原始提交事件（防重入）
    let suppressUntil = 0; // 继续执行/定时执行后的提醒抑制窗口
    let localRemindedToday = false; // 本页勾选「今日不再提醒」后的本地标记
    let currentCtx = null; // apply(ctx) 传入的客户端 ctx
    //#endregion

    const fmt = (n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return "—";
      return v >= 10 ? String(Math.round(v)) : String(v);
    };
    const fmtTime = (iso) => {
      const d = new Date(iso);
      return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const pad = (n) => String(n).padStart(2, "0");

    /** 客户端自行计算的北京时间（分钟 + 日期），用于提交瞬间的高峰判断（轮询状态最多滞后 4s）。 */
    function beijingParts(now) {
      let parts = {};
      try {
        parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Shanghai",
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).formatToParts(now).map((p) => [p.type, p.value]));
      } catch {
        return { minutes: now.getHours() * 60 + now.getMinutes(), date: "unknown", weekday: 0 };
      }
      const year = Number(parts.year);
      const month = Number(parts.month);
      const day = Number(parts.day);
      // 由北京日历日推算星期（周一=1 … 周日=7），避免跟着机器本地时区跑偏（issue #158）。
      const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const weekday = jsWeekday === 0 ? 7 : jsWeekday;
      return {
        minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
        date: parts.year + "-" + parts.month + "-" + parts.day,
        weekday,
      };
    }
    function isPeak(minutes, windows, weekday) {
      // 周末（周六/周日）整天空闲（issue #158）。
      if (weekday === 6 || weekday === 7) return false;
      return Array.isArray(windows) && windows.some((w) => minutes >= Number(w.start) && minutes < Number(w.end));
    }

    //#region fetch helpers
    async function fetchState() {
      try {
        const res = await fetch("/ds-offpeak/state", { cache: "no-store", headers: { accept: "application/json" } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        lastState = await res.json();
      } catch {
        lastState = null;
      }
    }
    async function postJson(path, payload) {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          // 3s 超时：后端假死（端口通、HTTP 永不响应）时不能让弹窗关闭/
          // 提交重放永久挂起（issue #127「弹窗关不掉」根因之一）。
          signal: AbortSignal.timeout(3000),
        });
        return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
      } catch (error) {
        return { ok: false, status: 0, body: null, error: error instanceof Error ? error.message : String(error) };
      }
    }
    //#endregion

    //#region interception decision
    // 决策即快照（issue #130）：返回 null=放行；返回 state 对象=拦截并携带
    // 决策时的状态快照——杜绝「shouldIntercept 判定拦截（事件已被吞）→
    // showInterceptPopup 二次读 lastState 时轮询失败置 null → return」的
    // 竞态（表现为事件被吞、弹窗不弹、消息发不出去）。
    function shouldIntercept(text) {
      const s = lastState;
      if (s === null || typeof s !== "object") return null;
      if (s.enabled !== true) return null;
      if (s.remindedToday === true || localRemindedToday) return null;
      const kind = s.modelKind;
      if (kind !== "flash" && kind !== "pro" && kind !== "deepseek-other") return null;
      if (text === undefined || typeof text !== "string" || text.trim() === "") return null;
      if (Date.now() < suppressUntil) return null;
      if (intercepting) return null;
      if (modalEl !== null) return null; // 已有弹窗时不重复拦截
      const bj = beijingParts(new Date());
      if (!isPeak(bj.minutes, s.peakWindows, bj.weekday)) return null;
      return s;
    }
    //#endregion

    //#region modal
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className !== undefined && className !== "") node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function buildPriceBody(state, frag) {
      const modelName = state.model && state.model.model ? state.model.model : "";
      const kind = state.modelKind;
      const price = state.prices !== null && typeof state.prices === "object" ? state.prices : null;
      const entry = kind === "flash" || kind === "pro" ? price[kind] : null;
      const isDeepSeek = kind === "flash" || kind === "pro" || kind === "deepseek-other";
      if (isDeepSeek) {
        if (entry !== null) {
          frag.append(el("div", "dspg_model", entry.label + "（" + esc(modelName) + "）"));
          const table = el("table", "dspg_table");
          const thead = el("thead");
          const hr = el("tr");
          for (const t of ["计费项", "高峰价", "闲时价"]) hr.append(el("th", "", t));
          thead.append(hr);
          table.append(thead);
          const tbody = el("tbody");
          const rows = [
            ["输入（缓存未命中）", entry.peak.input, entry.off.input],
            ["输出", entry.peak.output, entry.off.output],
            ["输入（缓存命中）", entry.peak.cacheRead, entry.off.cacheRead],
          ];
          for (const [label, peak, off] of rows) {
            const tr = el("tr");
            tr.append(el("td", "", label));
            tr.append(el("td", "dspg_peak", "¥" + fmt(peak) + "/百万"));
            tr.append(el("td", "dspg_off", "¥" + fmt(off) + "/百万"));
            tbody.append(tr);
          }
          table.append(tbody);
          frag.append(table);
        } else {
          frag.append(el("div", "dspg_model", "当前模型：" + esc(modelName || "未知")));
          frag.append(el("div", "dspg_sub", "该模型不在 V4 Flash/Pro 调价表内，高峰时段价格仍可能偏高。"));
        }
      } else {
        frag.append(el("div", "dspg_sub", "当前模型非 DeepSeek 平台，价格不受峰谷定价影响。"));
      }
    }

    function buildMainView(state, opts) {
      const frag = document.createDocumentFragment();
      const bj = state.beijing;
      const peakLabel = Array.isArray(state.peakWindows) && state.peakWindows.length > 0
        ? state.peakWindows.map((w) => w.label).join(" / ")
        : "9:00–12:00 / 14:00–18:00";

      const head = el("div", "dspg_head");
      const title = el("div", "dspg_title", opts.intercept ? "⚡ 高峰时段 · 已拦截发送" : "⚡ 高峰时段 · 价格提醒");
      const close = el("button", "dspg_close", "✕");
      close.title = "关闭（不发送，消息保留在输入框）";
      close.addEventListener("click", () => void closePopup(true));
      head.append(title, close);
      frag.append(head);

      frag.append(el("div", "dspg_sub",
        "现在为北京时间 " + fmtTime(bj.iso) + "，处于高峰时段（" + peakLabel + "），价格较高。"));
      if (opts.intercept) {
        frag.append(el("div", "dspg_blocked", "本条命令已被拦截，尚未发送。"));
      }

      buildPriceBody(state, frag);

      const cmd = el("div", "dspg_cmd");
      cmd.textContent = "本条命令：" + (opts.text !== "" ? opts.text : "（空）");
      cmd.title = opts.text;
      frag.append(cmd);

      frag.append(el("div", "dspg_hint", "建议定时到 18:00 后或 0:00–8:00 执行，价格减半。"));

      const actions = el("div", "dspg_actions");
      const continueBtn = el("button", "dspg_btn dspg_btn_primary", "继续执行");
      continueBtn.addEventListener("click", () => void opts.onContinue());
      const scheduleBtn = el("button", "dspg_btn", "定时执行");
      scheduleBtn.disabled = opts.text === "";
      scheduleBtn.addEventListener("click", () => void showPicker(state, opts));
      actions.append(continueBtn, scheduleBtn);
      frag.append(actions);

      const check = el("label", "dspg_check");
      const box = document.createElement("input");
      box.type = "checkbox";
      check.append(box, document.createTextNode("今日不再提醒"));
      frag.append(check);

      return { root: frag, checkBox: box };
    }

    function buildPickerView(state, opts, onBack) {
      const frag = document.createDocumentFragment();
      const options = Array.isArray(state.hourOptions) && state.hourOptions.length > 0
        ? state.hourOptions
        : [];
      // 服务端每组 = 一个 (天, 小时)，携带该小时可选的分钟档（00–59）与分钟 0 档的 atMs。
      const groups = options.map((o) => ({
        dayOffset: o.dayOffset,
        hour: o.hour,
        label: o.label.split(" ")[0] + " " + String(o.hour).padStart(2, "0") + " 时",
        minutes: Array.isArray(o.minutes) && o.minutes.length > 0 ? o.minutes : [0],
        base: o,
      }));
      let groupIdx = 0;
      let minuteIdx = 0;
      const selected = () => {
        const g = groups[groupIdx];
        if (g === undefined) return null;
        const minute = g.minutes[minuteIdx];
        if (minute === undefined) return null;
        return {
          ...g.base,
          minute,
          atMs: g.base.atMs + minute * 60000,
          label: g.base.label.replace(/:00$/, ":" + pad(minute)),
        };
      };

      const head = el("div", "dspg_head");
      head.append(el("div", "dspg_title", "⏰ 定时执行"));
      frag.append(head);

      const picker = el("div", "dspg_picker");
      const buildWheel = (label, items, getSel, onSel) => {
        const wrap = el("div", "dspg_wheel");
        wrap.append(el("div", "dspg_wheel_label", label));
        const up = el("button", "dspg_wheel_btn", "▲");
        const list = el("div", "dspg_wheel_list");
        const down = el("button", "dspg_wheel_btn", "▼");
        const render = () => {
          list.textContent = "";
          items.forEach((item, idx) => {
            const row = el("div", "dspg_wheel_item" + (idx === getSel() ? " dspg_wheel_item_sel" : ""), item);
            row.addEventListener("click", () => {
              onSel(idx);
              render();
            });
            list.append(row);
          });
          const sel = list.children[getSel()];
          if (sel !== undefined && sel.scrollIntoView !== undefined) sel.scrollIntoView({ block: "center" });
        };
        up.addEventListener("click", () => {
          onSel((getSel() - 1 + items.length) % items.length);
          render();
        });
        down.addEventListener("click", () => {
          onSel((getSel() + 1) % items.length);
          render();
        });
        wrap.append(up, list, down);
        return { wrap, render };
      };

      const hourItems = groups.map((g) => g.label);
      const hourWheel = buildWheel("小时", hourItems, () => groupIdx, (i) => {
        groupIdx = i;
        minuteIdx = 0;
        minuteWheel.render();
        renderSum();
      });
      const minuteItems = () => groups[groupIdx] !== undefined ? groups[groupIdx].minutes.map((m) => pad(m)) : [];
      let minuteWheel = null;
      minuteWheel = buildWheel("分钟", minuteItems(), () => minuteIdx, (i) => {
        minuteIdx = i;
        renderSum();
      });
      const origMinuteRender = minuteWheel.render;
      minuteWheel.render = () => {
        const items = minuteItems();
        const list = minuteWheel.wrap.querySelector(".dspg_wheel_list");
        list.textContent = "";
        items.forEach((item, idx) => {
          const row = el("div", "dspg_wheel_item" + (idx === minuteIdx ? " dspg_wheel_item_sel" : ""), item);
          row.addEventListener("click", () => {
            minuteIdx = idx;
            minuteWheel.render();
            renderSum();
          });
          list.append(row);
        });
        const sel = list.children[minuteIdx];
        if (sel !== undefined && sel.scrollIntoView !== undefined) sel.scrollIntoView({ block: "center" });
      };
      void origMinuteRender;
      picker.append(hourWheel.wrap, minuteWheel.wrap);
      frag.append(picker);

      const sum = el("div", "dspg_picker_sum", "");
      const renderSum = () => {
        const sel = selected();
        sum.textContent = sel !== null
          ? "将于 " + sel.label + " 执行（闲时半价）"
          : "无可选时间";
      };
      frag.append(sum);

      const actions = el("div", "dspg_actions");
      const back = el("button", "dspg_btn", "返回");
      back.addEventListener("click", () => onBack());
      const confirm = el("button", "dspg_btn dspg_btn_primary", "确认定时");
      confirm.addEventListener("click", () => void opts.onSchedule(selected()));
      actions.append(back, confirm);
      frag.append(actions);

      const check = el("label", "dspg_check");
      const box = document.createElement("input");
      box.type = "checkbox";
      check.append(box, document.createTextNode("今日不再提醒"));
      frag.append(check);

      return { root: frag, checkBox: box, renderSum };
    }

    function openModal(content) {
      hideModal();
      const backdrop = el("div", "dspg_backdrop");
      const modal = el("div", "dspg_modal");
      modal.append(content);
      backdrop.append(modal);
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) void closePopup(true);
      });
      document.body.append(backdrop);
      modalEl = backdrop;
    }
    function hideModal() {
      if (modalEl !== null && modalEl.parentNode !== null) modalEl.parentNode.removeChild(modalEl);
      modalEl = null;
      if (disposeModal !== null) {
        try {
          disposeModal();
        } catch { /* noop */ }
        disposeModal = null;
      }
    }
    function currentCheckBox() {
      return modalEl !== null ? modalEl.querySelector(".dspg_check input") : null;
    }
    function shouldDismissToday() {
      const box = currentCheckBox();
      return box !== null && box.checked === true;
    }
    async function maybeDismissToday() {
      if (shouldDismissToday()) {
        const r = await postJson("/ds-offpeak/dismiss", { forToday: true });
        if (r.ok) {
          localRemindedToday = true;
          if (lastState !== null && typeof lastState === "object") lastState.remindedToday = true;
        }
      }
    }
    async function closePopup(allowDismiss) {
      // 「关闭弹窗」这个 UI 承诺不依赖后端健康：先摘弹窗再走网络（issue #127）。
      // dismiss 是幂等状态同步，失败静默——下次轮询/弹窗还能再点，无损失。
      const dismiss = allowDismiss && shouldDismissToday(); // hideModal 前读 checkbox（弹窗摘除后读不到）
      hideModal();
      if (dismiss) {
        const r = await postJson("/ds-offpeak/dismiss", { forToday: true });
        if (r.ok) {
          localRemindedToday = true;
          if (lastState !== null && typeof lastState === "object") lastState.remindedToday = true;
        }
      }
    }

    /** 继续执行：立即关弹窗 + 立即重放提交；ack/dismiss 全部后台化（issue #127/#130）。 */
    async function continueSend(opts) {
      suppressUntil = Date.now() + 8000;
      const dismiss = shouldDismissToday(); // hideModal 前读 checkbox
      // 顺手 ack 掉可能存在的服务端兜底提醒，避免轮询重复弹窗（快照防竞态）。
      const s = lastState;
      const ackNonce = (s !== null && s !== null && s.reminder !== null && s.reminder.nonce !== undefined)
        ? s.reminder.nonce
        : null;
      hideModal(); // 任何网络操作之前——后端假死也不许卡住用户
      if (ackNonce !== null) {
        void postJson("/ds-offpeak/ack", { nonce: ackNonce }).then((r) => {
          if (r.ok && ackNonce === shownNonce) shownNonce = null;
        }).catch(() => { /* 幂等，静默 */ });
      }
      if (dismiss) {
        void postJson("/ds-offpeak/dismiss", { forToday: true }).then((r) => {
          if (r.ok) {
            localRemindedToday = true;
            if (lastState !== null && typeof lastState === "object") lastState.remindedToday = true;
          }
        }).catch(() => { /* 幂等，静默 */ });
      }
      intercepting = true;
      try {
        // 重放一次提交手势。Enter 必须打在真正的输入面上（chip 等后代收不到），
        // 且先要回焦点：弹窗摘掉后焦点落在 body，Lexical 无选区时不吃这个事件。
        const field = opts.target;
        if (opts.gesture === "enter" && isEditableField(field) && field.isConnected !== false) {
          try {
            field.focus();
          } catch { /* 聚焦失败仍试一次重放 */ }
          field.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true,
          }));
        } else {
          const btn = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
          if (btn !== null) btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        }
      } finally {
        intercepting = false;
      }
      // 合成事件重放兜底（isTrusted=false 可能被 composer 忽略——issue #130）：
      // 800ms 后输入框仍是原文且可编辑，提示用户再按一次。
      setTimeout(() => {
        try {
          const ta = opts.target;
          if (opts.gesture === "enter" && isEditableField(ta)
              && normDraft(composerText(ta)) !== ""
              && normDraft(composerText(ta)) === normDraft(opts.text)
              && ta.disabled !== true && ta.readOnly !== true && modalEl === null) {
            const tip = el("div", "dspg_toast", "未触发发送，请再按一次 Enter");
            tip.style.position = "fixed";
            tip.style.bottom = "18px";
            tip.style.left = "50%";
            tip.style.transform = "translateX(-50%)";
            tip.style.zIndex = "100000";
            document.body.append(tip);
            setTimeout(() => tip.remove(), 3000);
          }
        } catch { /* noop */ }
      }, 800);
    }

    /** 定时执行：登记到服务端并清空输入框草稿。 */
    async function scheduleSend(opts, sel) {
      if (sel === null) return;
      let sessionId = "";
      try {
        const sessions = currentCtx !== null ? currentCtx.get("sessions") : undefined;
        if (sessions !== undefined && sessions.list !== undefined) {
          const snap = sessions.list.getSnapshot();
          if (snap !== null && typeof snap === "object" && typeof snap.current === "string") sessionId = snap.current;
        }
      } catch { /* 取不到会话则报错 */ }
      if (sessionId === "") {
        const modal = modalEl !== null ? modalEl.querySelector(".dspg_modal") : null;
        if (modal !== null) {
          const msg = el("div", "dspg_toast", "无法确定当前会话，定时失败");
          msg.style.color = "var(--dsw-alias-state-error-primary,#f26d6d)";
          modal.append(msg);
        }
        return;
      }
      const result = await postJson("/ds-offpeak/schedule", {
        text: opts.text,
        atMs: sel.atMs,
        sessionId,
      });
      if (result.ok && result.body !== null && result.body.ok === true) {
        suppressUntil = Date.now() + 8000;
        await maybeDismissToday();
        // 清空输入框草稿 —— 两代两套写路径，且必须回读校验：定时已登记而原文还在
        // 时，用户再按一次 Enter 就是重复发送，比「没清掉」严重一档，所以清不掉
        // 要在提示里明说，并把弹窗停留时间拉长（原来静默保留原文）。
        const cleared = clearComposerDraft(opts.target);
        const modal = modalEl !== null ? modalEl.querySelector(".dspg_modal") : null;
        if (modal !== null) {
          const toast = el("div", "dspg_toast", "✓ 已定时：" + sel.label + " 自动执行"
            + (cleared ? "" : "；草稿未能清空，请勿再按 Enter（会重复发送）"));
          modal.textContent = "";
          modal.append(toast);
          setTimeout(() => hideModal(), cleared ? 1600 : 5200);
        } else {
          hideModal();
        }
      } else {
        const modal = modalEl !== null ? modalEl.querySelector(".dspg_modal") : null;
        if (modal !== null) {
          const msg = el("div", "dspg_toast", "定时失败：" + (result.body !== null && result.body.error !== undefined ? result.body.error : "未知错误"));
          msg.style.color = "var(--dsw-alias-state-error-primary,#f26d6d)";
          modal.append(msg);
        }
      }
    }

    function showMainPopup(state, opts) {
      const view = buildMainView(state, opts);
      openModal(view.root);
      disposeModal = () => { /* noop */ };
      void view.checkBox;
    }

    function showPicker(state, opts) {
      const view = buildPickerView(state, opts, () => {
        if (lastState !== null) showMainPopup(lastState, opts);
        else hideModal();
      });
      openModal(view.root);
      view.renderSum();
      disposeModal = () => { /* noop */ };
    }

    /** 拦截式弹窗：消息尚未发送。state 由 shouldIntercept 决策时快照传入。 */
    function showInterceptPopup(ta, text, gesture, state) {
      if (state === null) return;
      const opts = {
        intercept: true,
        text,
        target: ta,
        gesture,
        onContinue: () => void continueSend(opts),
        onSchedule: (sel) => void scheduleSend(opts, sel),
      };
      showMainPopup(state, opts);
    }

    /** 兜底提醒弹窗：消息已发出（非拦截路径），服务端 reminder 触发。 */
    function showReminderPopup(state) {
      const opts = {
        intercept: false,
        text: state.reminder.text !== undefined ? state.reminder.text : "",
        target: null,
        gesture: "click",
        onContinue: () => void continueSend(opts),
        onSchedule: (sel) => void scheduleSend(opts, sel),
      };
      showMainPopup(state, opts);
    }

    function maybeShowReminder() {
      const s = lastState;
      if (s === null || typeof s !== "object") return;
      if (s.enabled !== true || s.inPeak !== true) return;
      if (Date.now() < suppressUntil) return;
      if (modalEl !== null) return;
      if (s.reminder === null || typeof s.reminder !== "object" || s.reminder.nonce === undefined) return;
      if (s.reminder.nonce === shownNonce) return;
      shownNonce = s.reminder.nonce;
      showReminderPopup(s);
    }
    //#endregion

    //#region composer compat
    // dsh-compat:composer-editable —— 内核 composer 已由 React 受控 <textarea> 换成
    // Lexical contenteditable：实机 [data-composer-card] 内 textarea=0，可编辑面是
    // div[data-composer-input][data-lexical-editor][role="textbox"]（内核
    // dsh-client-ui-conversation 里 textarea 只剩注释提法）。本插件原先只认
    // HTMLTextAreaElement —— keydown 首行 instanceof 就 return、click 路径
    // card.querySelector('textarea') 恒 null，于是「高峰拦截」整条功能静默失效：
    // 不报错、不弹窗、无日志，用户只看到功能凭空消失。以下助手把「找输入面 /
    // 读草稿 / 清草稿」收成一个两代通用口径（与 dsh-file-drop、dsh-image-paste 同源）。
    const COMPOSER_ANCHORS = ["[data-composer-input]", "[data-lexical-editor]", "textarea"];

    function isEditableField(node) {
      return node !== null && node !== undefined
        && (node.tagName === "TEXTAREA" || node.isContentEditable === true);
    }

    /** 归一草稿文本（NBSP 与首尾空白两代读法不一致，比较前统一掉）。 */
    function normDraft(s) {
      return String(s === undefined || s === null ? "" : s).replace(/\u00a0/g, " ").trim();
    }

    /** 在 scope（card 或文档）里找当前输入面；两代都认，全落空返回 null。 */
    function findComposerIn(scope) {
      if (scope === null || scope === undefined || typeof scope.querySelector !== "function") return null;
      for (const sel of COMPOSER_ANCHORS) {
        const hit = scope.querySelector(sel);
        if (hit !== null && isEditableField(hit)) return hit;
      }
      return null;
    }

    /**
     * 事件目标 → 本次回车所属的输入面；不在 composer 卡内返回 null。
     * e.target 常常不是输入面本身（Lexical 的 chip 是 contenteditable="false" 的
     * 子节点，isContentEditable 返回 false），故由卡内锚点兜底定位。
     */
    function composerFieldOf(node) {
      if (node === null || node === undefined || typeof node.closest !== "function") return null;
      const card = node.closest("[data-composer-card]");
      if (card === null) return null;
      const host = findComposerIn(card);
      if (host === null) return null;
      // 只在输入面及其后代上生效：卡里的按钮/工具行不算输入区，否则会把别处的
      // 回车也一起吞掉（那是比漏拦更糟的故障）。
      if (host !== node && host.contains(node) !== true) return null;
      return isEditableField(node) ? node : host;
    }

    /** 读草稿：textarea 走 value；contenteditable 走 innerText（Lexical 按段落分行）。 */
    function composerText(node) {
      if (node === null || node === undefined) return "";
      if (node.tagName === "TEXTAREA") return typeof node.value === "string" ? node.value : "";
      if (typeof node.innerText === "string") return node.innerText;
      return typeof node.textContent === "string" ? node.textContent : "";
    }

    /**
     * 清空草稿。textarea 用原生 value setter + input 事件；contenteditable 必须经
     * beforeinput 管线（全选 + execCommand('delete')）—— 直接改 textContent 会被
     * Lexical 下一次 reconcile 回滚，拿 textarea 原型 setter 打在 <div> 上会抛
     * TypeError。返回**是否真的清掉**（调用方须据此给可见提示）。
     */
    function clearComposerDraft(node) {
      if (!isEditableField(node)) return false;
      if (node.readOnly === true || node.disabled === true) return true;
      if (normDraft(composerText(node)) === "") return true;
      try {
        node.focus();
      } catch { /* 不可聚焦仍尝试删 */ }
      try {
        if (node.tagName === "TEXTAREA") {
          const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
          if (desc !== undefined && desc.set !== undefined) desc.set.call(node, "");
          else node.value = "";
          node.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          const sel = typeof window !== "undefined" && typeof window.getSelection === "function"
            ? window.getSelection() : null;
          const range = typeof document.createRange === "function" ? document.createRange() : null;
          if (sel !== null && range !== null) {
            range.selectNodeContents(node);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand("delete", false, null);
        }
      } catch {
        return false;
      }
      return normDraft(composerText(node)) === "";
    }
    //#endregion

    //#region interception listeners
    function attachInterception(ctx) {
      const onKeydown = (e) => {
        if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.isComposing === true) return; // 中文输入法选字回车不拦截
        const ta = composerFieldOf(e.target);
        if (ta === null) return;
        if (ta.readOnly === true || ta.disabled === true) return;
        const text = composerText(ta);
        const snap = shouldIntercept(text);
        if (snap === null) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showInterceptPopup(ta, text, "enter", snap);
      };
      const onClick = (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest('button[aria-label="发送消息"], button[aria-label="Send message"]');
        if (btn === null || btn.disabled) return;
        const card = btn.closest("[data-composer-card]");
        if (card === null) return;
        const ta = findComposerIn(card); // 两代输入面都认（见 composer compat 区）
        if (ta === null || ta.readOnly === true || ta.disabled === true) return;
        const text = composerText(ta);
        const snap = shouldIntercept(text);
        if (snap === null) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        showInterceptPopup(ta, text, "click", snap);
      };
      document.addEventListener("keydown", onKeydown, { capture: true });
      document.addEventListener("click", onClick, { capture: true });
      return () => {
        document.removeEventListener("keydown", onKeydown, { capture: true });
        document.removeEventListener("click", onClick, { capture: true });
      };
    }
    //#endregion

    //#region plugin
    function apply(ctx) {
      currentCtx = ctx;
      let disposed = false;
      const refresh = () => {
        if (disposed) return;
        fetchState().then(() => {
          if (disposed) return;
          maybeShowReminder();
        });
      };
      // 即时触发：连接事件流里出现新的 user/message 就立刻拉一次状态（兜底提醒更快）。
      let unsubscribe = null;
      try {
        const connection = ctx.get("connection");
        if (connection !== null && connection !== undefined && typeof connection.subscribeEnvelopes === "function") {
          unsubscribe = connection.subscribeEnvelopes((env) => {
            if (disposed) return;
            if (env !== null && typeof env === "object" && env.type === "session/event"
              && env.event !== null && typeof env.event === "object" && env.event.type === "user/message") {
              refresh();
            }
          });
        }
      } catch { /* 无连接服务时退化为轮询 */ }

      const detachInterception = attachInterception(ctx);

      ctx.effect(() => {
        pollTimer = setInterval(refresh, POLL_MS);
        refresh();
        return () => {
          disposed = true;
          if (pollTimer !== null) clearInterval(pollTimer);
          if (unsubscribe !== null) {
            try {
              unsubscribe();
            } catch { /* noop */ }
          }
          detachInterception();
          hideModal();
        };
      }, "dsh-offpeak: poll");
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
