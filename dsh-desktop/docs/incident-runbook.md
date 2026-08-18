# DSH Desktop 故障处置手册（Incident Runbook）

> 面向维护者与进阶用户的故障排查速查。日常使用问题请先看
> [troubleshooting.md](./troubleshooting.md)。

## 1. 日志与数据位置

| 内容 | 路径 |
| --- | --- |
| 主进程日志 | `%APPDATA%\DSH Desktop\logs\desktop.log`（5 MB 双代轮转，`.1` 保留一份） |
| 后端（dsh web）日志 | `%APPDATA%\DSH Desktop\logs\dsh-web.log`（同轮转策略） |
| 看门狗日志 | `%APPDATA%\DSH Desktop\logs\watchdog.log` |
| 运行期异常兜底 | `%APPDATA%\DSH Desktop\logs\runtime-crash.log`（环形 1 MB，含 RSS/堆水位） |
| 启动崩溃取证 | 由启动期处理器写入（首次启动异常），同 desktop.log |
| 启动时间线 | `%APPDATA%\DSH Desktop\diagnostics\boot-timings.jsonl`（最近 20 行，各阶段 ms） |
| 内存观测 | `%APPDATA%\DSH Desktop\diagnostics\memory-samples.jsonl`（每 30 分钟，环形 2000 行） |
| LLM 调用错误 | `%APPDATA%\DSH Desktop\llm-errors.jsonl`（环形 1 MB） |
| 崩溃转储 | `%APPDATA%\DSH Desktop\Crashpad\`（14 天龄 + 数量上限，保留最近 5 个、最新 1 个豁免） |
| profile 补丁 | `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`（损坏自动备份 `.broken-<ts>`） |
| 补丁批次缓存 | `%APPDATA%\DSH Desktop\patch-batch-cache.json` |
| 文件根索引 | `%APPDATA%\DSH Desktop\roots-index.json` |

`%APPDATA%\DSH Desktop`（userData）路径含空格，脚本引用务必加引号。

## 2. 启动失败排查（最高优先级）

1. 确认进程未残留：`tasklist | findstr "DSH"`，残留则 `taskkill /F /T /IM "DSH Desktop.exe"`。
2. 看 desktop.log 尾部：`Get-Content "$env:APPDATA\DSH Desktop\logs\desktop.log" -Tail 60`。
3. 定位标志行：
   - `boot-ready` → 启动成功，问题在窗口/后端之后；
   - `crash` 段（recordStartupCrash）→ 启动期异常，附堆栈；
   - `profile patch 自愈` → 补丁文件曾损坏，已备份并重置；
   - `补丁代际签名命中，跳过 18 个文件补丁` → 补丁批次被跳过（正常）；
   - `补丁批次完成，已记录 N 个目标文件` → 批次刚执行。
4. **require 完整性**：安装版 `resources\app` 缺文件会导致 Electron require 阶段崩溃（历史上
   曾因漏同步 `scripts/patch-open-project-dir.js` 崩溃）。修复后打包产物由 after-pack 的
   `verifyRequireIntegrity` 兜底；手工同步可用：
   `node scripts/lib/require-integrity.js` 的 `integrityCheck(appDir)`（见单元测试用法）。

## 3. 自愈机制清单（发生即自动处理，日志留痕）

| 机制 | 触发 | 动作 |
| --- | --- | --- |
| profile 补丁自愈 | cordis.patch.yml 解析失败/重复 loader id | 备份 `.broken-<ts>` / `.dup-<ts>` 后重置或去重 |
| 家级补丁预检 | `$DSH_HOME/cordis.patch.yml` 损坏 | 备份后重置为最小合法文件 |
| 补丁代际签名 | 二次启动且版本/文件未变 | 跳过 18 个文件补丁（`DSH_FORCE_PATCH=1` 可强制重打） |
| 配套插件同步 | 启动/更新后 | 按 assets 对齐，已卸载（removed 标记）与用户升级版本保留 |
| bundle 契约软跳过 | 核心 bundle 契约校验失败 | fail-loud 降级为诊断 + 跳过继续启动 |
| settings.yaml 防护 | 写后校验失败 | 自动回写最近可用备份（`settings-guard-backup.json`），1s 防抖 + 5s 退避 |
| koffi 预检 | 签名缓存未命中 | 异步探测（20s），首屏等待 3s；超时按降级目录选择器启动，下次生效 |
| replay 降级 | 旧会话 replay state 非法 | 回落 foreignAssistant 继续会话，不卡死续聊 |
| 自更新完整性 | 安装包校验失败 | SHA256SUMS 缺失/不符一律丢弃拒绝安装（fail-closed） |

## 4. 性能基准门禁（CI 与本地）

- 冷启动采样：`node scripts/boot-bench.js --count 5 --json scripts/bench-baseline.json`
  （会反复 taskkill 目标进程，勿在重要会话期间运行）。
- 门禁对比：`node scripts/bench-gate.js <bench.json> [--baseline <file>] [--tolerance 1.2] [--fail]`。
- 退出码：0=通过或缺少基线（首跑不误报）；1=`--fail` 且有阶段超容差；2=基线文件不可读。
- CI：release.yml 的 build-x64 job 内嵌「Boot smoke and bench gate (x64)」步骤，对解包产物
  跑 3 次冷启动冒烟；仓库基线 `scripts/bench-baseline.json` 存在后自动启用性能对比。
- 阶段超容差（>1.2×）排查顺序：`boot:patches`（补丁批次）→ `boot:first-packet`（后端启动）→
  `boot:ui-loaded`（渲染）。

## 5. 常见故障速查

| 症状 | 首选检查 |
| --- | --- |
| 启动即闪退 | runtime-crash.log + desktop.log crash 段；require 完整性 |
| 设置页空白 | dsh-web.log 的 `settings-file:` 报错（scanWebLogForSettingsFailure） |
| 插件启停不生效 | 完全退出并重启（补丁/写入类改动需重启，非 Ctrl+R） |
| 模型调用报错 | 设置 → 插件 → 诊断与备份 → 运行诊断；llm-errors.jsonl |
| 余额不刷新 | 最小化/不可见时轮询暂停（设计行为），恢复可见立即刷新 |
| 更新卡住 | client-update-cache.json（1h 退避，可手动「检查更新」直通） |
| 会话文件句柄多 | 仅 7 天活跃会话挂 watch，冷会话由扫描兜底（设计行为） |

## 6. 应急处置原则

1. 先取证后处置：复制 desktop.log / runtime-crash.log / boot-timings.jsonl 再动手。
2. 回写/回滚均有备份文件（`.broken-*` / `.dup-*` / settings-guard-backup.json），恢复前不删。
3. 热更新（覆盖 resources\app 下文件）后必须完全退出重启验证；只改插件 UI 才可用 Ctrl+R。
4. 判定为缺陷后走正常流程：复现 → 单测 → PR（见仓库 CONTRIBUTING 约定）。
