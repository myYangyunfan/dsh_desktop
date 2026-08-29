# 契约 3：数据流规范

> 对齐两份上游：
> 1. **官方** [deepseek-harness docs/architecture.md]（中文版 architecture.zh.md）——
>    运行时配置是叠加树：`bundle×N → profile patch → home patch → --patch overlay`，
>    所有写入走 **patch-by-id** 语义（同 id 整体替换或插入）。
> 2. **PR #121** `dsh-desktop/docs/plugin-center-architecture.md` —— 桌面侧单一数据流
>    `State → Patch → Manifest → Modules`（固定顺序，单一写入方）。
>
> 本文档是两者在 Tauri 版的合并规范：**壳的每一次对内核配置的写入，都是叠加树上
> 一个明确的层；层的写入方唯一；读取方永远只观察合成结果。**

## 1. 配置叠加树（官方语义，壳必须遵守）

```
dsh web 进程启动时按序叠加：
  [1] bundle×N            （dsh.profile 的 bundles 数组，顺序敏感）
  [2] profile patch       （<profile>/cordis.patch.yml）
  [3] home patch          （~/.dsh/cordis.patch.yml，用户层）
  [4] --patch overlay     （命令行注入，桌面壳的补丁手术层）
```

- **同 id 替换**：patch 中与 bundle 同 id 的条目**整体替换**（不是深合并）。
- **插入**：patch 中新 id 直接插入。
- 桌面壳的写入位置映射：
  | 写入者 | 层 | 载体 |
  |--------|-----|------|
  | 插件开关（pluginManager.setEnabled） | [3] home patch 用户层 | `disabled` 条目 |
  | 伴随插件安装（sync-companion-plugins） | [4] overlay | `--patch` 指向的 cordis.patch.yml + node_modules 布局 |
  | 运行时文本手术（22 个 patch spec） | [4] overlay | 直接改写 node_modules 内目标文件（幂等标记） |
  | 内核预设（presets 同步） | profile 侧 | agent 预设文件 |

## 2. 桌面侧单一数据流（#121 语义）

```
State（期望态：插件清单 + 开关 + 版本）
  │  唯一写入方：Rust 装配层编排（app supervisor boot 链 + commands/sidecar
  │  `run_sidecar`）→ Node sidecar 执行（单一数据流的编排/执行分工）
  ▼
Patch（叠加树落盘：overlay 布局 + home patch 用户层条目 + 文本手术）
  │  唯一写入方：sync-companion-plugins --with-patches（Node）
  ▼
Manifest（cordis.patch.yml + package.json 元数据 + 幂等标记）
  │  唯一读取校验方：boot 序列 preflight
  ▼
Modules（node_modules 物理布局 + dsh web 实际加载的模块）
  │  观察方：supervision 探活 + inventory 扫描
  ▼
dsh web 进程（读合成后的叠加树）
```

**不变量**：
1. State 之外没有任何路径能改 Patch（诊断的 removeBundle/applyOrder 也先改 State 再重放）。
2. 每次写入要么整体成功（原子写 + 临时文件 rename），要么回滚到写入前快照。
3. Manifest 是唯一事实源：inventory/inference/repair 全部从 Manifest 推导，不反向写。

## 3. Boot 时序（对齐 Electron plugin-guard guardedBoot——守护瀑布）

```
app 启动
 ├─ [0] 单实例锁 + run-state + panic hook                      （shell-core/lib）
 ├─ [1] repair：损坏 manifest/home patch 自愈                  （sidecar boot 步骤①）
 ├─ [2] sync：伴随插件同步                                      （sidecar boot 步骤②）
 ├─ [3] presets：8 个壳层内置预设对账进 dsh 包                  （sidecar boot 步骤③，v0.5.1 迁移）
 ├─ [4] patches：22 个文本手术（幂等）                          （sidecar boot 步骤④）
 ├─ [5] preflight：补丁就绪 + koffi 预检 → 降级 overlay         （sidecar 步骤⑤）
 ├─ [6] guard-snapshot（boot 前快照，GUARD_FILES 四配置文件）
 ├─ [7] spawn：vendor-node bin.js web --no-open（120s 有界等待）
 ├─ [8] ready-line 解析 → 主窗换页（loading → Web UI）
 └─ [9] supervision：探活 + 崩溃环 + 45s 稳定落定 markGood
```

### 3.1 守护瀑布（「坏插件也永远能打开 dsh」——三层重试）

```
[7] 首次拉起(120s) ─成功→ 换页 + 稳定落定
      └失败→ 重跑 [1]-[5]（sync 为自愈主力：坏插件文件靠重新同步覆盖）
             + guard-repair + safe-overlay 禁用失败插件
             → 二次拉起(90s) ─成功→ 事故报告 boot-recovered + 换页
                   └失败→ guard-restore 回滚最后良好快照（markGood 锚点）
                          → 三次拉起(90s) ─成功→ rollback-recovered
                                └失败→ 事故报告 boot-failed + 恢复页
```

### 3.2 恢复页语义（「客户端必须能打开」原则）

- 任何装配失败（含内核目录缺失、boot 线程 panic 被 catch_unwind 捕获）都
  终态于**恢复页**而非进程退出：`recovery_state` 回
  `{state, kernelUrl?, crashes?, reason}`；未装配态回
  `{state:"no-kernel", reason}`。`reason` 附带本次 boot 瀑布的内核报错尾行
  （`内核报错：…`，自瀑布起点的 dsh-web.log 偏移提取，绝不引用上一次运行
  的残留输出）；boot-failed 事故详情同口径——壳侧概括 + 真实根因同行透出。
- 恢复页「重启内核 / 重新加载」在 supervisor 缺位时**重新装配**
  （start_supervisor，幂等），不要求重启应用。
- 静态页服务启动失败 → data: 内嵌提示页降级（无 IPC 的静态兜底）。
- panic 全局 hook：落盘 `%APPDATA%/dsh-desktop/logs/panics.log`，进程存活优先。

- 步骤 [1]-[4] 全部经 sidecar（Node 脚本复用 `dsh-desktop/scripts/`），Rust 只编排不实现。
- **无 overlay 更新链**：Electron 版在 [2] 前的「检查/应用内核更新」整体不存在；overlay 布局恒为随版本分发的静态副本。

## 4. 运行时数据流（桥 + 事件）

```
页面插件 ──invoke──▶ bridge command ──▶ 归属 crate ──▶ (sidecar | 内核 HTTP | OS)
    ▲                                                    │
    └────────── event（balance-changed / notification-jump / pet-state / window-maximized）◀─┘
```

- 事件方向固定：主进程 → 页面。页面→主进程只有 command（含 fire-and-forget 族）。
- 事件分发模式对齐官方 cordis 四模式口径，本壳仅用 **emit**（广播，无返回值）；
  需要请求-响应的场景一律走 command，不用事件模拟。

## 5. 持久化位置

| 数据 | Electron 路径 | Tauri 路径（不变，保证用户数据兼容） |
|------|---------------|--------------------------------------|
| dsh home | `%USERPROFILE%/.dsh` | 同左（shell-core 解析） |
| 用户设置 | `%APPDATA%/dsh-desktop/settings.json`（updater.loadSettings） | 同路径，schema 兼容读取；**损坏自愈**：坏 JSON/非对象 → 隔离 `.broken` 后从空配置继续 |
| 窗口状态 | `%APPDATA%/dsh-desktop/window-state.json` | 同名同 schema（bounds/maximized），双向兼容 |
| 日志 | `%APPDATA%/dsh-desktop/logs/desktop.log` | 同路径（另含 `panics.log`） |
| 隔离区 | `%APPDATA%/dsh-desktop/plugin-quarantine/` | 同路径 |
| 粘贴临时 | `%TEMP%/dsh-paste/` | 同路径 |

> 设置文件沿用 updater.js 的 JSON schema（含已裁撤字段如 kernelUpdate.skipVersion：
> 读取时忽略不删除——**回退兼容**，旧用户目录可安全回退 Electron 版；壳侧活跃
> 写键见 settings.json 各消费方）。

### 5.1 环境覆盖通道（生产与测试两套，优先级从高到低）

| 通道 | 语义 | 消费方 |
|------|------|--------|
| `DSH_TEST_HOME` / `DSH_TEST_APPDATA` / `DSH_TEST_TMP` | 测试覆盖（最高优先级） | shell-core（Rust） |
| `DSH_HOME` | dsh home 根**直接替换**（不再拼 `.dsh`） | shell-core（Rust）+ sidecar（Node）+ 内核 spawn 白名单——**三侧同口径** |
| `DSH_TAURI_USERDATA` | 壳 AppData 根**直接替换**（不再拼 `dsh-desktop`）；便携版 userData 重定向同通道 | shell-core（Rust）+ sidecar（Node） |
| `DSH_TAURI_REPO_ROOT` | 内核目录定位显式覆盖（诊断） | lib.rs find_repo_root |

> 历史教训（2026-08-20 实测）：曾只有 Node 侧消费 DSH_HOME/DSH_TAURI_USERDATA，
> Rust 侧不读——便携重定向与冒烟隔离在 Rust 侧是「幽灵变量」。现两侧必须同时
> 生效，此表即防回归契约。内核目录定位顺序：DSH_TAURI_REPO_ROOT → exe 相对
> 布局（安装产物优先，防编译机检出遮蔽）→ CARGO_MANIFEST_DIR 兜底。
>
> 非数据通道的环境开关不入本表：更新链注入 `DSH_UPDATER_ENDPOINT` /
> `DSH_UPDATER_PUBKEY`（docs/release-keys.md，未配置 → `E_UPDATER_CONFIG`）；
> 诊断开关 `DSH_TAURI_DIAG` / `DSH_TAURI_DEVTOOLS` / `DSH_TAURI_POC`
> （docs/development.md §3）。Electron 线的 `DSH_DESKTOP_USERDATA` 不被
> Tauri 线消费（数据重定向统一走 `DSH_TAURI_USERDATA`）。
