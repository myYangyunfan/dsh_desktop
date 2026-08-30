# dsh-session-manager

对话删除与归档管理（DSH Desktop 内置配套插件，MIT）。

dsh 官方只有「归档」（workspace 域 `archivedSessionIds`），没有删除，也没有
取消归档（unarchive）。本插件补齐：

- **会话行 ⋯ 菜单「删除对话」**：位于「归档会话」下方（所有会话行均显示，含当前会话）；
  点击后确认框 → 宿主 RPC 删除会话日志与附件（**正在运行**的会话会被拒绝）→
  列表实时移除。
- **设置 → 「归档对话管理」**：列出全部已归档对话（标题/项目/更新时间），
  每条提供「恢复」（回到原工作区与顺序）与「删除」。

## 实现依赖（随 DSH Desktop 分发）

- `scripts/patch-session-manage.js` 在启动/打包时对官方包做幂等补丁（0.1.2-alpha.1
  内核会话 RPC 已重写为 `@Remote`/typert 协议，`dsh-host-apiproxy` 已拆解）：
  - `dsh-workspace`：`WorkspaceRegistry.unarchiveSession`
  - `dsh-session`：`SessionStore.remove`
  - `dsh-api-workspace-controller`：`workspace.unarchiveSession` / `workspace.deleteSession`
    RPC（命令实现 + 控制器门面 + typert.host STRICT 描述符 + 客户端模型/服务门面；
    删除拒绝运行中会话，按 jsonl 布局移除会话目录，清理归档集合并广播
    `session/disposed`）
  - `dsh-api-remotes`：客户端 remote 注册表 bundle 的两个方法 schema + descriptor
  - `dsh-client-ui-workspace`：会话行菜单「删除对话」项（含中英文案）

状态更新走官方 host 帧（`archived-sessions-changed` / `session-removed`），
无需重启服务。
