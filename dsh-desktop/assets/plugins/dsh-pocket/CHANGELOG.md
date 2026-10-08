# dsh-pocket

## 2.10.7

### Patch Changes

- 修「插件槽位整条崩掉、控制台 Minified React error #130」。

  `#130` 的判词是「元素类型是 undefined」——即我们渲染了一个 `undefined` 组件。
  真机现象是两条 slot 消失（`sidebar.footer.action` 与 `shell.overlay`），
  因为一个 undefined 组件会带走整条 slot 的渲染。

  根因：**图标成员名取自旧内核的命名**。旧版 `@deepseek-ai/dsh-client-ui-primitives`
  导出的是带尺寸后缀的名字（`IconApiOutline14`、`IconFolderOpenOutline16`），
  现内核（0.1.7-rc.1）的导出里**没有任何数字后缀**，同一图标按变体拆成
  `IconApiOutlineRegular` / `…Medium` / `…Artwork`。成员取到 `undefined` 后当组件渲染，
  就报 #130。`node_modules` 里残留的 0.1.1-rc.1 内核拷贝正是旧命名的来源，
  所以本地看 grep 有、真机加载就炸。

  - 8 个页内 bundle、169 处引用改成 `…Regular`（`tools/codemod/fix-icon-size-suffix.mjs`，
    逐名对快照核验，目标名不存在则拒绝写盘）。
  - `tools/audit/extract-kernel-snapshots.mjs` 改为解析 primitives **真实的
    `export { … }` 块**（新产出 `kernel-primitives-icons.json`，186 个名字），
    取代原先「扫任意大写标识符」的瞎猜 —— 那个版本把不存在的裸名
    `IconSearchOutline` 也判成合法，属假绿。
  - `tools/audit/namespace.js` 加第 ⑤b 条判据：页内 bundle 里对 primitives 的
    `Icon*` 成员访问必须命中快照，快照缺失时 fail-closed。

  验证（不靠推断，逐名对着 app.asar 核对）：从官方客户端
  `resources/app.asar` 解出 primitives 的真实导出 **186 个 Icon**，与仓库快照
  **双向相等（缺 0 / 多 0）**；扫我们全部包，引用 **32 种 / 169 处 Icon 成员，
  不存在者 0 处**。隔离实例真启动、全量启用，控制台 **#130 归零**。

- 修「装了却不挂载」，并退役阶梯分层元包。

  **22 个插件的页内 bundle 注册名改成包名。** 官方客户端真机一次报 20 条
  `client-modules: could not load "@dsh-pack/x": loaded without registering "@dsh-pack/x"
  via __ModuleLoader__.load`。内核 boot graph 行以**包名**为键
  （`dsh-client-modules/lib/client.js:625`），而 `register()` 的键是
  `stripClientSuffix(registration.id)`（同文件 569），我们的 bundle 却注册裸名
  （`'dsh-input-fold'`）或换代前的 `@dsh-external/…`，那一行永远等不到。失败形态是
  静默不挂载：宿主照常起来、插件没反应，所以补了一条 P0 门禁
  （`tools/audit/publish-readiness.js`）而不只是改一次。

  **`@dsh-pack/core` / `plus` / `knowledge` / `pocket` / `bridge` / `compaction` 退役，
  只留 `@dsh-pack/all`。** 阶梯分层在内核语义下不成立：`applyEntryPatches` 处理 `insert`
  是 `data.push(...insert)`，不按 id 去重（整行替换只作用于覆盖型补丁），所以两个元包同装
  会把共有成员装配两次，第二次注册路由即报 `webserver: duplicate exact route` ——
  真机那批「N entries did not activate」的成因。用内核自己的 `composeEntries` 实测
  core+all = 18 个重复 id。原来装过这些层的用户请改装 `@dsh-pack/all`。

  ⚠ 随之而来的使用约束：**装了 `all` 就不要再单独装其中的某个成员插件**，
  那同样会把那个成员插两次。想要小集合就别装 `all`，按用途分组单装。

