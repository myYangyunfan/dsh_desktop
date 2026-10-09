# @deepseek-ai/dsh-prompt-custom

## 0.3.5

### Patch Changes

- 修「配置文件是 JSON 数组时误报陌生字段」。

  `prompt-custom.json` 写成合法 JSON **数组**（如 `["a","b"]`）后，`GET /config` 返回
  `unknownConfigKeys = ["0","1"]`，界面提示「有不认识的字段 `0`、`1`」—— 无意义且误导。
  根因：`readFileConfig()` 的守卫 `typeof parsed === 'object'` 放过了数组
  （`typeof [] === 'object'`），`detectUnknownConfigKeys()` 对它 `Object.keys()` 就得到 `"0"`、`"1"`。
  同一份改动里**写入侧早已防数组、读取侧没防**。
  修法：守卫补 `!Array.isArray(parsed)`。

  ⚠️ 早期验证用的是**空数组** `[]` —— 空数组没有键、看起来一切正常，这条 bug 一度漏过。
  「只测空数组」验不出这类 bug，回归用例必须用**非空数组**。

## 0.3.4

### Patch Changes

- 写盘改为**非破坏性合并**，不再不可逆地抹掉别的版本写下的字段。

  0.3.3 加了陌生字段警告（「配置文件里有本版本不认识的字段，请先备份」），但用户一点
  「保存」，「警告 → 保存 → 静默清除」就是一次**不可逆的数据丢弃**：`writeFileConfig(live)`
  只写 `enabled/mode/text` 三个字段，文件里其它版本的键被永久删掉，警告也随之消失。
  根因：写盘是「整文件重写」，不是「只覆盖自己拥有的字段」。
  修法：读原文件 → 合并本插件字段 → 写回（`{ ...base, ...cfg }`），未知键保留。

  回归证据：保存后磁盘仍是 `{enabled:true, mode:"replace", text:"NEW", prefix:"KEEP-ME", suffix:"KEEP-ME-TOO"}`；
  **非字符串/嵌套未知键也保住**（`ttl:42`、`nested:{a:[1,2,3]}`、`flag:true`、`nil:null`）。
  并配 mutant 反证：变异回 `{ ...cfg }` 后未知键消失 → 判据确实能红。

## 0.3.3

### Patch Changes

- `/preview` 移除恒为 `undefined` 的死字段 `sections[].order`。

  内核 `assemble()` 返回的 section 只有 `{ name, text, interpolate? }`，**没有 `order`**；
  order 要用 `getSectionOrder('常量名')` 取，而 `s.name` 是节名、取不到 —— 原来那句
  `order: s && s.order` 永远输出 `undefined`、JSON 序列化时被丢弃。
  修法：`sectionNames()` 只返回 `{ name }`；判据是键集合**恰好为 `['name']`**、连 `'order' in s` 都为假。

- 新增 `unknownConfigKeys`（配置 schema 演进的警报）。

  配置文件可能被**另一个版本**的插件写过；0.3.3 起 `/config` 与 `/preview` 都返回
  「本版本不认识的键」列表，界面顶部给出警告 —— 否则「新版本写了新字段、旧版本读不懂」
  会变成又一次静默失效。验证含**冷启动路径**：磁盘里就有陌生键、一次 POST 都不发就报出。

- 抽出 `EXPECT_PROTO` 常量。

  原来 `data.proto !== 2` 散在 `load()` 与 `loadPreview()` 两处，改协议号容易只改一处。

## 0.3.2

### Patch Changes

- 修「预览框是空的」——宿主/client 版本错配。

  用户重启后点「预览官方提示词」，预览框一片空白。取证确证：提供 HTTP 接口的进程
  启动时间（21:52:47）**早于** 0.3.1 的源码同步时间（22:07:17），且 `GET /config`
  返回的字段集合是 0.3.0 的契约（7 个、无 `unknownVariables`），而界面按钮已是 0.3.1 的
  —— 结论：**页面刷新过了，宿主进程没有重启**。宿主 Node 进程里的插件代码不重启不会换，
  0.3.1 的 client 去读 `data.official` 得到 `undefined` → 空框。
  （附带口径：「页面刷新会换 client」这一步是从界面变化反推的；`/plugins/<包>/client.js?rev=`
  的 rev-busted 细节来自内核源码分析、未在本机 HTTP 复现，勿当已复现事实引用。）

  修法三件：host 增加 `const API_PROTO = 2`，经 `status()` 在 `/config` 与 `/preview`
  都返回 `proto`；client 检测 `data.proto !== 2` → **页面顶部**给出醒目提示（明确写
  「请完全退出 DeepSeek Harness 再启动；只刷新页面不会重载宿主插件」）；client 在缺
  `official`/`effective` 时**退化为 `data.text`**，不再显示空框。
  回归证据：`proto:2` 时不得误报（3 处反例），旧形状 `/preview` 下预览框显式断言
  `!== "(空)"`，警告确实在页面顶部（DOM 顺序断言）。

## 0.3.1

### Patch Changes

- 修「预览官方提示词」里显示的是用户自己的提示词 —— 0.3.0 引入的真 bug。

  0.3.0 把 `/preview` 改成只返回 `assemble({agent, scope:agent})` 并塞进 `text`，
  但那个按钮的语义是「**官方**提示词（不含自定义节），供对照编辑」。
  修法：`/preview` 同时返回两份，语义分开 —— `official = assemble({})`、
  `effective = assemble({agent, scope:agent})`、`text = official`（兼容字段）；
  client 拆成两个按钮。

- 预览补齐变量插值，并新增未知/畸形变量告警。

  0.3.0 的预览直接把各节原文拼起来，`{{model}}` / `{{cwd}}` 是**字面量**，
  用户看到的不是模型真正看到的东西。修法：用 `assemble()` 返回的 `variables` 做替换，
  未知/畸形变量**原样保留**并回报；变量名一律从内核真实装配的 `variables` 取、
  **不写死**，避免误报。告警的意义：内核 `renderPrompt` 遇未知变量会**抛错**、
  会让每一轮模型步都失败，而页面上原本一点提示都没有。

- 启用开关 / 注入方式改为**即时生效**（原「无法关闭这个插件，勾取消不了」）。

  实测结论：服务端关闭完全正常（`POST {enabled:false}` → `armed:false injected:0`）。
  根因判定为**交互不可自证** —— 那个勾要额外点「保存」才生效，取消勾之后界面没有任何
  即时反馈。修法：开关/模式 onChange 直接 POST；**POST 失败时把表单拨回服务端真实状态**
  （绝不允许界面显示一个没生效的开关）；正文仍走「保存提示词」并显示未保存改动；
  任何改动生效后已打开的预览**自动重新拉取**。

- 实测确认两种注入方式均正常：`replace` 下官方 persona 的 prefix/suffix 均被遮蔽、
  只剩自定义文本；`append` 下官方 persona 保留 + `dsh:custom-prompt` 追加在末尾。

## 0.3.0

### Patch Changes

- 修注入**静默失效**（本插件最核心的一次修复）。

  现象：设置页开关是开的、点保存显示「已保存」，但系统提示词**完全没有被注入**。
  根因：内核的节注册表是**分层**的，判重只在**同一层内**发生。旧版把节注册在
  插件自己的（根）ctx 上，而根层早已被 `SystemPrompt` 构造函数占用，于是必然抛：

  ```
  prompt section "deployment:persona-prefix" is already registered
  (for a per-agent override, register through that agent's `agent.ctx` instead)
  ```

  旧版把这个异常 `try/catch` **吞进 logger**，HTTP 只回 `applied:null` ——
  用户侧表现为「开关是开的、保存显示成功、但提示词根本没进去」。

  修法：照官方范例（`dsh-file-reference-local:339-372`）改为**按 agent 作用域注入**：
  `agent.ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section(...))`；
  节名保持**同名**才能形成遮蔽；replace 时 suffix 必须**显式补空节**，否则全局 suffix
  仍生效；生命周期 = `agents.list()` 补历史 + `agent/created` 增量 + `agent/disposed` 清理；
  节的 `text` 传**函数**（改文本无需重注册）；安装/卸载走一条**永不 reject** 的串行队列
  （它挂在 `agent/created` 上，rejection 会让会话创建失败）；`/preview` 改为带
  `{agent, scope: agent}`；`/config` 不再只回 `applied`，改为 `armed` / `agents` /
  `injected` / `lastError`。

  顺带修掉两个真缺陷：① `GET /config` 只同步 `live`、不同步**已注册形态** → 会出现
  「`armed:false` 但 `injected:1`」的自相矛盾，甚至把官方人设整段抹掉；② 节的 text 函数
  在「形态不匹配」时返回空串 → replace 模式下会把人设**整段抹掉**，改为无条件取
  `live.text`，另加 `textShadow` 兜底「清空文本的转换窗口」。

  回归证据（真实内核 + 真实插件）：负对照 —— 在根 ctx 上重放旧逻辑**仍抛重名错**；
  replace 后 `assemble({scope:agent})` 只剩自定义文本、官方 prefix/suffix 均被遮蔽；
  `assemble({})` 仍是官方文本（未污染全局）；append↔replace 切换不残留；关开关后回到官方；
  微任务级采样确认清空文本窗口**零空人设帧**。

## 0.2.0

### Minor Changes

- 独立移植版（本次工作的起点）。

  把随附的 `@deepseek-ai/dsh-prompt-custom` **0.1.1 源码**移植成**不依赖内核私有 API**
  的独立插件：

  | 上游版（0.1.1） | 移植版（0.2.0） |
  |---|---|
  | 依赖 `ctx.settings.register`（新内核已无此 API） | 自持 JSON 配置 `$DSH_HOME/prompt-custom.json` |
  | `import` 内核 `@deepseek-ai/*` 包 | **不 import 任何内核包**（避免版本漂移导致 entry 未激活 → 客户端启动失败） |
  | 设置走内核 settings | 设置走**插件自己的 HTTP 路由** |

  > 也正是这次移植时**丢了「按 agent 注册」这一步**，才埋下了 0.3.0 修的那个静默失效。

## 0.1.2

### Patch Changes

- 修「设置开关永久禁用、控制台零报错」。

  上一轮把页内半边从幽灵的 `ctx.settingsScope` 换成 `ctx.remote.settings` 之后，
  真浏览器里设置行**渲染出来了但点不动**：`disabled: true`，且控制台一行错误都没有。

  根因：`inject` 里只声明了 `"remote"`，没声明 `"remote.settings"`。
  这种时候 `ctx.remote.settings` 拿到的不是 undefined（所以不抛错），而是一个
  **永不 settle 的代理** —— `describe()` 的 promise 既不 resolve 也不 reject，
  于是快照永远停在 `loading`，控件永久禁用。
  官方 5 个用它的包（dsh-client-ui-settings / -general / -models /
  permission-presets / agent-preset）全都同时声明两个名字。

  - 6 个包的 `inject` 补上 `"remote.settings"`。
  - `tools/audit/settings-api.js` 加第 ④ 条判据：调 `ctx.remote.settings.*` 却没声明
    `"remote.settings"` 即 error；配套两条反证用例（缺声明必红、补上必绿）。
  - AGENTS.md 契约 11 记下这条，因为它的不失败症状是「什么都不发生」，最难查。

  端到端实测（隔离实例、真浏览器、真点击）：
  开关可点 → `aria-checked` 翻转 → `data-dsh-quiet-output="1"` 立即生效 →
  **整页重载后仍为 true** → 临时 profile 的 `cordis.patch.yml` 里出现
  `- id: conversation-tweaks / config: quietOutput: true`（写路径经内核 config editor、
  按 profile 条目 id 落盘）。

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

