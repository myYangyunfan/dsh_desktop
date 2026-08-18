# dsh-synapse（DSH Desktop 内置版）

> 上游：[liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) ｜ MIT License ｜ v0.3.0

把同一工作区里的会话、追问与分支变成一张**可浏览、可拖拽、可缩放的对话地图**。
不替代 DSH 的模型、工具、会话或权限逻辑——只在原生对话界面之上增加一个可视化工作台。

![Synapse UI](docs/images/synapse-ui.png)

## 在 DSH Desktop 中使用

**本插件已内置，无需安装。** 启动 DSH Desktop 后：

1. 选择工作目录，或打开一个已有会话；
2. 点击顶部 **「会话地图」** 进入画布（与「对话」并列的顶部切换入口）；
3. 在画布上：点击卡片或侧边栏会话即可切换当前会话（原生对话页同步跟随高亮）；「分支」操作保留一条替代路径；
4. 点卡片底部 **「详情」** 查看完整对话记录；点顶部 **「对话」** 或卡片「在 DSH 中打开」回到原生对话。

### 功能一览

| | 功能 | 说明 |
| --- | --- | --- |
| 🗺️ | 会话地图 | 在 DSH 原生对话与可视化画布之间一键切换 |
| 🌿 | 分支可见 | 通过 DSH 原生 session fork 创建分支，按真实分叉点连接节点 |
| 📁 | 工作区映射 | 读取 DSH 工作区与目录归属，在正确的项目上下文中创建会话 |
| 📥 | 持续投影 | 用户消息与助手回复实时投影为卡片，流式回复持续更新 |
| 🔧 | 工具过程折叠 | 工具调用/结果按 callId 配对折叠进助手回复卡 |
| ⚡ | 会话同步 | 原生对话 ↔ 画布双向同步当前会话 |
| 🎨 | 画布交互 | 拖动、缩放（最高 4×）、移动卡片（位置自动保存）、一键定位当前会话 |
| 🔒 | 原生会话不变 | 打开、追问、创建、归档仍由 DSH 会话系统完成 |

## 配置

通过 profile 的 `cordis.patch.yml`（`%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`）按行 id `synapse` 覆盖（整体替换 config，需重述全部键）：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `dataFile` | `$DSH_HOME/synapse/workspaces.json` | 画布元数据持久化路径 |
| `autoProjection` | `true` | 自动把已提交的 DSH 会话事件投影为画布卡片 |
| `projectionWorkspaceTitle` | `DSH 任务` | 投影工作区标题 |
| `trustedHosts` | `[]` | 额外放行的 Host（主机名或 主机:端口）；localhost / 127.0.0.1 始终放行 |

```yaml
# 覆盖示例（追加到 cordis.patch.yml）
- id: synapse
  config:
    dataFile: !!js dshHomePath('synapse/my-workspaces.json')
    autoProjection: true
    projectionWorkspaceTitle: 我的任务
    trustedHosts: []
```

## 数据与边界

- 画布元数据保存在 `$DSH_HOME\synapse\workspaces.json`（schema v4，旧数据自动迁移）；
- 会话内容仍由 DSH session log 保存与管理——删除画布数据不会丢失会话；
- 不启动第二个 Web 服务、不创建第二套 Agent，不改变模型与工具执行行为；
- 对模型无影响：不向任何请求添加系统提示、工具 schema 或上下文，不影响 KV 缓存复用。

## 已知限制

- 仅支持 web profile；
- 两个 dsh web 实例共享同一 profile 时会写同一个 `workspaces.json`（已加跨进程写锁，但仍建议单实例运行）。

## 与上游的差异

DSH Desktop 内置版与上游完全同源（文件原样分发），仅打包方式不同：

- 上游经 `dsh plugin --profile web add github:liangmianya/dsh-synapse` 安装；
- 内置版随 DSH Desktop 分发并自动装配（本目录为 vendored 副本，升级时以版本号比较，用户手动更新的更高版本不会被覆盖回退）。

## License

MIT（见 [LICENSE](LICENSE)，版权归属上游作者 liangmianya）。
