'use strict';

// ---------------------------------------------------------------------------
// 配套 dsh 插件的唯一数据源。
//
// main.js 的 syncCompanionPlugins 与 scripts/sync-companion-plugins.js 曾
// 各自维护一份 COMPANION_PLUGINS 清单，历史上已发生过一次漂移（同步脚本
// 缺 better-sidebar / harness-pet）。新增或改名配套插件只改这里，两个同步
// 入口（桌面壳运行时 / WSL·Linux CLI）自动保持一致。
//
// 条目字段约定：
//   id    cordis.patch.yml 注册条目与插件管理页使用的 loader id；
//   name  profile node_modules 下的包名（含 scope）。
//   shipsNodeModules  源目录的 node_modules 是 git 跟踪的正件依赖树，随同步分发；
//                     缺省 false：源里的 node_modules 视为本机安装残留，绝不同步
//                     （dev 树上一次 pnpm install 就能产出 1.3 万文件的残留树）。
// ---------------------------------------------------------------------------

const COMPANION_PLUGINS = [
  { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  { id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' },
  { id: 'client-file-changes', name: '@deepseek-ai/dsh-client-file-changes' },
  { id: 'terminal', name: '@deepseek-ai/dsh-terminal-tab' },
  { id: 'better-sidebar', name: 'dsh-better-sidebar' },
  { id: 'harness-pet', name: 'harness-pet' },
  // 对话节点导航条（vlln/dsh-navbar，MIT）：对话区右缘节点串快速跳转
  // user 消息（悬停预览/点击跳转/滚轮切换），取代 conversation-tweaks
  // 内置的会话滑轨。
  { id: 'dsh-navbar', name: '@vlln/dsh-navbar' },
  // 对话删除与归档管理（本仓库内置）：会话行菜单删除按钮 + 设置内归档管理
  // 面板（恢复/删除）。依赖 patch-session-manage.js 的官方包运行时补丁。
  { id: 'dsh-session-manager', name: 'dsh-session-manager' },
  { id: 'conversation-tweaks', name: '@deepseek-ai/dsh-conversation-tweaks' },
  // Quest 模式界面（本仓库内置）：设置-通用里一键开关类 Quest 沉浸式界面
  // （分组会话栏 + 卡片式输入区 + 药丸元数据条），默认关闭、关闭时零开销。
  { id: 'quest-ui', name: '@deepseek-ai/dsh-quest-ui' },
  // id 必须与该插件 bundle 层 cordis.patch.yml 声明的 loader id 一致
  // （dsh-super-injector）。曾声明为 super-injector 导致 bundle 迁移自愈的
  // dropBlocksByIds 永不命中残留 insert 块 → 双登记启动崩溃（issue #104）。
  { id: 'dsh-super-injector', name: '@dsh-external/dsh-super-injector' },
  { id: 'prompt-custom', name: '@deepseek-ai/dsh-prompt-custom' },
  { id: 'workspace-anchor', name: '@deepseek-ai/dsh-workspace-anchor' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
  { id: 'side-session', name: '@dsh-external/dsh-side-session' },
  { id: 'compaction-acp', name: 'billion-context-dsh', shipsNodeModules: true },
  { id: 'plugin-manager', name: '@deepseek-ai/dsh-plugin-manager' },
  // 知识图谱记忆（adoresever/graph-memory，MIT）：跨会话图记忆 + PageRank /
  // 社区检测 + 向量去重；作者为 DSH 提供原生适配器（graph-memory/dsh 入口），
  // 内置后随壳分发，dsh-hub 中枢页直接显示装配状态与图谱统计。
  { id: 'graph-memory', name: 'graph-memory', shipsNodeModules: true },
  // 可视化插件市场（anywhere-labs/deepseek-harness-desktop 的 dsh-community-market，
  // MIT）：开放目录源（DSH 1024Store / dshfind / 标准 HTTP 源，用户自行添加
  // 与启用）、搜索、npm registry 校验安装、启停与回执管理。内置市场整体切换为
  // dsh-community-market（原 dshmarket 已退役：存量装配由 companion-profile 的
  // removeRetiredDshMarketDir / removeRetiredDshMarketPatchRows 一次性清理，
  // patch 层锚定 dropBlocksByIds('dsh-market')）。
  { id: 'community-market', name: 'dsh-community-market' },
  // 市场桌面服务桥（本仓库内置）：为 dsh-community-market 提供
  // desktopProfiles / desktopPnpm / desktopPlugins / desktopActions 四个
  // host 服务（上游市场在 DSH Plugin Desktop 壳层环境下的依赖契约）——
  // 包操作转 dsh CLI 重入、启停读写 cordis.patch.yml（与壳层插件管理页
  // 双向兼容）、重启走壳层监管通道。与市场本体同装卸载，无客户端半边。
  { id: 'market-desktop-bridge', name: 'dsh-market-desktop-bridge' },
  // 插件中枢（ARFCON/dsh-hub-DSH，MIT）：插件更新引擎（版本对比/一键更新/
  // 启停/卸载/启动自检修复）+ 全局记忆 + graph-memory / dsh-market 挂载 +
  // 自身更新检查；原生适配 Gitee 版客户端版本双源对比。
  { id: 'dsh-hub', name: 'dsh-hub', shipsNodeModules: true },
  // 手机桥（hzhz314159/dsh-mini，MIT）：从手机浏览器/App 驱动 DSH agent 会话
  // （收发文字/图片/文件、切换模型、平衡度环、局域网网关二维码配对）。
  // 随包附带手机 App 安装包 DSH-Mobile-v1.4.2.apk（assets/plugins/dsh-mini/）。
  { id: 'dsh-mini', name: '@deepseek-ai/dsh-mini' },
  // IM 桥（hzhz314159/openclaw-dsh-bridge，MIT）：微信/飞书官方频道桥接入 DSH
  // agent 会话（消息分片回写、通道适配器、去重限流）；QQ 由官方插件
  // @tencent-connect/dsh-qqbot 提供，不在本插件范围。
  { id: 'openclaw-bridge', name: '@deepseek-ai/dsh-openclaw-bridge' },
  // —— 效率插件包（借鉴 EAC 移植，纯客户端） ——
  // 拖入文件到对话：拖入文本/代码注入内容，图片/二进制注入路径提示。
  { id: 'file-drop', name: 'dsh-file-drop' },
  // 终端式上下键命令历史回溯：↑ 回溯上一条已发送用户消息、↓ 往前翻回较新，
  // 空草稿才触发、越界回到空、编辑即复位、按会话隔离。
  { id: 'input-history', name: 'dsh-input-history' },
  // 图片粘贴发送：Ctrl/Cmd+V 粘贴图片存临时目录后注入路径提示。
  { id: 'image-paste', name: 'dsh-image-paste' },
  // 对话回退：消息 hover 出「编辑并回退」，按上一回合分叉新会话重发。
  { id: 'message-rewind', name: 'dsh-message-rewind' },
  // AI 变更审核：审查模型刚做的改动（正确性/安全性/一致性）。
  { id: 'change-review', name: 'dsh-change-review' },
  // 自动压缩：接近上下文上限时自动发送 /compact。
  { id: 'auto-compact', name: 'dsh-auto-compact' },
  // 峰谷价格卫士：高峰时段发送前拦截提醒，可定时到闲时价自动执行。
  { id: 'offpeak', name: 'dsh-offpeak' },
  // 设置页左侧边栏自定义：显示/隐藏与排序设置导航项。
  { id: 'settings-nav-custom', name: 'dsh-settings-nav-custom' },
  // 设置页高级选项折叠：把低频选项行收进「高级选项」折叠组。
  { id: 'settings-groups', name: 'dsh-settings-groups' },
  // 会话地图（liangmianya/dsh-synapse，MIT）：可视化非线性对话工作区，
  // 把同一工作区内的会话/追问/分支呈现为可拖拽缩放的对话画布；bundle 插件，
  // 零依赖、复用现有 dsh web 服务。上游：https://github.com/liangmianya/dsh-synapse
  { id: 'synapse', name: 'dsh-synapse' },
  // 子代理活动快视（本仓库内置）：Task/subagent 委派调用的展开式活动视图
  // （内联命令/文件明细 + 打开子会话）+ 会话头部命令/文件聚合条；明细全部
  // 来自客户端已加载的会话事件流（零后端请求）。宿主半边仅注册 settings
  // 命名空间，UI 全在客户端半边（toolview 按 key 注册）。
  { id: 'dsh-subagent-lens', name: '@dsh-external/dsh-subagent-lens' },
  // 推理强度选择器（HanaAyane/dsh-reasoning-effort，MIT）：Codex 风格「模型 +
  // 推理强度」滑块，档位来自模型目录 reasoning.efforts；宿主半边只读诊断
  // 自定义 provider 缺 reasoningEfforts 声明并给 copy-ready 指引。与 F4 补丁
  // patch-pi-ai-reasoning-defaults 互补（本插件 UI/诊断面，F4 后端默认字典面）。
  // 取代已退役的 dsh-third-party-thinking（fake 档位注入 + fetch 拦截旁路）。
  { id: 'reasoning-effort', name: 'dsh-reasoning-effort' },
  // 基础能力面板（yxsj245/dsh-Basics-Panel，MIT）：设置页可视化并管理 MCP
  // 服务器 / 技能 / 规则，模块化 feature 注册表；MCP 空态带「新建」入口
  // （零 MCP 已添加时也显示「新建」按钮）。id 与 bundle 层 cordis.patch.yml
  // 声明的 loader id（basics-panel）一致。
  { id: 'basics-panel', name: 'dsh-basics-panel' },
  // 用户提示词折叠（本仓库内置）：对用户发出去的超长提示词（user 消息）默认
  // 折叠为前几行 + 「展开」遮罩，点击展开全文、再点「收起」收回；短消息零
  // 侵入、不碰代码块/图片/表格。纯客户端（DOM 定位 + CSS 折叠 + 事件委托）。
  { id: 'input-fold', name: 'dsh-input-fold' },
  // 知识中心（myYangyunfan/dsh_cardian，MIT）：RepoWiki / 知识卡片 / 记忆
  // 三区知识库，全部落地本地 Obsidian 仓库；宿主半边注册 cardian.* 工具族与
  // Typert 远端网关（remote.cardianRemote.*，typert-protocol 走安装根解析，
  // 同 dsh-hub 先例），客户端半边经 sidebar.footer.action + shell.overlay
  // 提供「知识树」面板；RAG 知识概览预注入系统提示。
  // 上游：https://github.com/myYangyunfan/dsh_cardian
  { id: 'cardian', name: 'dsh-cardian' },
];

/** 包名 → assets/plugins 下的目录名（去 scope 前缀）。 */
function companionDirName(p) {
  const slash = p.name.indexOf('/');
  return slash >= 0 ? p.name.slice(slash + 1) : p.name;
}

module.exports = { COMPANION_PLUGINS, companionDirName };
