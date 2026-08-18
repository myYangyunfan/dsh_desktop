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
// ---------------------------------------------------------------------------

const COMPANION_PLUGINS = [
  { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  { id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' },
  { id: 'client-file-changes', name: '@deepseek-ai/dsh-client-file-changes' },
  { id: 'terminal', name: '@deepseek-ai/dsh-terminal-tab' },
  { id: 'better-sidebar', name: 'dsh-better-sidebar' },
  { id: 'harness-pet', name: 'harness-pet' },
  { id: 'float-window', name: '@deepseek-ai/dsh-float-window' },
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
  { id: 'third-party-thinking', name: '@deepseek-ai/dsh-third-party-thinking' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
  { id: 'side-session', name: '@dsh-external/dsh-side-session' },
  { id: 'compaction-acp', name: 'billion-context-dsh' },
  { id: 'plugin-manager', name: '@deepseek-ai/dsh-plugin-manager' },
  // 知识图谱记忆（adoresever/graph-memory，MIT）：跨会话图记忆 + PageRank /
  // 社区检测 + 向量去重；作者为 DSH 提供原生适配器（graph-memory/dsh 入口），
  // 内置后随壳分发，dsh-hub 中枢页直接显示装配状态与图谱统计。
  { id: 'graph-memory', name: 'graph-memory' },
  // 可视化插件市场（dsh-market/dsh-market，MIT）：浏览/搜索/一键安装社区插件。
  // v0.3.11 起内置市场整体切换为 dshmarket（原 zat-dsh-engine 已默认移除，
  // 存量装配由 main.js 的 retireZatEngine 一次性清理）。
  { id: 'dsh-market', name: 'dshmarket' },
  // 插件中枢（ARFCON/dsh-hub-DSH，MIT）：插件更新引擎（版本对比/一键更新/
  // 启停/卸载/启动自检修复）+ 全局记忆 + graph-memory / dsh-market 挂载 +
  // 自身更新检查；原生适配 Gitee 版客户端版本双源对比。
  { id: 'dsh-hub', name: 'dsh-hub' },
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
];

/** 包名 → assets/plugins 下的目录名（去 scope 前缀）。 */
function companionDirName(p) {
  const slash = p.name.indexOf('/');
  return slash >= 0 ? p.name.slice(slash + 1) : p.name;
}

module.exports = { COMPANION_PLUGINS, companionDirName };
