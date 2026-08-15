# Zat-DSH Engine

> DeepSeek Harness 的可视化插件市场。像 Wallpaper Engine 一样浏览、搜索、安装、更新和卸载社区插件。

[中文说明](#zat-dsh-engine) · [English](README.md)

Zat-DSH Engine 在 DeepSeek Harness 网页界面的 **设置 → 插件** 里新增一个 **🛒 插件市场** 页签。它实时列出 GitHub 上整个 `dsh-plugin` 主题社区,双语简介,一键安装。

## 功能特性

- **全社区目录** — 实时搜索 GitHub `dsh-plugin` 主题(1700+ 仓库,每天都在增长)
- **12 个分类** — 皮肤主题、工具终端、浏览器自动化、技能、视觉多媒体、网络 MCP、多智能体、数据存储、硬件桌面、设计文档、安全通知…
- **输入即搜** — 打字自动筛选,不需要回车;清空搜索框自动回到完整列表
- **双语简介** — 内置 999 条预生成中文简介;新发布的插件会用你当前选择的模型现场翻译;英文界面显示 GitHub 原始简介
- **安装 / 更新 / 卸载** — 一键完成,底层走官方 `dsh plugin` 的 profile 机制(pnpm)
- **多插件仓库智能安装** — 一个仓库打包多个插件也能装对:只有一个插件的仓库点一下无感装好;多个插件的仓库用大白话列表让你选
- **已安装识别** — 标记你已装的插件,自动比较版本,发布新版本后显示**更新徽章**
- **跨平台** — Windows 与 Linux 全支持(PowerShell / sh、curl / wget 自动切换)
- **网络自适应** — 自动继承你的 VPN/系统代理来拉取和安装;GitHub 连不上时自动切到 `gh-proxy.com` 镜像,网络恢复后再切回直连;**没 VPN 也能用**:代理→直连→镜像→内置请求自动降级
- **一键启用/停用** — 卡片上直接启停插件,官方组件与市场自身受保护
- **装前冲突拦截 + 🩺 一键体检** — 两个市场互装、官方包劫持、挂载行/注册名重复会被直接拦截;一键体检报告冲突、依赖矛盾、缺失依赖
- **稳,坏了能救** — 安装/卸载/启停失败自动回滚;每次成功后自动备份,装崩了按说明一条命令恢复
- **实时进度条** — 安装/更新/卸载显示在卡片上(百分比 + 实时计数),离开市场再回来进度也不丢
- **一键星标** — 自动复用本机 git 凭据给仓库点星;卡片标签与颜色图例、提示自动消失
- **自更新** — 插件市场自身有新版本时,标题旁边出现更新按钮

## 安装

### 从 GitHub 安装(发布后推荐)

```sh
dsh plugin --profile web add github:mishibeikejie/zat-dsh-engine
```

### 国内没有 VPN 时安装(走国内镜像,已实测可用)

```sh
dsh plugin --profile web add https://gh-proxy.com/https://github.com/mishibeikejie/zat-dsh-engine.git
```

两个命令任选其一,装的是同一个插件。装好之后,插件市场内部的搜索和安装自带镜像回退,不用再管网络问题。

### 从本地目录安装

```sh
git clone https://github.com/mishibeikejie/zat-dsh-engine.git
dsh plugin --profile web add ./zat-dsh-engine
```

### 从 npm 安装(如果后续发布到 npm)

```sh
dsh plugin --profile web add zat-dsh-engine
```

如果你的 profile 不叫 `web`,把它换成你自己的 profile 名。

> 前置要求:已安装 dsh;PATH 里有 `pnpm` 和 `curl`;profile 已初始化(第一次 `dsh plugin add` 会自动创建)。

## 使用

1. 安装后重启 dsh。
2. 打开网页界面 → **设置 → 插件**。
3. 点击插件列表右边的 **🛒 插件市场** 页签。
4. 浏览、搜索、按分类或安装状态筛选,点卡片上的 **安装**。
5. 重启 dsh 让安装的插件生效。

## 更新

```sh
dsh plugin --profile web add github:mishibeikejie/zat-dsh-engine
```

重新执行 `add` 即更新到最新版本。插件市场也会自动检测自身新版本,并在标题旁显示更新按钮。

## 卸载

```sh
dsh plugin --profile web remove zat-dsh-engine
```

## 常见问题

**「全部」视图最多显示 1000 个插件。** 这是 GitHub 搜索 API 对单次查询的硬上限。用搜索框或分类筛选可以找到任何一个插件,不受此限。

**为什么中文简介需要模型?** 插件内置了 999 条中文简介。只有快照之后新发布的插件需要现场翻译,用的是你在 dsh 里选择的模型。

**镜像安全吗?** 只有直连 GitHub 失败时才走镜像,而且只拉取公开仓库的元数据。

**装了某个插件之后 dsh 起不来怎么办?** 市场每次成功安装/卸载/启停之后,都会把上一份可用状态自动备份到 profile 目录的 `zat-backup/` 文件夹。恢复只需把里面的三个文件复制回 profile 目录覆盖。

下面命令里的 `web` 就是你的 profile 名:**用网页版的人都是 `web`**(除非你启动 dsh 时专门用了别的名字;不确定的话,打开插件市场看底部那行「当前 profile:」,写的是啥就填啥):

```sh
# Windows (PowerShell)
Copy-Item "$HOME\.dsh\profiles\web\zat-backup\*" "$HOME\.dsh\profiles\web\" -Force

# macOS / Linux
cp ~/.dsh/profiles/web/zat-backup/* ~/.dsh/profiles/web/
```

然后重新启动 dsh。恢复的是"上一次成功操作"之后的状态,那个把你带崩的插件会被移除出启用名单,profile 可以正常启动。

**可以同时装两个市场类插件吗?** 不可以,安装时会被直接拦截:两个市场/管理器插件会注册相同的设置页和服务,互相覆盖甚至让 dsh 起不来。想换用另一个,先卸载当前这个。

**安装前会自动检查冲突吗?** 会。每次安装前,市场自动检查三件事:① 官方包(`@deepseek-ai/*`)是否被写成普通依赖(会装出第二份拷贝劫持官方 loader,硬拦截);② 挂载行 id 是否与已装插件重复(硬拦截);③ 共享依赖的大版本是否与已装版本矛盾(不拦截,但会在结果里提示风险)。工具栏的「🩺 一键检测」可以随时对全部已装插件做一次同样的体检,报告冲突、依赖矛盾、缺失 peer 依赖、停用状态等。

## 更新日志

### v0.4.0

- 一键启用/停用插件(卡片上直接操作,官方组件与市场自身受保护)
- 安装前冲突拦截(两个市场互装、官方包劫持、挂载行/注册名重复)+ 🩺 一键体检
- 安装/卸载/启停自动回滚,失败自动还原;每次成功后自动备份,装崩了按说明一条命令恢复
- 卡片上的实时进度条(百分比 + pnpm 实时计数),安装状态离开市场再回来也不丢
- 无 VPN 可用:系统代理→直连→国内镜像→内置请求自动降级,镜像实测约 7MB/s
- 已安装/可安装筛选直出全部结果、翻页去重
- 一键星标、卡片标签与颜色图例、提示自动消失

## 赞助

如果 Zat-DSH Engine 帮你省了时间,欢迎支持作者:

- GitHub Sponsors:<https://github.com/sponsors/mishibeikejie>

每一份支持都会用于维护目录数据、翻译和功能更新。

## 许可证

[MIT](LICENSE)
