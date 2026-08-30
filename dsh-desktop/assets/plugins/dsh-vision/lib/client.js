// @deepseek-ai/dsh-vision 客户端半边：DSH 设置页的「识图插件」栏 +
// composer 工具行的「🖼 添加图片」按钮（多模态体感入口）。
// 字段与宿主半边 Config 一一对应：baseURL / apiKey / model /
// fallbackModels / maxTokens / timeoutMs / maxImageBytes。
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-vision",
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
      try {
        const webReactMod = require("@deepseek-ai/dsh-client-web-react");
        if (typeof webReactMod.bindSnapshotSelector === "function") bindSnapshotSelector = webReactMod.bindSnapshotSelector;
      } catch { /* compat 未注入（罕见）→ react 原生兜底 */ }
    }
    if (!bindSnapshotSelector) {
      const { useSyncExternalStore } = require("react");
      bindSnapshotSelector = (source) => {
        const subscribe = (fn) => source.subscribe(fn);
        const getSnapshot = () => source.getSnapshot();
        return (selector) => selector(useSyncExternalStore(subscribe, getSnapshot));
      };
    }
    const { Button, Tooltip, IconPaperclipOutline16 } = require("@deepseek-ai/dsh-client-ui-primitives");

    const NS = "dsh-vision";
    const DEFAULTS = {
      baseURL: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4.6v-flash",
      maxTokens: 2048,
      timeoutMs: 60000,
      maxImageBytes: 10485760
    };

    const L = {
      nav: "识图插件（view_image）",
      navSub: "为纯文本模型提供识图能力。填写任意 OpenAI 兼容 VLM 端点的地址与密钥后，会话中即可调用 view_image 工具；输入框旁的「📎」按钮可直接发图或发送文本文件——图片发送后由后台自动识别（识别结果以文本带入模型，界面仍显示原图），文本文件内容自动追加到输入框。",
      enabledLabel: "启用识图",
      enabledHint: "总开关，立即生效。关闭后：图片不再自动识别或转述（纯文本模型会按原样拒绝图片输入）、view_image 工具与输入框「📎」按钮一并停用；原生支持图片的模型不受影响。",
      enabledOn: "已开启：识图能力生效中",
      enabledOff: "已关闭：识图能力停用（上方配置保留，重新打开后即用）",
      baseURLLabel: "API 地址",
      baseURLHint: "OpenAI 兼容 base URL，例如 https://open.bigmodel.cn/api/paas/v4 或 http://localhost:11434/v1",
      apiKeyLabel: "API 密钥",
      apiKeyHint: "留空 = 保持已保存的密钥（密钥保存后不回显）；也可用环境变量 DSH_VISION_API_KEY / ZHIPUAI_API_KEY / DASHSCOPE_API_KEY；本地 Ollama 可留空",
      apiKeyPlaceholder: "已保存（不显示密钥）；留空 = 保持已存密钥",
      modelLabel: "模型",
      modelHint: "例如 glm-4.6v-flash（智谱免费）/ qwen3-vl-flash / glm-4.6v / qwen3-vl:4b",
      fallbackLabel: "备用模型",
      fallbackHint: "逗号分隔；主模型返回 429/404/5xx 时按顺序尝试，可留空",
      maxTokensLabel: "最大输出 token",
      timeoutLabel: "请求超时（毫秒）",
      maxImageBytesLabel: "图片大小上限（字节）",
      save: "保存",
      saving: "保存中…",
      saved: "已保存",
      loading: "加载中…",
      unavailable: "设置不可用（需要在本机浏览器中打开）",
      attachButton: "添加图片或文件（图片发送后自动识别；文本文件内容追加到输入框）",
      unsupportedFile: "「{name}」不支持：请选择图片或常见文本文件（txt / md / json / csv / 代码 / 日志等）",
      fileTooLarge: "「{name}」超过 2 MB 上限",
      binaryFile: "「{name}」是二进制文件，暂不支持（支持图片与常见文本文件）"
    };

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

    function textInput(value, onChange, type = "text", placeholder = "") {
      return jsx("input", {
        type,
        value: value || "",
        placeholder,
        style: { padding: "4px 8px", fontFamily: "inherit" },
        onChange: (e) => onChange(e.target.value)
      });
    }

    // 开关行：checkbox + 标签 + 说明。即时写 scope（enabled 是布尔，无「保持
    // 已存值」语义），不走保存按钮——与宿主半边 scope.watch 的热生效配套。
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
                onChange: (e) => onToggle(e.target.checked)
              }),
              jsxs("span", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
                jsx("span", { children: label }),
                hint ? jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: hint }) : null
              ] })
            ]
          }),
          statusLine ? jsx("span", { style: { fontSize: 12, opacity: 0.75 }, children: statusLine }) : null
        ]
      });
    }

    function VisionSettingsCard(props) {
      const { useScope, scope } = props;
      const snap = useScope((s) => s);
      const [form, setForm] = react.useState({});
      const [busy, setBusy] = react.useState(false);
      const [saved, setSaved] = react.useState(false);
      // 开关写入中的锁（hooks 必须位于提前 return 之前，顺序恒定）。
      const [toggling, setToggling] = react.useState(false);

      react.useEffect(() => {
        if (snap.status !== "ready") return;
        const v = snap.value || {};
        setForm({
          baseURL: String(v.baseURL || DEFAULTS.baseURL),
          apiKey: "",
          model: String(v.model || DEFAULTS.model),
          fallbackModels: Array.isArray(v.fallbackModels) ? v.fallbackModels.join(", ") : "",
          maxTokens: String(v.maxTokens ?? DEFAULTS.maxTokens),
          timeoutMs: String(v.timeoutMs ?? DEFAULTS.timeoutMs),
          maxImageBytes: String(v.maxImageBytes ?? DEFAULTS.maxImageBytes)
        });
      }, [snap.status]);

      if (snap.status !== "ready") {
        return jsx("div", { children: snap.status === "loading" ? L.loading : L.unavailable });
      }

      // 总开关：读快照、写 scope（即时热生效，不经保存按钮）。默认关——
      // 宿主 schema 默认 enabled=false；快照未解析出显式 true 一律视为关。
      const enabledOn = ((snap.value || {}).enabled) === true;
      const setEnabled = async (on) => {
        setToggling(true);
        try {
          await scope.set("enabled", on);
        } catch (error) {
          // 写失败不改变快照，checkbox 受控于快照会自动弹回原状态。
          console.warn("[dsh-vision] 切换识图开关失败:", error);
        } finally {
          setToggling(false);
        }
      };

      const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
      const numberOr = (text, fallback) => {
        const n = Number(text);
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };

      const save = async () => {
        setBusy(true);
        setSaved(false);
        try {
          const apiKeyValue = (form.apiKey || "").trim();
          const values = {
            baseURL: (form.baseURL || "").trim() || DEFAULTS.baseURL,
            model: (form.model || "").trim() || DEFAULTS.model,
            fallbackModels: (form.fallbackModels || "").split(",").map((s) => s.trim()).filter(Boolean),
            maxTokens: numberOr(form.maxTokens, 2048),
            timeoutMs: numberOr(form.timeoutMs, 60000),
            maxImageBytes: numberOr(form.maxImageBytes, 10485760)
          };
          for (const [key, value] of Object.entries(values)) {
            const have = (snap.value || {})[key];
            // 不把「等于插件默认值」且存储里没有的字段写进配置：默认值本就由
            // 宿主生效，写死会把未来模型/端点变化的适配空间一起固化（例如
            // maxTokens 2048 遇上旧模型上限 1024 直接 400）。
            // 注：apiKey 不在 DEFAULTS 中，不受此跳过影响（保留 #32 的语义）。
            if (have === undefined && DEFAULTS[key] !== undefined && JSON.stringify(value) === JSON.stringify(DEFAULTS[key])) continue;
            if (JSON.stringify(value) !== JSON.stringify(have)) await scope.set(key, value);
          }
          // apiKey 是 role('secret') 字段：settings.describe 会脱敏、永不回显，
          // 表单里它恒为空。只有用户这次输入了非空新值才写入；留空 = 保持
          // 已保存的密钥 —— 否则「改模型/地址后点保存」会把已存密钥静默清空
          // （用户反馈“识图 API 密钥没法保存”的根因）。
          if (apiKeyValue !== "") await scope.set("apiKey", apiKeyValue);
          setSaved(true);
        } finally {
          setBusy(false);
        }
      };

      return jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 12, padding: 16, maxWidth: 560 },
        children: [
          jsx("h2", { children: L.navSub }),
          toggleRow(
            L.enabledLabel,
            L.enabledHint,
            enabledOn,
            (on) => { if (!toggling) void setEnabled(on); },
            enabledOn ? L.enabledOn : L.enabledOff
          ),
          fieldRow(L.baseURLLabel, L.baseURLHint, textInput(form.baseURL, set("baseURL"))),
          fieldRow(L.apiKeyLabel, L.apiKeyHint, textInput(form.apiKey, set("apiKey"), "password", L.apiKeyPlaceholder)),
          fieldRow(L.modelLabel, L.modelHint, textInput(form.model, set("model"))),
          fieldRow(L.fallbackLabel, L.fallbackHint, textInput(form.fallbackModels, set("fallbackModels"))),
          fieldRow(L.maxTokensLabel, null, textInput(form.maxTokens, set("maxTokens"), "number")),
          fieldRow(L.timeoutLabel, null, textInput(form.timeoutMs, set("timeoutMs"), "number")),
          fieldRow(L.maxImageBytesLabel, null, textInput(form.maxImageBytes, set("maxImageBytes"), "number")),
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
              saved ? jsx("span", { children: L.saved }) : null
            ]
          })
        ]
      });
    }

    // —— 多模态体感：composer 工具行「📎 添加图片或文件」按钮 ——
    // 图片 → 官方 createDraftImages 校验/注册（MIME 白名单、限额）→
    // inputActions.addImages 加入草稿（与官方粘贴/拖放同一链路）；发送后由
    // 宿主半边 llm/stream 后台识别，界面始终显示原图、识别文本不进会话。
    // 文本文件 → 浏览器端读取（纯前端，无需宿主通道）→ 截断后经
    // inputActions.setDraft 追加进草稿（用户发送前可见、可编辑、可删除）。
    // 二进制/未知类型 → 错误提示。按钮外观完全复刻官方「/」命令按钮
    // （InputBar .add：28×28 圆形、--dsw-specific-selector、hover 实心）。
    // 组件 props 由 slots 渲染器注入 standard kit（session 作用域）：
    // inputActions = 官方 InputActions（sessions.provide props 注入）；
    // input = InputState 快照（zone owner 提供，含当前草稿 draft）。
    const TEXT_FILE_EXTENSIONS = new Set([
      "txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "yml", "yaml",
      "xml", "html", "htm", "css", "scss", "less", "js", "mjs", "cjs", "ts",
      "jsx", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs",
      "rb", "php", "sh", "bash", "zsh", "ps1", "bat", "cmd", "ini", "cfg",
      "conf", "log", "toml", "sql", "env", "svg", "diff", "patch", "vue",
      "svelte", "dockerfile", "makefile", "gemfile", "rakefile", "justfile",
      "license", "copying", "notice", "editorconfig", "properties", "proto", "graphql", "tex",
      "gitignore", "gitattributes", "npmrc"
    ]);
    // 无扩展名的约定俗成文件名（Dockerfile/LICENSE…）走全名小写匹配。
    const PLAIN_NAME_TEXT = new Set([
      "dockerfile", "makefile", "gemfile", "rakefile", "justfile",
      "license", "copying", "notice", "readme", "changelog", "contributing"
    ]);
    const MAX_FILE_TEXT_BYTES = 64 * 1024; // 单文件注入草稿的文本上限（截断尾部）
    const MAX_ATTACH_BYTES = 2 * 1024 * 1024; // 单文件读取上限（防大文件卡顿）
    const BINARY_PROBE_BYTES = 512; // 前 512 字节含 NUL → 判为二进制

    /** 文件扩展名（小写；.gitignore 这类点开头名字返回点后整段）。 */
    function fileExtension(name) {
      const base = String(name || "").toLowerCase();
      const i = base.lastIndexOf(".");
      if (i < 0) return base.startsWith(".") ? base.slice(1) : "";
      const ext = base.slice(i + 1);
      return ext === "" ? base.slice(1) : ext;
    }

    /** 分类：image（官方草稿通道）/ text（读取追加草稿）/ unsupported（提示）。 */
    function classifyFile(file) {
      const type = String((file && file.type) || "");
      if (type.startsWith("image/")) return "image";
      const ext = fileExtension(file && file.name);
      if (TEXT_FILE_EXTENSIONS.has(ext)) return "text";
      const base = String((file && file.name) || "").toLowerCase();
      if (PLAIN_NAME_TEXT.has(base)) return "text";
      return "unsupported";
    }

    function looksBinary(data) {
      const n = Math.min(data.length, BINARY_PROBE_BYTES);
      for (let i = 0; i < n; i++) {
        if (data[i] === 0) return true;
      }
      return false;
    }

    function formatBytes(n) {
      if (n < 1024) return n + " B";
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
      return (n / 1024 / 1024).toFixed(1) + " MB";
    }

    /** 读取文本文件内容（UTF-8；二进制检测；超限截断）。失败抛错。 */
    async function readFileText(file) {
      if (file.size > MAX_ATTACH_BYTES) {
        const error = new Error("file-too-large");
        error.fileName = file.name;
        throw error;
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      if (looksBinary(buf)) {
        const error = new Error("binary-file");
        error.fileName = file.name;
        throw error;
      }
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.length > MAX_FILE_TEXT_BYTES) {
        text = text.slice(0, MAX_FILE_TEXT_BYTES) + `\n…（内容过长已截断，原 ${buf.length} 字节）`;
      }
      return text;
    }

    /** 拼装追加进草稿的附件文本块。 */
    function buildAttachmentInsertion(file, text) {
      return `\n\n📎 附件：${file.name}（${formatBytes(file.size)}）\n---- 文件内容 ----\n${text}`;
    }

    const ATTACH_BUTTON_CSS = [
      ".dsh-vision-attach-btn{background:var(--dsw-specific-selector);width:28px;height:28px;",
      "color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:999px;",
      "flex:none;place-items:center;display:grid;padding:0}",
      ".dsh-vision-attach-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}",
      ".dsh-vision-attach-btn:disabled{opacity:.5;cursor:default}"
    ].join("");

    const CSS_TAG = "@dsh-external/dsh-vision/client.css";
    function ensureCss() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG) + "]")) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "@dsh-external/dsh-vision";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = ATTACH_BUTTON_CSS;
      document.head.appendChild(tag);
    }

    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: NS });
      const useScope = bindSnapshotSelector(scope);
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "dsh-vision",
        order: 75,
        label: () => L.nav,
        inject: () => ({ useScope, scope })
      }, VisionSettingsCard), "dsh-vision: settings section entry");

      ensureCss();
      // conversation 服务（createDraftImages/releaseDraftImages）由
      // ui-conversation 注册在根上下文；缺失时按钮禁用而非崩溃。
      let conversation;
      try { conversation = ctx.get("conversation"); } catch { conversation = undefined; }
      const canAttach = !!conversation && typeof conversation.createDraftImages === "function" &&
        typeof conversation.releaseDraftImages === "function";

      function VisionImageButton({ inputActions, input }) {
        const fileRef = react.useRef(null);
        // 总开关关闭时整颗按钮消失（返回 null）：图片通道此时在宿主侧也已
        // 停用，留着入口只会让用户撞上「模型不支持图片输入」。默认关：快照
        // 未就绪（loading/unavailable）时保守隐藏，就绪且显式开启才显示。
        const enabledSnap = useScope((s) => (s.status === "ready" ? ((s.value || {}).enabled === true) : false));
        const actions = inputActions || {};
        if (!enabledSnap) return null;
        const disabled = !canAttach || typeof actions.addImages !== "function" || typeof actions.setDraft !== "function";
        const pick = () => {
          if (!disabled && fileRef.current) fileRef.current.click();
        };
        const notify = (level, message) => {
          if (typeof actions.notify === "function") actions.notify(level, message);
        };
        const appendDraft = (text) => {
          const current = input && typeof input.draft === "string" ? input.draft : "";
          actions.setDraft(current + text);
        };
        const onChange = async (e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length === 0) return;
          const images = files.filter((file) => classifyFile(file) === "image");
          if (images.length > 0) {
            try {
              const drafts = conversation.createDraftImages(images);
              if (!actions.addImages(drafts.map((draft) => draft.id))) conversation.releaseDraftImages(drafts);
            } catch (error) {
              console.warn("[dsh-vision] 添加图片失败:", error);
              notify("error", error instanceof Error ? error.message : String(error));
            }
          }
          for (const file of files) {
            const kind = classifyFile(file);
            if (kind === "image") continue;
            if (kind !== "text") {
              notify("error", L.unsupportedFile.replace("{name}", file.name));
              continue;
            }
            try {
              const text = await readFileText(file);
              appendDraft(buildAttachmentInsertion(file, text));
            } catch (error) {
              const reason = error && error.message === "file-too-large"
                ? L.fileTooLarge.replace("{name}", file.name)
                : error && error.message === "binary-file"
                  ? L.binaryFile.replace("{name}", file.name)
                  : error instanceof Error ? error.message : String(error);
              notify("error", reason);
            }
          }
        };
        return jsxs(react.Fragment, {
          children: [
            jsx("input", {
              ref: fileRef,
              type: "file",
              accept: "image/*,.txt,.md,.markdown,.json,.jsonl,.csv,.tsv,.yml,.yaml,.xml,.html,.htm,.css,.scss,.less,.js,.mjs,.cjs,.ts,.jsx,.tsx,.py,.java,.c,.h,.cpp,.hpp,.cs,.go,.rs,.rb,.php,.sh,.bash,.zsh,.ps1,.bat,.cmd,.ini,.cfg,.conf,.log,.toml,.sql,.svg,.diff,.patch,.vue,.svelte,.tex,.env,.properties,.proto,.graphql",
              multiple: true,
              style: { display: "none" },
              onChange
            }),
            jsx(Tooltip, {
              label: L.attachButton,
              side: "top",
              delayMs: 500,
              children: jsx("button", {
                type: "button",
                className: "dsh-vision-attach-btn",
                "aria-label": L.attachButton,
                disabled,
                onClick: pick,
                children: jsx(IconPaperclipOutline16, { size: 14 })
              })
            })
          ]
        });
      }

      ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
        name: "conversation.input.left",
        id: "dsh-vision-image",
        order: 80
      }, VisionImageButton), "dsh-vision: attach button");
    }

    exports.apply = apply;
    exports.inject = ["slots", "settingsScope"];
    return module.exports;
  }
});
