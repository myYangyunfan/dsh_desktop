# DS Harness Remote

[官方网站](https://dsh.r2049.cn/) · [Web 客户端](https://dsh.r2049.cn/app) · [iOS 内测](https://github.com/liguobao/ds-harness-remote/issues/20) · [Android 下载](https://github.com/liguobao/ds-harness-remote/releases/latest)

通过 **P2P 网络直连**，从另一台电脑、浏览器或手机，继续使用工作电脑上的 DeepSeek Harness。工作区、会话、工具和项目配置仍保留在原来的电脑上。

## 主要功能

- 远程打开 Harness 工作区与会话，发送消息、切换模型、处理中断和审批。
- 连接已配置的 CodeX、Claude Code、Pi、OpenCode 等工作区。
- 浏览工作区文件、预览内容，并使用已启用的远程终端。
- **P2P 网络直连优先**：设备之间直接传输数据，直连成功后会话数据无需经过中继服务器；主机无需公网 IP 或开放公网端口。
- **全程端到端加密**：直连不可用时自动回退到 TURN 或 Relay 中继，中继服务器无法解密会话内容。

## 开始使用

1. 在工作电脑安装并启用插件，打开侧栏 **Remote** 登录账号。
2. 在另一台电脑的 Remote、[浏览器](https://dsh.r2049.cn/app)或 [Android 客户端](https://github.com/liguobao/ds-harness-remote/releases/latest)登录同一账号。
3. 选择在线主机和工作区，继续对话。工作电脑需保持运行并联网。

[完整说明](https://github.com/liguobao/ds-harness-remote/blob/main/README.zh.md) · [自部署指南](https://github.com/liguobao/ds-harness-remote/blob/main/apps/server/README.zh.md) · [反馈问题](https://github.com/liguobao/ds-harness-remote/issues)
