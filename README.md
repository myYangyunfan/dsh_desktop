[中文](README.md) | [English](README.en.md)

# DSH Desktop

把 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）封装为开箱即用的 Windows 桌面客户端。

---

## 下载安装

### 国内用户（Gitee，分片下载）

> Gitee 单文件限制 100 MB，安装包已拆分为 2 个分片，下载后合并即可。

1. 下载以下文件，放到**同一个文件夹**：

   **便携版**（免安装，双击即用，可放 U 盘）：
   - [part1](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-0.3.3-portable-x64.exe.part1)（~95 MB）
   - [part2](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-0.3.3-portable-x64.exe.part2)（~31 MB）

   **安装版**（安装到系统，创建桌面/开始菜单快捷方式）：
   - [part1](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-Setup-0.3.3-x64.exe.part1)（~95 MB）
   - [part2](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/DSH-Desktop-Setup-0.3.3-x64.exe.part2)（~32 MB）

2. 下载 [merge.bat](https://gitee.com/my-yang-yunfan/dsh_desktop/releases/download/v0.3.3/merge.bat)，放到同一文件夹，双击运行即可自动合并出 exe。

   不想用 merge.bat？在 CMD 中手动合并：

   ```cmd
   :: 便携版
   copy /b DSH-Desktop-0.3.3-portable-x64.exe.part1 + DSH-Desktop-0.3.3-portable-x64.exe.part2 DSH-Desktop-0.3.3-portable-x64.exe

   :: 安装版
   copy /b DSH-Desktop-Setup-0.3.3-x64.exe.part1 + DSH-Desktop-Setup-0.3.3-x64.exe.part2 DSH-Desktop-Setup-0.3.3-x64.exe
   ```

### 国际用户（GitHub，单文件下载）

> GitHub 无单文件大小限制，可直接下载完整安装包。

| 文件 | 说明 | 大小 |
| --- | --- | --- |
| [便携版 exe](https://github.com/myYangyunfan/dsh_desktop/releases/latest/download/DSH-Desktop-0.3.3-portable-x64.exe) | 免安装，双击即用 | ~126 MB |
| [安装版 exe](https://github.com/myYangyunfan/dsh_desktop/releases/latest/download/DSH-Desktop-Setup-0.3.3-x64.exe) | 安装到系统，创建快捷方式 | ~126 MB |

**首次使用**：双击运行后会显示启动动画，随后进入 DeepSeek Harness Web UI。如尚未配置 API Key，在界面内完成配置即可开始使用（与命令行 dsh 完全一致）。

> 便携版数据目录在 exe 旁的 `data\`；安装版在 `%APPDATA%\DSH Desktop\`。
> 想强制指定 DSH 配置目录？启动前设置环境变量 `DSH_HOME` 即可。

## 功能一览

- **免装 Node**：内置独立 Node 运行时与 npm CLI，目标机器无需安装 Node.js
- **内置 dsh CLI**：完整打包 `@deepseek-ai/dsh` 及全部插件，离线可用
- **一键启动**：双击即启动 `dsh web`，优先复用上次端口（被占用时自动换新端口），就绪后加载到原生窗口；稳定 origin 让会话分组等界面偏好可以持久记住
- **风格化无边框窗口 + 系统托盘**：无原生标题栏/菜单栏，自绘玻璃栏（圆角图标、⋯ 菜单、窗口控制），Win11 圆角；关闭默认隐藏到托盘
- **退出即清理**：退出应用自动结束 dsh 进程树，不留孤儿进程
- **便携版**：数据跟随 exe 所在目录，拷到 U 盘就能用
- **与 CLI 共享配置**：默认沿用 `DSH_HOME`（通常是 `~\.dsh`），已有会话/API Key 直接生效
- **双重自动更新**：官方 dsh agent 更新（npm overlay）+ 客户端封装自更新（GitHub/Gitee 双源、分片自动合并、原地替换重启），均经用户同意
- **插件升级兼容**：更新只升级内置配套插件（余额、终端、独立窗口等），**不会覆盖你自行添加的第三方插件**，`cordis.patch.yml` 里你自己加的条目原样保留
- **快捷方式自动维护**：便携版自动创建/修复桌面与开始菜单快捷方式
- **DeepSeek 余额小部件**：对话底部统计栏显示「本轮 ¥X · 余额 ¥Y」，点击跳转充值
- **文件更改追踪 + 一键还原**：详情面板「文件」标签页查看本会话全部文件改动（行级 diff）并逐文件/全部还原，数据只读复用会话日志，稳定不受升级影响
- **会话完成通知**：agent 任务跑完时弹 Windows 系统通知，点击回到窗口

 - **隐藏对话输出**：设置 → 通用设置 →「隐藏对话输出」，隐藏大量工具调用、工具结果与思考过程，每一轮的最终总结输出仍然显示
 - **会话导航滑轨**：对话右侧的虚化滑轨随会话长度变化；每条用户输入在滑轨上以圆点标出位置，悬停时在鼠标位置显示垂直短横线预览，点击才跳转
- **便携版解压缓存**：首次解压后缓存到 `%TEMP%\dsh-desktop-portable`，后续启动秒开，不再每次解压 132MB / 2.4 万文件
- **启动自愈与看门狗**：自动修复 profile 符号链接损坏导致的 `dsh web` 退出码 1；主进程异常退出时自动拉起并发送恢复通知
- **识图插件 dsh-vision**：设置页直接填写 OpenAI 兼容 VLM 的 API 地址、密钥和模型，会话中即可使用 `view_image` 工具（OCR / 看图 / 读图表），默认智谱免费 `glm-4.6v-flash`
 - **渲染进程崩溃自愈**：页面崩溃/假死时指数退避自动重载，连续失败第 3 次重建窗口；超过上限显示本地恢复页（重新加载 / 重启客户端 / 打开日志），并弹系统通知
- **会话历史兼容补丁**：打包时自动修补内置 `@deepseek-ai/dsh-session` 事件词汇表，插件（dsh-agent-teams / dsh-message-edit / dsh-web-search-exa）写入的会话事件不再导致历史无法打开
- **内置「极简模式_win」预设**：基于官方极简模式，把 bash 替换为 Windows PowerShell（`pwsh` + `str_replace_editor`）
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 插件注入/热重载/自愈工具）+ `router-standard` 预设
- **内置 dsh-anchored-standard**：`anchored-standard` / `zero-anchored-standard` 实验性预设

- **余额提示开关**：chrome 菜单「显示余额/本轮费用」可一键关闭，第三方中转用户不再被余额提示打扰
- **第三方模型思考强度默认安全**：`reasoning_effort` 注入默认关闭，仅 provider 支持时手动开启，避免百炼等严格 API 报参数错误
- **插件市场**：支持 npm 包名与 `github:owner/repo#分支` 安装第三方插件，安装后重启服务生效


## 系统要求

- Windows 10/11（x64）
- 无需预装 Node.js 或任何其他运行时

## 从源码构建

```powershell
cd dsh-desktop
npm install
npm run fetch-runtime    # 内置 node.exe + npm CLI
npm run dist             # 构建 portable + NSIS 安装包 → dist/
```

> 网络受限时：Electron 镜像 `$env:ELECTRON_MIRROR='https://npmirror.com/mirrors/electron/'`；打包工具链镜像 `$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmirror.com/mirrors/electron-builder-binaries/'`。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│  Electron 壳 (main.js)                                   │
│  · 单实例锁 / 窗口 / 菜单 / 生命周期                       │
│  · 会话完成监听 (session-watcher.js) → 系统通知            │
│  · 官方更新 (updater.js) → 用户同意后安装 overlay          │
│  · spawn vendor|resources 里的 node.exe                   │
└──────────────┬───────────────────────────────────────────┘
               │  dsh web --host 127.0.0.1 --port <上次保存的端口>
               ▼
       内置 node.exe + @deepseek-ai/dsh
       路径解析：用户目录 overlay > 内置包
       输出 "dsh web: http://127.0.0.1:<port>"
               │  解析 URL，轮询 HTTP 200
               ▼
       原生窗口加载 Web UI（仅本机回环访问）
```

## 连接 WSL 里的 dsh（WSL 托管模式）

壳支持两种后端：`local`（内置 dsh，默认）、`wsl`（壳在 WSL 里安装并更新自己的 dsh），用 `settings.json` 的 `backend` 或环境变量 `DSH_DESKTOP_BACKEND` 选择。

- **wsl（托管）**：设置页「WSL 后端」栏（或 `settings.json` 的 `backend` / 环境变量 `DSH_DESKTOP_BACKEND`）选 `wsl` 后，壳首次启动在 WSL 内 `npm install` 一套自己的 dsh（默认目录 `~/.dsh-desktop`，可配置；要求 WSL 内有 node/npm），每次启动自动同步配套插件并启动、连接；**agent 自动更新、回退、插件市场重启全部闭环**，体验等同本地模式。转发不通时在 `.wslconfig` 启用 `networkingMode=mirrored`。详见 `dsh-desktop/README.md`。
- 自己在 WSL 里另装了 dsh（checkout 开发版/npm 版）想用上壳的配套插件？在 WSL 里跑 `node dsh-desktop/scripts/sync-companion-plugins.js ~/.dsh --with-patches`，重启 `dsh web` 生效。

## 目录结构

```
dsh-desktop/
├── main.js               # Electron 主进程
├── updater.js            # 官方更新引擎
├── session-watcher.js    # 会话完成监听
├── preload.js            # 沙箱预加载
├── assets/               # 加载页、更新进度页、图标
├── scripts/              # 构建与开发辅助脚本
├── build/icon.png        # electron-builder 图标
├── vendor/               # 内置 node.exe / npm CLI（不入库）
├── electron-builder.yml  # 打包配置
└── dist/                 # 构建产物（不入库）
```

## License

MIT。基于 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（MIT）。
