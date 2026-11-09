// dsh-builtin-manager — client 半边：设置页「内置插件」栏。
//
// 0.2.0 重做（用户裁定「搜索+筛选+单列表」）—— 交互与视觉同时回炉：
//   1. 工具栏：搜索框（名称/标识/描述）+「重新读取」；状态筛选（全部/已启用/已停用）带计数，
//      计数与列表同源（都从 rows 现算），筛选后另给「当前显示 M 条」——数字不会互相说谎。
//   2. 单列表卡片行：名称 + 状态 Tag + 描述（两行截断，悬停看全文）+ 行尾开关。
//      写入成功给行下一条反馈 +「已改动 · 下次启动生效」标记；写入失败不翻转行状态、
//      原因原文落在行下（行内反馈，不再把全页提示顶在列表上方互相盖）。
//   3. 全套内核设计系统原语（Button/Switch/SegmentedControl/Input/Tag + 官方图标），
//      颜色与圆角走 --dsw-* 变量 —— 与「内置插件」等既有设置页同语言，不再是自绘 checkbox。
//
// 页面只做两件事：读 sidecar 那份内置件清单（含启用态），以及把用户的开关交给
// sidecar 写。所有文件写入都在壳侧（单一写者），所以这里不碰 cordis.patch.yml，
// 也不假装能即时生效——停用是**下次启动生效**（patch 层在内核装配期读取）。
//
// 本次加「版本 / 检查更新 / 单个更新」——仍然只做界面：下载、校验、备份、替换全在
// sidecar（dsh:plugin-check-updates / dsh:plugin-update），页面只读结果。
//   - 行数据可能带 version（旧 sidecar 不带）——缺省就整段不渲染，不显示 "vundefined"。
//   - 检查结果按行 id 合并；检查失败落页内错误行，列表照常可用（不整页炸）。
//   - better-sidebar 由 sidecar 从检查里排除，这里再按 id 兜一层：绝不画一个后端
//     必然拒绝的更新按钮（它的更新走随包整包换代，不是单插件下载）。
//
// 组件刻意保持单层（不拆子组件）：本仓库的 client 回归夹具是「真实 React +
// 手驱钩子」的迷你挂载器，只能展开一层函数组件；拆出去就不是难测，而是测不到。
// note()/normalize() 是纯函数，不进组件树，随便放。
window.__ModuleLoader__.load({
  id: "dsh-builtin-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const { jsx, jsxs } = require("react/jsx-runtime");
    // 内核设计系统原语（与 dsh-prompt-custom 等伴随插件同款引入姿势：顶部一次性引入）。
    const {
      Button, Input, SegmentedControl, Switch, Tag,
      IconRefreshOutlineRegular, IconSearchOutlineRegular
    } = require("@deepseek-ai/dsh-client-ui-primitives");

    const ZH = {
      tab: "内置插件",
      loading: "正在读取内置插件清单…",
      noBridge: "没接到桌面客户端的插件通道（页面里没有 window.dshDesktop）。"
        + "内置插件的启停由桌面客户端执行，请在 DSH Desktop 窗口里打开本页；"
        + "用浏览器直接访问内核页面时只能查看，不能修改。",
      loadFailed: "读取内置插件清单失败：",
      saveFailed: "保存失败：",
      saved: "已保存「{name}」为{state}。",
      saving: "正在保存…",
      retry: "重新读取",
      checkUpdates: "检查更新",
      checking: "正在检查…",
      checkFailed: "检查更新失败：",
      checkUnsupported: "当前桌面客户端不支持检查更新（桥里没有 checkUpdates）。",
      checkItemFailed: "检查失败：",
      latestIs: "已是最新：{version}",
      latestIsBare: "已是最新",
      latestOf: "最新 {version}",
      updateTag: "可更新",
      update: "更新",
      updating: "正在更新…",
      updated: "已更新到 {version} · 下次启动生效",
      updatedBare: "已更新 · 下次启动生效",
      updateFailed: "更新失败：",
      updateUnsupported: "当前桌面客户端不支持更新（桥里没有 update）。",
      searchAria: "搜索内置插件",
      searchPlaceholder: "搜索名称、标识或描述",
      filterLabel: "按状态筛选",
      filterAll: "全部 {n}",
      filterOn: "已启用 {n}",
      filterOff: "已停用 {n}",
      count: "共 {n} 条内置插件",
      countShown: "共 {n} 条内置插件 · 当前显示 {m} 条",
      noneMatch: "没有匹配的内置插件——换个关键词，或把筛选切回「全部」。",
      empty: "清单里没有任何内置插件（随包交付门禁可能被裁过）。",
      restartNote: "改动会立刻写进配置：本页与界面里的插件视图刷新页面即更新（实测：停用后重载就读不到这条了），"
        + "插件的内核半边则在下次启动生效。",
      on: "启用",
      off: "停用",
      stateOn: "已启用",
      stateOff: "已停用",
      changed: "已改动 · 下次启动生效",
      switchLabel: "切换「{name}」的启用状态",
      locked: "这一项由内核或交付清单管理，不能在这里改。",
      removed: "已卸载，不能在这里改。",
      configLock: "带自定义配置，禁止在此停用。",
      selfLock: "这是本管理页自己：停用后这条唯一的内置插件开关面就跟着消失，界面上再也开不回来，所以不能在这里关。",
      takeoverCompaction: "接管期说明：本件会把预设里的 compaction-basic 与 command-compact 两行改成停用，"
        + "压缩改由它自己的代理执行——所以会话里看不到 /compact 命令，模型也不再走内核那套自动压缩。"
        + "这是接管生效的样子，不是装坏了。"
    };
    const EN = {
      tab: "Built-in plugins",
      loading: "Reading the built-in plugin list…",
      noBridge: "No desktop bridge on this page (window.dshDesktop is missing). Built-in plugins are "
        + "switched by the DSH Desktop shell, so open this page inside the app; a plain browser view is read-only.",
      loadFailed: "Failed to read the built-in plugin list: ",
      saveFailed: "Save failed: ",
      saved: "Saved “{name}” as {state}.",
      saving: "Saving…",
      retry: "Reload",
      checkUpdates: "Check for updates",
      checking: "Checking…",
      checkFailed: "Update check failed: ",
      checkUnsupported: "This desktop build cannot check for updates (no checkUpdates on the bridge).",
      checkItemFailed: "Check failed: ",
      latestIs: "Up to date: {version}",
      latestIsBare: "Up to date",
      latestOf: "Latest {version}",
      updateTag: "Update available",
      update: "Update",
      updating: "Updating…",
      updated: "Updated to {version} · takes effect on next launch",
      updatedBare: "Updated · takes effect on next launch",
      updateFailed: "Update failed: ",
      updateUnsupported: "This desktop build cannot update plugins (no update on the bridge).",
      searchAria: "Search built-in plugins",
      searchPlaceholder: "Search name, id or description",
      filterLabel: "Filter by state",
      filterAll: "All {n}",
      filterOn: "Enabled {n}",
      filterOff: "Disabled {n}",
      count: "{n} built-in plugins",
      countShown: "{n} built-in plugins · showing {m}",
      noneMatch: "No matching built-in plugin — try another keyword or switch the filter back to All.",
      empty: "No built-in plugin in the list (the packaging gate may have trimmed it).",
      restartNote: "The change is written to the config at once: this page and the in-page plugin views update on reload, "
        + "while each plugin's host half takes effect on the next launch.",
      on: "enabled",
      off: "disabled",
      stateOn: "Enabled",
      stateOff: "Disabled",
      changed: "Changed · takes effect on next launch",
      switchLabel: "Toggle “{name}”",
      locked: "Managed by the kernel or the delivery list; not editable here.",
      removed: "Uninstalled; not editable here.",
      configLock: "Has custom configuration, so it cannot be switched here.",
      selfLock: "This is the manager page itself. Switching it off also removes the only built-in plugin switch surface, "
        + "and the UI can no longer turn it back on, so it cannot be disabled here.",
      takeoverCompaction: "Takeover note: this plugin disables the preset’s compaction-basic and command-compact rows and "
        + "compacts through its own proxy — so the /compact command disappears from sessions and the kernel’s own "
        + "auto-compaction no longer runs. That is what a working takeover looks like, not a broken install."
    };
    // 语言每次渲染时取：页面刷新即换，不值得为它订阅字典事件。
    const dict = () => (String((typeof navigator !== "undefined" && navigator.language) || "")
      .toLowerCase().indexOf("zh") === 0 ? ZH : EN);

    // 与本包 cordis.patch.yml 的 loader id、sidecar 行 id 同值（回归测试咬三方一致）。
    const SELF = "dsh-builtin-manager";

    // 不参与「单个更新」的件：better-sidebar 随包整包换代（sidecar 的 checkUpdates 也
    // 把它排除了）。按 id 兜底，避免后端契约变化时界面画出必然失败的按钮。
    const UPDATE_EXCLUDED_ID = "better-sidebar";

    // 接管类内置件：它们装上去的第一件事是**改掉内核原有行为**，而用户看到的是
    // 「某个功能不见了」。这类误解是本仓库真付过代价的一类报障（「上下文压缩插件有问题」），
    // 所以按 id 在行内直说一句，而不是指望用户去翻文档。
    //   bili-native（billion-context 0.1.213）：bili-compaction-gate 把预设里的
    //   compaction-basic / command-compact 两行改成 disabled，压缩迁到它的代理侧 →
    //   会话里的 /compact 命令随之消失（回归锁 unit-billion-context-gate）。
    const TAKEOVER_NOTES = { "bili-native": "takeoverCompaction" };

    /** 行内「接管期说明」文案；不在表里就返回空串（render 据此整段不画）。 */
    function takeoverNote(row, L) {
      const key = row && TAKEOVER_NOTES[row.id];
      return key && L[key] ? L[key] : "";
    }

    // 颜色与圆角全走内核设计系统变量（--dsw-*）。
    const S = {
      root: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
      toolbar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
      // grid 包裹是为了让原语的 inline-flex 外框被拉伸到可用宽度（flex 项的内容宽度默认收在 240）。
      search: { flex: "1 1 240px", minWidth: 200, display: "grid" },
      filterRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
      hint: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
      list: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
      card: {
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "10px 12px",
        border: "1px solid var(--dsw-alias-border-l2)",
        borderRadius: "var(--dsw-radius-md)",
        background: "var(--dsw-alias-bg-layer-2)"
      },
      body: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
      nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
      name: { fontWeight: 600, fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" },
      // 版本号 / 「最新 x」共用：muted 小字，等宽数字（同一列比较版本时不会跳）。
      version: {
        fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)",
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"
      },
      desc: {
        fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
      },
      note: { fontSize: 12, lineHeight: "18px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
      // 行尾动作列：更新按钮在上、开关在下，右对齐；宽度不参与行主体压缩。
      actions: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flex: "0 0 auto" },
      switchWrap: { paddingTop: 2, flex: "0 0 auto" }
    };

    // 行内反馈/说明共用的文字块：ok=成功（绿）、error=失败原文（红）、muted=说明。
    function note(text, tone) {
      return jsx("div", {
        style: Object.assign({}, S.note, {
          color: tone === "error" ? "var(--dsw-alias-label-error)"
            : (tone === "ok" ? "var(--dsw-alias-state-success-primary)"
              : "var(--dsw-alias-label-tertiary)")
        }),
        children: text
      });
    }

    // 桥返回的形状既可能是裸数组，也可能是 {plugins:[...]}，两种都收；
    // 只留在册内置件（group==='companion'），坏行直接丢——清单不全是页面不能整页炸。
    function normalize(rows) {
      const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.plugins) ? rows.plugins : []);
      return list
        .filter((r) => r && typeof r === "object" && typeof r.id === "string")
        .filter((r) => r.group === "companion");
    }

    // 版本号显示：行数据可能没有 version（旧 sidecar），也可能已经带 v（上游 tag 风格）。
    // 空值返回空串，调用点据此整段不渲染——不显示 "vundefined" 这种假版本。
    function displayVersion(v) {
      const s = String(v === null || v === undefined ? "" : v).trim();
      if (s === "") return "";
      return /^v/i.test(s) ? s : "v" + s;
    }

    function PanelSection() {
      const L = dict();
      const bridge = (typeof window !== "undefined" && window.dshDesktop && window.dshDesktop.pluginManager) || null;
      const [rows, setRows] = react.useState([]);
      const [state, setState] = react.useState(bridge ? "loading" : "no-bridge");
      const [loadError, setLoadError] = react.useState("");
      // 三张按行 id 索引的过程态表：行内反馈（成功/失败/在途）、写入在途、本次会话改过。
      const [notes, setNotes] = react.useState({});
      const [busy, setBusy] = react.useState({});
      const [changed, setChanged] = react.useState({});
      const [query, setQuery] = react.useState("");
      const [filter, setFilter] = react.useState("all");
      // 更新链的状态：检查结果（按行 id 索引）、检查在途、检查失败原文、逐行更新在途。
      const [updates, setUpdates] = react.useState({});
      const [checking, setChecking] = react.useState(false);
      const [checkError, setCheckError] = react.useState("");
      const [updating, setUpdating] = react.useState({});

      const load = react.useCallback(async () => {
        if (!bridge) { setState("no-bridge"); return; }
        setState("loading"); setLoadError("");
        try {
          const list = normalize(await bridge.list());
          setRows(list);
          setState(list.length === 0 ? "empty" : "ready");
        } catch (e) {
          setLoadError(String((e && e.message) || e));
          setState("failed");
        }
      }, [bridge]);

      react.useEffect(() => { load(); }, [load]);

      // 「检查更新」：sidecar 回 {ok:true, items:[...]}（也容忍裸数组）。items 每项至少
      // {id, latest, hasUpdate}（部分实现另带 current/source/error）。按行 id 建表；
      // 检查失败只写错误行，不动 rows/state——列表照常可读可开关。
      const check = react.useCallback(async () => {
        if (!bridge) return;
        if (typeof bridge.checkUpdates !== "function") { setCheckError(L.checkUnsupported); return; }
        setChecking(true); setCheckError("");
        try {
          const r = await bridge.checkUpdates();
          if (r && r.ok === false) {
            setCheckError(String(r.error || r.message || ""));
            return;
          }
          const items = Array.isArray(r) ? r : (r && Array.isArray(r.items) ? r.items : []);
          const next = {};
          items.forEach((it) => { if (it && typeof it.id === "string") next[it.id] = it; });
          setUpdates(next);
        } catch (e) {
          setCheckError(String((e && e.message) || e));
        } finally {
          setChecking(false);
        }
      }, [bridge, L]);

      const toggle = react.useCallback(async (row, next) => {
        if (!bridge) return;
        setNotes((prev) => ({ ...prev, [row.id]: { text: L.saving, tone: "muted" } }));
        setBusy((prev) => ({ ...prev, [row.id]: true }));
        try {
          const r = await bridge.setEnabled(row.id, next);
          if (r && r.ok === false) {
            // sidecar 拒了就是拒了：状态不回写、不显示「已保存」，把原因原文请出来。
            setNotes((prev) => ({ ...prev, [row.id]: { text: L.saveFailed + String(r.error || r.message || ""), tone: "error" } }));
            return;
          }
          setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, enabled: next } : x)));
          setChanged((prev) => ({ ...prev, [row.id]: true }));
          setNotes((prev) => ({ ...prev, [row.id]: {
            text: L.saved.replace("{name}", row.name || row.id).replace("{state}", next ? L.on : L.off),
            tone: "ok"
          } }));
        } catch (e) {
          setNotes((prev) => ({ ...prev, [row.id]: { text: L.saveFailed + String((e && e.message) || e), tone: "error" } }));
        } finally {
          setBusy((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
        }
      }, [bridge, L]);

      // 「更新」：sidecar 回 {ok:true, version, restartRequired} 或 {ok:false, error}。
      // 失败保留更新按钮（可重试）、原文上屏；成功后摘掉该行的更新态并重新 load()，
      // 让版本号回到 sidecar 的新事实——反馈文案里另给目标版本，不靠列表自证。
      const runUpdate = react.useCallback(async (row) => {
        if (!bridge) return;
        if (typeof bridge.update !== "function") {
          setNotes((prev) => ({ ...prev, [row.id]: { text: L.updateUnsupported, tone: "error" } }));
          return;
        }
        setUpdating((prev) => ({ ...prev, [row.id]: true }));
        setNotes((prev) => ({ ...prev, [row.id]: { text: L.updating, tone: "muted" } }));
        try {
          const r = await bridge.update(row.id);
          if (!r || r.ok === false) {
            setNotes((prev) => ({ ...prev, [row.id]: {
              text: L.updateFailed + String((r && (r.error || r.message)) || ""),
              tone: "error"
            } }));
            return;
          }
          const next = (r && r.version) || (updates[row.id] && updates[row.id].latest) || "";
          setNotes((prev) => ({ ...prev, [row.id]: {
            text: next ? L.updated.replace("{version}", displayVersion(next)) : L.updatedBare,
            tone: "ok"
          } }));
          setUpdates((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
          setChanged((prev) => ({ ...prev, [row.id]: true }));
          await load();
        } catch (e) {
          setNotes((prev) => ({ ...prev, [row.id]: { text: L.updateFailed + String((e && e.message) || e), tone: "error" } }));
        } finally {
          setUpdating((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
        }
      }, [bridge, load, updates, L]);

      if (state === "no-bridge") {
        return jsx("section", {
          children: jsx("p", { style: { fontSize: 12, opacity: .75 }, children: L.noBridge }, "msg")
        }, "no-bridge");
      }
      if (state === "loading") return jsx("p", { children: L.loading }, "loading");

      const q = query.trim().toLowerCase();
      const shown = rows.filter((row) => {
        if (filter === "on" && row.enabled !== true) return false;
        if (filter === "off" && row.enabled === true) return false;
        if (q === "") return true;
        return [row.name, row.id, row.description].some((v) => String(v || "").toLowerCase().indexOf(q) !== -1);
      });
      const enabledCount = rows.filter((r) => r.enabled === true).length;
      const anyBusy = Object.keys(busy).length > 0 || Object.keys(updating).length > 0;
      const filterOptions = [
        { value: "all", label: L.filterAll.replace("{n}", String(rows.length)) },
        { value: "on", label: L.filterOn.replace("{n}", String(enabledCount)) },
        { value: "off", label: L.filterOff.replace("{n}", String(rows.length - enabledCount)) }
      ];
      const countText = shown.length === rows.length
        ? L.count.replace("{n}", String(rows.length))
        : L.countShown.replace("{n}", String(rows.length)).replace("{m}", String(shown.length));

      return jsxs("section", {
        style: S.root,
        children: [
          jsxs("div", {
            style: S.toolbar,
            children: [
              jsx("div", {
                style: S.search,
                children: jsx(Input, {
                  type: "search",
                  value: query,
                  disabled: state !== "ready",
                  placeholder: L.searchPlaceholder,
                  "aria-label": L.searchAria,
                  icon: jsx(IconSearchOutlineRegular, {}),
                  onChange: (e) => setQuery(e.target.value)
                }, "input")
              }, "search"),
              jsx(Button, {
                variant: "ghost",
                size: "sm",
                icon: jsx(IconRefreshOutlineRegular, {}),
                disabled: state !== "ready" || checking || anyBusy,
                title: L.checkUpdates,
                onClick: check,
                children: checking ? L.checking : L.checkUpdates
              }, "check-updates"),
              jsx(Button, {
                variant: "ghost",
                size: "sm",
                icon: jsx(IconRefreshOutlineRegular, {}),
                disabled: anyBusy,
                title: L.retry,
                onClick: load,
                children: L.retry
              }, "reload")
            ]
          }, "toolbar"),
          state === "failed" ? note(L.loadFailed + loadError, "error") : null,
          state === "ready" && checkError !== "" ? note(L.checkFailed + checkError, "error") : null,
          state === "empty" ? note(L.empty, "muted") : null,
          state === "ready" ? jsxs("div", {
            style: S.filterRow,
            children: [
              jsx(SegmentedControl, {
                id: "dsh-builtin-manager-filter",
                value: filter,
                options: filterOptions,
                label: L.filterLabel,
                onChange: (v) => setFilter(v)
              }, "filter"),
              jsx("span", { style: S.hint, children: countText }, "count")
            ]
          }, "filters") : null,
          state === "ready" && rows.length > 0 && shown.length === 0 ? note(L.noneMatch, "muted") : null,
          state === "ready" && shown.length > 0 ? jsx("div", {
            style: S.list,
            children: shown.map((row) => {
              // 本管理页自己必须锁死：停用它就把这条唯一的内置件开关面一起关掉，界面上开不回来
              // （实测：写进 disabled 之后页面重载就读不到这条了，不必等下次启动）。
              const self = row.id === SELF;
              const locked = self || row.toggleable !== true || row.removed === true;
              const why = self ? L.selfLock
                : (row.removed === true ? L.removed
                  : (row.hasConfig === true && row.enabled === false ? L.configLock : L.locked));
              const rowBusy = busy[row.id] === true;
              const rowUpdating = updating[row.id] === true;
              const rowNote = notes[row.id];
              const caveat = takeoverNote(row, L);
              // 更新链只对「有检查结果且判定可更新」的行开控件；removed 行与
              // better-sidebar（随包整包换代）不画按钮。检查失败/已是最新另走行内说明。
              const upd = updates[row.id];
              const excluded = row.id === UPDATE_EXCLUDED_ID;
              const updateOffered = !!upd && upd.hasUpdate === true && !upd.error
                && row.removed !== true && !excluded;
              const latestText = upd && upd.latest ? displayVersion(upd.latest) : "";
              return jsxs("div", {
                "data-plugin-id": row.id,
                style: S.card,
                children: [
                  jsxs("div", {
                    style: S.body,
                    children: [
                      jsxs("div", {
                        style: S.nameRow,
                        children: [
                          jsx("span", { style: S.name, children: row.name || row.id }, "name"),
                          row.version ? jsx("span", { style: S.version, children: displayVersion(row.version) }, "version") : null,
                          jsx(Tag, {
                            tone: row.enabled === true ? "success" : "neutral",
                            children: row.enabled === true ? L.stateOn : L.stateOff
                          }, "state"),
                          changed[row.id] ? jsx(Tag, { tone: "warning", children: L.changed }, "changed") : null,
                          updateOffered ? jsx(Tag, { tone: "warning", children: L.updateTag }, "update-tag") : null,
                          updateOffered && latestText
                            ? jsx("span", { style: S.version, children: L.latestOf.replace("{version}", latestText) }, "latest")
                            : null
                        ]
                      }, "head"),
                      row.description ? jsx("div", { style: S.desc, title: row.description, children: row.description }, "desc") : null,
                      caveat ? note(caveat, "muted") : null,
                      locked ? note(why, "muted") : null,
                      upd && !excluded && upd.error
                        ? note(L.checkItemFailed + String(upd.error), "error")
                        : null,
                      upd && !excluded && !upd.error && upd.hasUpdate === false
                        ? note(latestText ? L.latestIs.replace("{version}", latestText) : L.latestIsBare, "muted")
                        : null,
                      rowNote ? note(rowNote.text, rowNote.tone) : null
                    ]
                  }, "body"),
                  jsxs("div", {
                    style: S.actions,
                    children: [
                      updateOffered ? jsx(Button, {
                        variant: "secondary",
                        size: "sm",
                        disabled: rowUpdating || rowBusy,
                        title: L.update,
                        onClick: () => runUpdate(row),
                        children: rowUpdating ? L.updating : L.update
                      }, "update") : null,
                      jsx("div", {
                        style: S.switchWrap,
                        children: jsx(Switch, {
                          checked: row.enabled === true,
                          disabled: locked || rowBusy,
                          label: L.switchLabel.replace("{name}", row.name || row.id),
                          title: locked ? why : undefined,
                          onChange: (next) => toggle(row, next)
                        }, "switch")
                      }, "switch")
                    ]
                  }, "actions")
                ]
              }, row.id);
            })
          }, "list") : null,
          note(L.restartNote, "muted")
        ]
      }, "panel");
    }

    function apply(ctx) {
      ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
        name: "settings.plugins.tab",
        id: "builtin",
        order: 20,
        label: () => dict().tab
      }, (props) => jsx(PanelSection, props)));
    }

    const inject = ["slots"];
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
