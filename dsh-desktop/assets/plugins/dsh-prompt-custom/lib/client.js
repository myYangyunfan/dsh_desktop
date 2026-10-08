// dsh-prompt-custom（独立移植版）— client 半边：设置页「自定义提示词」栏。
//
// 0.3.1 交互修正（针对用户反馈）：
//   1. 启用开关 / 注入方式**即时生效**，不再需要先点保存 —— 否则「取消了勾但看起来没关掉」
//      完全无法自证。开关和模式属于「怎么注入」，改了就立刻 POST。
//   2. 提示词**正文**仍走「保存提示词」按钮（避免把半截编辑偷偷存进去），
//      并且会显示「有未保存的改动」，不再让人猜。
//   3. 预览拆成两份，语义分开：「预览官方提示词」（不含自定义节的官方全文，供对照编辑）
//      与「预览实际生效」（模型这一步真正看到的全文）。此前只返回后者，
//      于是「预览官方提示词」里出现的是用户自己的文案。
//   4. 任何改动生效后，已打开的预览会自动重新拉取，不会停在旧文本上。
//   5. 提示词里写了未知/畸形变量时给出警告 —— 内核 renderPrompt 遇到这种引用会**抛错**，
//      会让每一次模型步都失败，而页面上原本什么都看不到。
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-prompt-custom",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");

    const CONFIG_URL = "/api/dsh-prompt-custom/config";
    const PREVIEW_URL = "/api/dsh-prompt-custom/preview";
    // 必须与 host 半边的 API_PROTO 一致。改协议号时**只改两处**：host 的 API_PROTO、这里的 EXPECT_PROTO。
    const EXPECT_PROTO = 2;

    const L = {
      nav: "自定义提示词",
      title: "自定义提示词",
      sub: "编辑注入内核的系统提示词：追加到默认人设之后，或整体替换默认人设。开关与注入方式即时生效；正文改动对下一次模型装配生效，无需新建会话。",
      enabled: "启用自定义提示词",
      enabledHint: "关闭后回落为官方默认提示词（勾选即时生效，不需要点保存）",
      mode: "注入方式",
      modeHint: "切换后即时生效（两种方式的挂载点不同，会重新注入）",
      modeAppend: "追加到末尾（保留默认人设）",
      modeReplace: "替换整体（覆盖默认人设）",
      text: "提示词内容",
      textHint: "按原样注入；可用 {{model}} {{cwd}} 等内核变量。",
      save: "保存提示词",
      saving: "保存中…",
      applying: "应用中…",
      saved: "已保存",
      dirty: "提示词内容有未保存的改动，点「保存提示词」才会生效。",
      loading: "加载中…",
      unavailable: "设置不可用（需要在本机浏览器中打开）",
      previewOfficial: "预览官方提示词",
      previewEffective: "预览实际生效",
      previewing: "加载中…",
      previewOfficialHint: "官方全文，不含本插件的自定义节 —— 对照着写替换内容用。",
      previewEffectiveHint: "模型这一步真正看到的全文（已含自定义节）。",
      previewNoAgent: "当前没有活动会话，暂时只能看到全局视图；新建会话后再看「实际生效」更准。",
      staleHost: "⚠ 界面与宿主插件版本不一致：宿主返回的接口没有 proto/official 字段，说明页面刷新过了、但宿主进程没有重启。请**完全退出** DeepSeek Harness（含托盘/任务管理器里的残留进程）再启动 —— 只刷新页面不会重载宿主插件。在重启之前，预览会退化为旧接口的文本。",
      unknownCfgKeys: (keys) => "⚠ 配置文件里有本版本不认识的字段：" + keys + "。这通常说明该文件是**另一个版本**的插件写的 —— 当前版本可能没有读到你先前的设置。请先备份配置文件再继续操作。",
      previewError: "预览加载失败",
      varWarn: (names) => "警告：这些变量内核不认识 —— " + names + "。内核遇到未知变量会直接报错，导致每一轮运行失败，请改成正确的变量名或删掉。",
      varMalformed: (names) => "警告：这些引用写法不合法 —— " + names + "。变量名只能是 [a-z][a-z0-9_]*。",
      storage: "配置文件",
      stOff: "已停用：回落为官方默认提示词",
      stArmed: "已启用：新建会话时自动注入",
      stInjected: (n) => "已生效：当前 " + n + " 个会话已注入",
      stError: (m) => "注入失败：" + m
    };

    /** 把 /config 返回的 armed / injected / lastError 翻成一句人能看懂的状态。 */
    function statusLine(st) {
      if (!st) return null;
      if (st.lastError) return { text: L.stError(st.lastError), tone: "error" };
      // 旧版 host 不返回 armed/injected：这时无从判断，宁可不显示，
      // 也不要因为 !undefined 而谎报「已停用」（跨版本混装时会反向骗人）。
      if (st.armed === undefined && st.injected === undefined) return null;
      if (!st.armed) return { text: L.stOff, tone: "muted" };
      if (st.injected > 0) return { text: L.stInjected(st.injected), tone: "ok" };
      return { text: L.stArmed, tone: "muted" };
    }

    function row(label, hint, input) {
      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsx("span", { children: label }),
          input,
          hint ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: hint }) : null
        ]
      });
    }

    function note(text, tone) {
      return jsx("div", {
        style: {
          fontSize: 12,
          color: tone === "error" ? "#d93025" : (tone === "warn" ? "#b26a00" : undefined),
          opacity: tone === "muted" ? 0.75 : 1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        },
        children: text
      });
    }

    const EMPTY = { enabled: false, mode: "append", text: "" };

    function Card() {
      const [cfg, setCfg] = react.useState(EMPTY);          // 表单态（正文可能未保存）
      const [savedCfg, setSavedCfg] = react.useState(EMPTY); // 服务端已保存的配置
      const [state, setState] = react.useState("loading");
      const [busy, setBusy] = react.useState(false);
      const [notice, setNotice] = react.useState("");
      const [preview, setPreview] = react.useState(null);    // { kind, text, error }
      const [previewBusy, setPreviewBusy] = react.useState(false);
      const [vars, setVars] = react.useState({ unknown: [], malformed: [] });
      const [file, setFile] = react.useState("");
      const [st, setSt] = react.useState(null);
      // 宿主进程没重启、页面却刷新过时，接口会缺字段（见 L.staleHost）。
      const [stale, setStale] = react.useState(false);
      // 配置文件里有本版本不认识的键（配置 schema 演进的保护，见 L.unknownCfgKeys）。
      const [cfgKeys, setCfgKeys] = react.useState([]);

      const applyStatus = (data) => {
        setSt({ armed: data.armed, injected: data.injected, lastError: data.lastError });
        setVars({ unknown: data.unknownVariables || [], malformed: data.malformedVariables || [] });
        setCfgKeys(data.unknownConfigKeys || []);
      };

      const load = react.useCallback(async () => {
        try {
          const resp = await fetch(CONFIG_URL, { headers: { accept: "application/json" } });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) { setState("error"); return; }
          const c = data.config || EMPTY;
          setCfg(c);
          setSavedCfg(c);
          setFile(data.path || "");
          setStale(data.proto !== EXPECT_PROTO);
          applyStatus(data);
          setState("ready");
        } catch (e) { setState("error"); }
      }, []);

      react.useEffect(() => { load(); }, [load]);

      const loadPreview = react.useCallback(async (kind) => {
        setPreviewBusy(true);
        try {
          const resp = await fetch(PREVIEW_URL, { headers: { accept: "application/json" } });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) throw new Error((data && data.message) || ("HTTP " + resp.status));
          // 宿主旧接口只有 text：退化为它，而不是显示一个空框让用户猜。
          const fromNew = kind === "effective" ? data.effective : data.official;
          const text = fromNew !== undefined ? fromNew : data.text;
          setPreview({ kind, text: String(text || "(空)") });
          setStale(data.proto !== EXPECT_PROTO);
          applyStatus(data);
        } catch (e) {
          setPreview({ kind, text: L.previewError + ": " + String((e && e.message) || e), error: true });
        } finally { setPreviewBusy(false); }
      }, []);

      // preview 在 post 的闭包里会是旧值，用 ref 取当前显示的预览类型。
      const previewRef = react.useRef(null);
      react.useEffect(() => { previewRef.current = preview; }, [preview]);

      /** 统一的写入口。成功后把已保存态对齐，并刷新已打开的预览。 */
      const post = async (body) => {
        setBusy(true); setNotice("");
        try {
          const resp = await fetch(CONFIG_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              enabled: !!body.enabled,
              mode: body.mode === "replace" ? "replace" : "append",
              text: String(body.text || "")
            })
          });
          const data = await resp.json();
          if (!resp.ok || !data || data.ok === false) throw new Error((data && data.message) || ("HTTP " + resp.status));
          const c = data.config || body;
          setSavedCfg(c);
          applyStatus(data);
          setNotice(data.lastError ? "" : L.saved);
          const shown = previewRef.current;
          if (shown && !shown.error) loadPreview(shown.kind);
          return true;
        } catch (e) {
          setNotice(String((e && e.message) || e));
          return false;
        } finally { setBusy(false); }
      };

      /**
       * 开关 / 模式即时生效。正文一律用**已保存**的那份，
       * 避免把用户编辑到一半、还没点保存的内容偷偷写进去。
       */
      const applyShape = async (patch) => {
        const next = {
          enabled: patch.enabled !== undefined ? patch.enabled : savedCfg.enabled,
          mode: patch.mode !== undefined ? patch.mode : savedCfg.mode,
          text: savedCfg.text
        };
        setCfg((prev) => Object.assign({}, prev, patch));
        const ok = await post(next);
        if (!ok) {
          // 失败就把表单拉回真实状态，绝不让界面显示一个没生效的开关。
          setCfg((prev) => Object.assign({}, prev, { enabled: savedCfg.enabled, mode: savedCfg.mode }));
        }
      };

      const dirtyText = String(cfg.text || "") !== String(savedCfg.text || "");
      const previewShown = preview && !preview.error;

      if (state === "loading") return jsx("div", { children: L.loading });
      if (state === "error") return jsx("div", { children: L.unavailable });

      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 14, padding: 16, maxWidth: 720 },
        children: [
          jsx("h2", { style: { margin: 0 }, children: L.title }),
          jsx("div", { style: { fontSize: 12, opacity: 0.7 }, children: L.sub }),
          stale ? note(L.staleHost, "error") : null,
          cfgKeys.length ? note(L.unknownCfgKeys(cfgKeys.map((k) => "`" + k + "`").join("、")), "error") : null,
          row(L.enabled, L.enabledHint, jsx("input", {
            type: "checkbox",
            checked: !!cfg.enabled,
            disabled: busy,
            onChange: (e) => applyShape({ enabled: e.target.checked })
          })),
          row(L.mode, L.modeHint, jsxs("select", {
            value: cfg.mode === "replace" ? "replace" : "append",
            disabled: busy,
            style: { padding: "4px 8px" },
            onChange: (e) => applyShape({ mode: e.target.value }),
            children: [
              jsx("option", { value: "append", children: L.modeAppend }),
              jsx("option", { value: "replace", children: L.modeReplace })
            ]
          })),
          row(L.text, L.textHint, jsx("textarea", {
            value: String(cfg.text || ""),
            rows: 12,
            placeholder: "You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
            style: { width: "100%", fontFamily: "inherit", padding: "6px 8px", boxSizing: "border-box" },
            onChange: (e) => setCfg(Object.assign({}, cfg, { text: e.target.value }))
          })),
          jsxs("div", {
            style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
            children: [
              jsx("button", { type: "button", disabled: busy, onClick: () => post(cfg), children: busy ? L.saving : L.save }),
              jsx("button", { type: "button", disabled: previewBusy, onClick: () => loadPreview("official"), children: previewBusy ? L.previewing : L.previewOfficial }),
              jsx("button", { type: "button", disabled: previewBusy, onClick: () => loadPreview("effective"), children: previewBusy ? L.previewing : L.previewEffective }),
              notice ? jsx("span", { style: { fontSize: 12, opacity: 0.8 }, children: notice }) : null
            ]
          }),
          dirtyText ? note(L.dirty, "warn") : null,
          file ? jsx("div", { style: { fontSize: 12, opacity: 0.6 }, children: L.storage + ": " + file }) : null,
          (() => {
            const s = statusLine(st);
            return s ? note(s.text, s.tone) : null;
          })(),
          vars.malformed.length ? note(L.varMalformed(vars.malformed.map((n) => "{{" + n + "}}").join("、")), "warn") : null,
          vars.unknown.length ? note(L.varWarn(vars.unknown.map((n) => "{{" + n + "}}").join("、")), "warn") : null,
          preview ? jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: 4 },
            children: [
              jsx("span", {
                style: { fontSize: 12, opacity: 0.7 },
                children: preview.error
                  ? preview.text
                  : (preview.kind === "effective" ? L.previewEffectiveHint : L.previewOfficialHint)
              }),
              preview.error ? null : jsx("textarea", {
                value: preview.text,
                readOnly: true,
                rows: 16,
                style: { width: "100%", fontFamily: "monospace, inherit", fontSize: 12, padding: "6px 8px", boxSizing: "border-box", resize: "vertical" }
              })
            ]
          }) : null,
          previewShown && preview.kind === "effective" && !(st && st.injected) ? note(L.previewNoAgent, "muted") : null
        ]
      });
    }

    function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-prompt-custom",
        order: 60,
        label: () => L.nav
      }, (props) => jsx(Card, props)));
    }

    const inject = ["slots"];
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
