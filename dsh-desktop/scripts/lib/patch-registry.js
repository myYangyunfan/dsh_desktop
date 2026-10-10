'use strict';

// ---------------------------------------------------------------------------
// 补丁注册表（PatchSpec 唯一清单 / 装配层 composition root）。
//
// 每个补丁一条声明，作为运行时补丁编排（patch-runner）与健康预检
// （fault-isolation.preflight）的唯一数据源。启动编排不再硬编码 WSL/本地
// 两份 apply* 列表，统一由 layout / wslLayout 字段区分布局、group / order
// 决定执行顺序。
//
// 注意：本模块并非「纯数据」——它反向 require 了 patch-target-resolver
// （路径常量）、runtime-patches / patch-adapters（transform 与 marker 常量），
// 是「装配层」而非「数据清单」，字段值里引用的 transform/marker 与对应实现
// 同源，避免跨模块复制漂移。
//
// 字段约定：
//   id         补丁唯一标识；
//   group      分组（runtime / guard / package）；
//   order      组内执行顺序（数字升序）；
//   kind       'file'（逐文件 transform + applyPatchToFiles）| 'root'
//              （node_modules 根应用器，逐根 try-catch）；
//   layout     本地模式布局（见 patch-target-resolver LAYOUTS）；
//   wslLayout  WSL 模式布局（ctx.wslMode 时优先）；
//   pkgRel     单文件相对路径；pkgRels 多文件相对路径（slot / shell）；
//   transform  (src, file) => {status:'already'|'anchor-missing'|'changed'}；
//   apply      root 应用器 (nmRoot, log) => number；
//   marker     幂等 marker（与 transform 的 status:'already' 判定同源），
//              供 preflight 只读体检复用；
//   requires   宿主能力依赖（见 host-capabilities.js）；
//   cli        CLI 同步期（sync-companion-plugins.js --with-patches）是否也应用；
//              cli:true 现共 26 项（HEAD 原有 8 个 + slot-error-isolation +
//              session-persistence + tool-source-compat / pi-ai-opencode-go-models
//              / pi-ai-credits / pi-ai-reasoning-defaults 四个数据完整性补丁
//              + bundle-arrival-retry / agent-loop-scheduler-guard 两个内核
//              韧性补丁 + pi-ai-overflow-message / token-meter-clamp /
//              atomic-write-orphan-lock / settings-models-resilience /
//              empty-tool-name-guidance + codex/claude 本地二进制回落 +
//              skill-dirs-compat + pi-ai 系 4xx 落盘/schema 净化/Responses 名字净化 +
//              workspace-chip-label-hold）；计数哨兵见
//              ta6-registry-invariants.test.js F 与 unit-patch-registry.test.js；
//              guard 组为 false，仅桌面壳运行时应用（image-send / vision-key 一族
//              曾属此类，已随识图插件退役整体摘除，见 patch-adapters 的退役注释）；
//   failPolicy 'warn'（失配告警跳过，多数现状）| 'degrade'（失配降级 +
//              升级提示）| 'fatal'（仅 build 期保留）；作用于规格级异常
//              （applyAll 的 catch 分支），逐文件/逐根异常由下层吸收并计入
//              patchReport 的 anchorMissing / failed 计数；degrade 档补丁的
//              anchor-missing 会分流进 report.degraded（降级告警），warn 档
//              计入 report.anchorMissing（版本差异）；
//   logs       kind='file' 的 applyPatchToFiles 日志配置（prefix/alreadyLog/
//              doneLog/failLog/donePrefix）；
//   successLog / failLog  kind='root' 的顶层日志字段（successLog(root) /
//              failLog(root, err)，与 logs 不同，属 root 应用器专用）。
//   退役说明（0.1.5-rc.1 重靶期）：preset-seat-fix / token-meter-clamp 已由
//              上游原生修复，从 PATCH_SPECS 摘除（patch 脚本保留休眠）；
//              其余失配项已重锚（image-send（2026-10 又随识图插件整体退役）/
//              profile 系 / menu-viewport
//              #182 / open-project-dir / session-persistence corrupt /
//              wsl-picker / header-scan / ds-tool / conversation-assembly /
//              reasoning-row / unknown-event）。
//   退役说明（0.2.0-rc.2 重靶期）：atomic-write-orphan-lock 已由上游原生修复
//              （withFileLock 竞争分支内 `else if (await takeOverExitedLock(lockPath))
//              continue`——按锁记录 PID 探活，ESRCH 即删锁重试，且用
//              `<lock>.takeover-<sha256 前 16 位>` 独占claim 把双删竞态做得比
//              我们那份更严；EPERM/PID 复用按仍存活处理，语义与我们一致），
//              从 PATCH_SPECS 摘除，transformOrphanLock 保留休眠；
//              menu-viewport 的 #182 半边同批退役（上游 useLayoutEffect 改为逐帧
//              requestAnimationFrame 重定位，首帧 lw=0 的横向溢出下一帧即被修正）。
//   退役说明（2026-10 内置伴随插件批量拆除）：image-send-fix 从 PATCH_SPECS 摘除，
//              patch-adapters 里的 transform 与 IMAGE_SEND_* / VISION_KEY_* /
//              VISION_TOGGLE_* 常量（含从未登记的 vision-key / vision-toggle 两个
//              休眠变体）一并整体删除——判据是「只为已退役插件存在」：注入体读的是
//              dsh-vision 的设置命名空间，识图插件不在后没有任何可达路径。
//              反例（保留，仅改注释）：prompt-context-literal（任何插件写入的非法
//              变量名模板）、pi-ai / ds-tool 系工具名与 schema 净化、
//              content-has-image-guard——它们是通用 wire/schema 守卫，graph-memory
//              与 cardian 只是历史触发源。
// ---------------------------------------------------------------------------

const path = require('node:path');

const {
  FLASH_PKG_REL,
  SESSION_CTRL_INDEX_PKG_REL,
  GATEWAY_CLIENT_PKG_REL,
  UI_CHAT_CLIENT_PKG_REL,
  SESSION_PERSISTENCE_CORE_PKG_REL,
  SESSION_FORMAT_V0_TO_V1_PKG_REL,
  CONVERSATION_PKG_REL,
  API_SETTINGS_CONTROLLER_PKG_REL,
  WORKSPACE_PKG_REL,
  SLOT_KEY_COMPAT_PKG_REL,
  SLOT_UNKEYED_COMPAT_PKG_REL,
  PW_REL,
  BASH_REL,
  DSHTOOLS_REL,
  PERSISTENT_SHELL_PKG_RELS,
  TERMINAL_BASH_REL,
  ATTACH_LOCAL_REL,
  APP_BOOT_PKG_REL,
  LOADER_PKG_REL,
  AGENT_PRESET_FALLBACK_PKG_RELS,
  PROMPT_CONTEXT_LITERAL_PKG_RELS,
  KERNEL_WEB_INDEX_REL,
  PICKER_AUTO_PKG_REL,
  LLM_PKG_REL,
  PERSISTENCE_PKG_REL,
  CODEX_BIN_PKG_REL,
  CLAUDE_SUBAGENT_PKG_REL,
  PI_AI_COMPLETIONS_PKG_REL,
  PI_AI_RESPONSES_SHARED_PKG_REL,
  PI_AI_PROVIDER_RETRY_PKG_REL,
  DSH_LLM_PIAI_PKG_REL,
  DS_LLM_DEEPSEEK_PKG_REL,
  SKILL_FS_PKG_REL,
} = require('./patch-target-resolver');

const {
  transformFlashFix,
  transformLegacySlotKey,
  transformSlotUnkeyedCompat,
  transformSlotErrorIsolation,
  transformShellDescriptionOptional,
  transformAttachmentMimeTrust,
  transformHistoryPageSize,
  transformJournalPrependContinuity,
  transformChatAutoLoadOlder,
  transformReasoningRowCollapseWidth,
  transformSessionUnknownEventTolerance,
  transformReleasedV0KeysTolerance,
  transformConversationAssemblyResilience,
  transformProfilePatchGuard,
  transformProfileBundleAppBoot,
  transformProfilePatchLayerGuard,
  transformManualSortFix,
  transformPluginInventoryTabMergeFix,
  transformPersistentShellAbortRace,
  transformTerminalInterruptEscalation,
  transformAgentPresetFallback,
  transformPromptContextLiteral,
  // K1（credentials service is absent 偶发）三层修复。
  transformCredentialsInitialRetry,
  transformCredentialsAbsentGuidance,
  // 设备未授权（DeepSeek 服务端风控 403）报文追加可操作指引。
  transformDeviceAuthGuidance,
  // #154 第三根因：内核 web UI boot 看门狗（client module system 不可达不无限转圈）。
  transformKernelBootWatchdog,
  // W1 问题四：WSL 内目录选择器强制 browse（zenity 窗口在 WSLg 里不可见）。
  transformDirectoryPickerWslBrowse,
  // R7：adapter 缺 prepareCall 时回落基类语义 + 升级指引（v0.5.3 对话失败）。
  transformAdapterPrepareCallGuard,
  // contentHasImage 非数组守卫（v0.6.0 本轮运行失败 reading 'some' 根治）。
  transformContentHasImageGuard,
  transformSessionHeaderScanGuard,
  transformSessionLoadGraceful,
  transformCodexLocalBinFallback,
  transformClaudeLocalBinFallback,
  transformPiAi4xxDump,
  transformPiAiToolSchemaSanitize,
  transformPiAiResponsesToolNameSanitize,
  transformPiAiToolNameWire,
  transformPiAiQuotaNotRetryable,
  transformDsToolSchemaSanitize,
  transformSkillDirsCompat,
  // 选择工作文件夹时 chip/输入框闪回「选择工作区」（workspace 投影缺口帧）。
  transformWorkspaceChipLabelHold,
  rootAppliers,
} = require('./patch-adapters');

const {
  SLOT_KEY_COMPAT_MARKER,
  SLOT_UNKEYED_COMPAT_MARKER,
  SLOT_ERROR_ISOLATE_MARKER_V2,
  PROFILE_PATCH_GUARD_MARKER,
  PROFILE_BUNDLE_GUARD_MARKER,
  APP_BOOT_PATCH_LAYER_GUARD_MARKER,
  MANUAL_SORT_DRAG_MARKER,
  PLUGIN_INVENTORY_TAB_MARKER,
  PERSISTENT_ABORT_RACE_MARKER,
  INTERRUPT_ESCALATION_MARKER,
  AGENT_PRESET_FALLBACK_MARKER,
  PROMPT_CONTEXT_LITERAL_MARKER,
  CREDENTIALS_INITIAL_RETRY_MARKER,
  CREDENTIALS_ABSENT_GUIDANCE_MARKER,
  DEVICE_AUTH_GUIDANCE_MARKER,
  KERNEL_BOOT_WATCHDOG_MARKER,
  WSL_PICKER_BROWSE_MARKER,
  ADAPTER_PREPARE_CALL_GUARD_MARKER,
  CONTENT_HAS_IMAGE_GUARD_MARKER,
  SESSION_HEADER_SCAN_MARKER,
  // K6 幂等判定用 v3 marker（rc.1 扁平 torn-tail 契约）；v1/v2 marker 仍由
  // transform 的升级通道引用，不作为 spec.marker（否则在野旧副本会被 already
  // 短路、永不升级）。
  SESSION_LOAD_GRACEFUL_MARKER_V3,
  LOADER_ACTIVATION_ISOLATION_MARKER,
  FAIL_LOUD_ISOLATION_MARKER,
  LOADER_IMPORT_REPORT_MARKER,
  PROMPT_ADMISSION_REASON_MARKER,
  CODEX_LOCAL_BIN_MARKER,
  CLAUDE_LOCAL_BIN_MARKER,
  PI_AI_4XX_DUMP_MARKER,
  PI_AI_TOOL_SCHEMA_SANITIZE_MARKER,
  DS_TOOL_SCHEMA_SANITIZE_MARKER,
  PI_AI_RESPONSES_TOOL_NAME_SANITIZE_MARKER,
  PI_AI_TOOL_NAME_WIRE_MARKER,
  PI_AI_QUOTA_NOT_RETRYABLE_MARKER,
  SKILL_DIRS_COMPAT_MARKER,
  WORKSPACE_CHIP_LABEL_MARKER,
  HISTORY_PAGE_MARKER,
  JOURNAL_PREPEND_MARKER,
  CHAT_AUTOLOAD_MARKER,
  REASONING_ROW_COLLAPSE_MARKER,
  SESSION_UNKNOWN_EVENT_TOLERANCE_MARKER,
  RELEASED_V0_HISTORY_MARKER,
  ASSEMBLY_RESILIENCE_MARKER,
} = require('./patch-adapters').markers;

const {
  transformLoaderActivationIsolation,
  transformFailLoudIsolation,
  transformLoaderImportFailureReport,
  transformPromptAdmissionReasonReport,
} = require('./loader-isolation');

/** 通用「已应用」日志主体（多数运行时补丁沿用）。 */
const alreadySkip = (file) => '已应用，跳过 ' + file;

const PATCH_SPECS = [
  // -------------------------------------------------------------------------
  // keyed slot 兼容（rc.6 id → rc.7 key）+ 无 key 兜底 + 错误隔离安全网。
  // 三层共用 slot-compat 布局（本地 / WSL 两份），逐文件幂等。
  // -------------------------------------------------------------------------
  {
    id: 'slot-legacy-key',
    group: 'runtime',
    order: 10,
    kind: 'file',
    layout: 'slot-compat',
    wslLayout: 'slot-compat-wsl',
    pkgRels: [SLOT_KEY_COMPAT_PKG_REL],
    transform: transformLegacySlotKey,
    marker: SLOT_KEY_COMPAT_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'keyed slot 旧插件兼容补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已兼容旧插件的 keyed slot id ' + file,
      failLog: (file, err) => 'keyed slot 旧插件兼容补丁失败(' + file + '): ' + err.message,
    },
  },
  {
    id: 'slot-unkeyed-compat',
    group: 'runtime',
    order: 20,
    kind: 'file',
    layout: 'slot-compat',
    wslLayout: 'slot-compat-wsl',
    pkgRels: [SLOT_UNKEYED_COMPAT_PKG_REL],
    transform: transformSlotUnkeyedCompat,
    marker: SLOT_UNKEYED_COMPAT_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'keyed slot 无 key 兼容补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已兼容 keyed slot 无 key 注册 ' + file,
      failLog: (file, err) => 'keyed slot 无 key 兼容补丁失败(' + file + '): ' + err.message,
    },
  },
  {
    id: 'slot-error-isolation',
    group: 'runtime',
    order: 30,
    kind: 'file',
    layout: 'slot-compat',
    wslLayout: 'slot-compat-wsl',
    pkgRels: [SLOT_KEY_COMPAT_PKG_REL],
    transform: transformSlotErrorIsolation,
    marker: SLOT_ERROR_ISOLATE_MARKER_V2,
    requires: [],
    failPolicy: 'degrade',
    cli: true,
    logs: {
      prefix: 'keyed slot 错误隔离补丁',
      alreadyLog: alreadySkip,
      doneLog: (file, note) => '已隔离 keyed slot 注册错误 ' + file + (note ? ' (' + note + ')' : ''),
      failLog: (file, err) => 'keyed slot 错误隔离补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // dsh web 运行时闪跳修复。
  // -------------------------------------------------------------------------
  {
    id: 'runtime-flash-fix',
    group: 'runtime',
    order: 40,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: FLASH_PKG_REL,
    transform: transformFlashFix,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'runtime 补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已修复会话列表刷新闪跳 ' + file,
      failLog: (file, err) => 'runtime 补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // shell 工具 description 可选化补丁（pwsh/bash 共用同一 transform）。
  // -------------------------------------------------------------------------
  {
    id: 'shell-description-compat',
    group: 'runtime',
    order: 60,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    // description 仅用于 UI/日志展示，不应让整个工具调用失败。共三靶：
    // pwsh/bash（shell 工具）+ dsh-tools（run_code，code 模式）。transform 内
    // run_code 步先于 shell 步（run_code 3-tab validate 行含 shell 1-tab 锚点子串）。
    pkgRels: [PW_REL, BASH_REL, DSHTOOLS_REL],
    transform: transformShellDescriptionOptional,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'shell description 兼容补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已把 description 改为可选 ' + file,
      failLog: (file, err) => 'shell description 兼容补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 【已退役·2026-10 内置伴随插件批量拆除】文本模型自动识图（image-send-fix，
  // order 80，cli:false，靶 SESSION_CTRL_INDEX_PKG_REL）：其注入体读的就是
  // dsh-vision 的设置命名空间（settings.get("dsh-vision") + describe 回落），
  // 门槛替换体只做一件事——把图片交给该插件配的 VLM 转述成文字再发。识图插件
  // 退役后这条 transform 没有任何可达路径（无插件时恒回落上游原句），故按
  // 「只为已退役插件存在」判据连 transform 与锚点常量（patch-adapters 的
  // IMAGE_SEND_* / VISION_KEY_* / VISION_TOGGLE_*，含两个从未登记的休眠变体）
  // 一并删除，order 80 空出不回收；该靶常量仍由 history-page-size 使用。
  // 「文本模型收到图片」就此回到上游原生的 MODEL_DOES_NOT_SUPPORT_IMAGES 拒绝
  // 语义；轮内图片判定的通用防线是 content-has-image-guard（非数组 content 不
  // 炸整轮），与识图插件存废无关，保留。取证细节（:745 的 content 空值守卫并非
  // 故障① 根因、typert strict codec 把 content 强制为必填数组等）见 CHANGELOG
  // 与 git 记录。
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // code preset 兼容补丁（mode: code → both）。
  // -------------------------------------------------------------------------
  // 图片字节信任补丁。
  // -------------------------------------------------------------------------
  {
    id: 'attachment-mime-trust',
    group: 'runtime',
    order: 90,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: ATTACH_LOCAL_REL,
    transform: transformAttachmentMimeTrust,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: '图片字节信任补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已信任图片解码字节 ' + file,
      failLog: (file, err) => '图片字节信任补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 持久 shell 停止修复（会话内停止任务停不下来，Windows 主现场）。
  //
  // 根因：用户点停止 → abort → PTY 侧只写 \x03，对 trap/忽略 SIGINT 的命令
  // 无效，`await operation.done` 挂到 300s 发送超时；兜底杀梯因 node-pty
  // 1.2.0-beta.15 在 Windows 返回 pid=0（descendants() 恒空）而是死代码。
  // 实测 terminal.kill() 复位会话能杀掉附着进程。两层修法：
  //   1) persistent-shell-abort-race：两个 persistent 工具包的
  //      `await operation.done` 与工具 signal abort race，abort 先醒即
  //      shells.reset(...) 让 terminal.kill() 生效（正常完成路径不变）；
  //   2) terminal-interrupt-escalation：dsh-terminal-bash interruptOnce
  //      中断 2s 后仍未 settle 即 close("interrupt escalation")，不再等
  //      300s（兜底其他消费方）。
  // 上游修复意向：上游内置同款 abort race / 中断升级后，两补丁经 already /
  // anchor-missing 自然退役（参照 workspace-search-rail-fix 休眠先例），无需手工摘除。
  // -------------------------------------------------------------------------
  {
    id: 'persistent-shell-abort-race',
    group: 'runtime',
    order: 105,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRels: PERSISTENT_SHELL_PKG_RELS,
    transform: transformPersistentShellAbortRace,
    marker: PERSISTENT_ABORT_RACE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '持久 shell 停止补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已让中止即时复位持久 shell ' + file,
      failLog: (file, err) => '持久 shell 停止补丁失败(' + file + '): ' + err.message,
    },
  },
  {
    id: 'terminal-interrupt-escalation',
    group: 'runtime',
    order: 106,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: TERMINAL_BASH_REL,
    transform: transformTerminalInterruptEscalation,
    marker: INTERRUPT_ESCALATION_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'PTY 中断升级补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入中断升级到 ' + file,
      failLog: (file, err) => 'PTY 中断升级补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 防护类补丁（guard 布局）。
  // -------------------------------------------------------------------------
  {
    id: 'profile-patch-guard',
    group: 'guard',
    order: 110,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: APP_BOOT_PKG_REL,
    transform: transformProfilePatchGuard,
    marker: PROFILE_PATCH_GUARD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'profile patch 防护',
      doneLog: (file) => '已注入自愈加载到 ' + file,
      failLog: (file, err) => 'profile patch 防护失败: ' + err.message,
    },
  },
  {
    id: 'profile-bundle-guard-appboot',
    group: 'guard',
    order: 120,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: APP_BOOT_PKG_REL,
    transform: transformProfileBundleAppBoot,
    marker: PROFILE_BUNDLE_GUARD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'profile bundle 防护',
      doneLog: (file) => '已注入自愈装配到 ' + file,
      failLog: (file, err) => 'profile bundle 防护失败(' + file + '): ' + err.message,
    },
  },
  // 0.2.0-rc.2：dsh 主包的 profile-boot-*.js 装配面消失，补丁层读取收口进
  // dsh-app-boot 的 readProfilePatches（同时是 dsh-hmr 的进口）。防护随之改挂
  // 同一靶文件，不再需要 layout='profile-boot-dirs' 的运行时目录扫描。
  {
    id: 'profile-patch-layer-guard',
    group: 'guard',
    order: 130,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: APP_BOOT_PKG_REL,
    transform: transformProfilePatchLayerGuard,
    marker: APP_BOOT_PATCH_LAYER_GUARD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '用户补丁层防护',
      doneLog: (file) => '已注入自愈加载到 ' + file,
      failLog: (file, err) => '用户补丁层防护失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // loader 自动隔离（单插件失败不拖垮整棵插件树）：boot 激活审计 → 跳过 + 标记；
  // installFailLoud 就绪后不 exit。受保护核心（dsh-base / dsh-web-app）失败仍
  // fatal。落盘 quarantine 由壳层观察标记后统一执行（见
  // scripts/plugin-core/lib/quarantine.js）。
  // 【已退役】loader-tree-isolation：0.2.0-rc.2 的 cordis-plugin-loader 1.0.5
  // 自己做到了逐条目隔离（EntryGroup.update 每个 id 各自 .catch(logger.error)、
  // EntryTree.await 只 Promise.allSettled、导入失败也只 logger.error），
  // 全文件 throw 从 25 处降到 3 处（均为条目查找错误），AggregateError /
  // failures / "loader fibers failed" 0 命中，插入点消失。
  // ⚠ 代价：核心条目（dsh-base / dsh-web-app）失败现在也只有一行 error 日志，
  //   不再由 loader 抛出；致命性只剩 boot 激活审计（loader-activation-isolation）
  //   与 installFailLoud 两道，故这两条必须保住。
  // -------------------------------------------------------------------------
  {
    id: 'loader-activation-isolation',
    group: 'guard',
    order: 146,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: APP_BOOT_PKG_REL,
    transform: transformLoaderActivationIsolation,
    marker: LOADER_ACTIVATION_ISOLATION_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'loader 激活审计自动隔离',
      doneLog: (file) => '已注入自动隔离到 ' + file,
      failLog: (file, err) => 'loader 激活审计自动隔离失败: ' + err.message,
    },
  },
  {
    id: 'fail-loud-isolation',
    group: 'guard',
    order: 147,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: APP_BOOT_PKG_REL,
    transform: transformFailLoudIsolation,
    marker: FAIL_LOUD_ISOLATION_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'fail-loud 就绪后隔离',
      doneLog: (file) => '已注入到 ' + file,
      failLog: (file, err) => 'fail-loud 就绪后隔离失败: ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 静默失败「原文上身」两条（2026-10-10，mac 端 9 插件 failed to load + 发送文件
  // 恒报 prompt rejected 两轮发布查不下去的直接原因）。
  //   rc.2 起插件导入失败不再抛出：Entry._init 只 ctx.logger.error + return，
  //   而 cordis 默认 logger exporter 是纯内存环形缓冲（不打印），boot() 的诊断
  //   exporter 收下的 warn/error 也只在抛 StartupError 时才由 bin.js
  //   reportStartupFailure 落盘 <DSH_HOME>/logs/startup-*.log——我们的激活隔离
  //   恰好让非核心条目不再抛 StartupError，于是三重静默，日志只剩一行
  //   「failed to load — auto-isolated」。prompt 准入链同型：兜底分支把任何
  //   非 RemoteError 标成 session/agent-busy，真因只在 details.reason、UI 不渲染。
  //   这两条只把「内核本来就握着」的异常写进 stderr（B 另把原因摘要带进报文，
  //   code 与 details 不变），不改判定、不改返回值，且各自 try 包裹——诊断绝不
  //   反噬宿主。前缀 [loader-diagnostic] / [prompt-admission] 不是壳层标记
  //   （plugin-core/lib/markers.js 只认 [loader-isolation] / [crash-shield]），
  //   故不会多喂一次 quarantine 事件。
  // -------------------------------------------------------------------------
  {
    id: 'loader-import-failure-report',
    group: 'guard',
    order: 148,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: LOADER_PKG_REL,
    transform: transformLoaderImportFailureReport,
    marker: LOADER_IMPORT_REPORT_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'loader 导入失败原文',
      doneLog: (file) => '已注入导入失败诊断到 ' + file,
      failLog: (file, err) => 'loader 导入失败原文注入失败: ' + err.message,
    },
  },
  {
    id: 'prompt-admission-reason-report',
    group: 'guard',
    order: 150,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: SESSION_CTRL_INDEX_PKG_REL,
    transform: transformPromptAdmissionReasonReport,
    marker: PROMPT_ADMISSION_REASON_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'prompt 准入异常原文',
      doneLog: (file) => '已注入准入异常诊断到 ' + file,
      failLog: (file, err) => 'prompt 准入异常原文注入失败: ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // workspace-search-rail-fix 已退役（v0.6.0 alpha.2 重靶期）：0.1.2-alpha.2
  // 上游原生包含同款守卫（`if (!wide || !searchExpanded || searchOnExpand)
  // return;` 且 deps 含 searchOnExpand，pristine :L1991 实证），补丁无增量。
  // transform 保留在 patch-adapters（休眠，参照 session-event-bound 先例）。
  // -------------------------------------------------------------------------
  // K25 手动排序拖拽失效修复：会话行 HTML5 拖拽在 React 18 批处理下 drag.active
  // 未及时更新导致 dragover/drop 未 preventDefault → 拖拽无效。onDragStart 内
  // flushSync 同步提交 drag 状态。只改会话行（node.id）拖拽起点，不动排序/持久化。
  {
    id: 'manual-sort-drag-fix',
    group: 'runtime',
    order: 149,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: WORKSPACE_PKG_REL,
    transform: transformManualSortFix,
    marker: MANUAL_SORT_DRAG_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '手动排序拖拽修复',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入到 ' + file,
      failLog: (file, err) => '手动排序拖拽修复失败(' + file + '): ' + err.message,
    },
  },
  // K1 根因修复（「credentials service is absent」桌面端偶发，2026-08）：
  //   fallback heal 单点容错 + credentials 首读瞬时重试 + 报错文案指引。
  // 根因：半套 fallback 树（heal 单名失败整体中止）× loader 隔离静默降级 →
  // credentials 服务缺席，用户保存 API key 才暴露。详见 patch-adapters K1 注释。
  // 【已退役】fallback-heal-isolation：rc.2 删除了整个 fallback junction heal
  // 子系统（详见 patch-adapters.js K1 段说明），写链接循环锚点 0 命中。
  {
    id: 'credentials-initial-retry',
    group: 'guard',
    order: 152,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: path.join('dsh-credentials-local', 'lib', 'index.js'),
    transform: transformCredentialsInitialRetry,
    marker: CREDENTIALS_INITIAL_RETRY_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'credentials 首读重试',
      doneLog: (file) => '已注入瞬时错误重试到 ' + file,
      failLog: (file, err) => 'credentials 首读重试失败(' + file + '): ' + err.message,
    },
  },
  {
    id: 'credentials-absent-guidance',
    group: 'guard',
    order: 153,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: API_SETTINGS_CONTROLLER_PKG_REL,
    transform: transformCredentialsAbsentGuidance,
    marker: CREDENTIALS_ABSENT_GUIDANCE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'credentials 缺席报错指引',
      doneLog: (file) => '已注入修复指引到 ' + file,
      failLog: (file, err) => 'credentials 缺席报错指引失败(' + file + '): ' + err.message,
    },
  },
  {
    // 设备未授权指引：DeepSeek 服务端 403 风控原文（"This device is not
    // authorized…"）透传到前端是句英文死谜语——401/403 且命中设备授权特征时
    // 追加中文可操作指引（换令牌而非重试/重装）。详见 patch-adapters 注释。
    id: 'device-auth-guidance',
    group: 'guard',
    order: 154,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: DS_LLM_DEEPSEEK_PKG_REL,
    transform: transformDeviceAuthGuidance,
    marker: DEVICE_AUTH_GUIDANCE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '设备未授权报错指引',
      doneLog: (file) => '已注入可操作指引到 ' + file,
      failLog: (file, err) => '设备未授权报错指引失败(' + file + '): ' + err.message,
    },
  },
  {
    // #154 第三根因：内核 web UI boot 看门狗——client module system / boot
    // 数据长时间不可达时前端 boot 页无限转圈（内核进程活着、探活恒过，
    // 壳侧恢复页不出现）。在 dsh-web-frontend/dist/index.html 注入有界
    // 等待看门狗（45s 超时 → 明确错误 + 重新加载出口 + 完全退出重启指引）。
    // 独立文件补丁（dist 只有 app 内置与 agent overlay 两份，不套 guard 的
    // 嵌套 dsh 副本）。cli:false：只在桌面壳 boot 链应用（CLI 同步期不碰
    // 内核包源码之外的目标）。锚点失配（版本差异）warn 跳过，不阻断启动。
    id: 'kernel-web-boot-watchdog',
    group: 'guard',
    order: 156,
    kind: 'file',
    layout: 'web-frontend-dist',
    wslLayout: 'web-frontend-dist',
    pkgRel: KERNEL_WEB_INDEX_REL,
    transform: transformKernelBootWatchdog,
    marker: KERNEL_BOOT_WATCHDOG_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '内核 boot 看门狗',
      doneLog: (file) => '已注入 boot 看门狗（#154 不再无限转圈） ' + file,
      failLog: (file, err) => '内核 boot 看门狗注入失败(' + file + '): ' + err.message,
    },
  },
  {
    id: 'plugin-inventory-tab-merge',
    group: 'guard',
    order: 160,
    kind: 'file',
    layout: 'guard',
    wslLayout: 'guard',
    pkgRel: path.join('dsh-client-ui-settings-plugins', 'lib', 'client.js'),
    transform: transformPluginInventoryTabMergeFix,
    marker: PLUGIN_INVENTORY_TAB_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '插件页标签合并',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已隐藏「全部」只读清单 ' + file,
      failLog: (file, err) => '插件页标签合并失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 包级补丁（node_modules 根应用器，kind='root'）。
  // -------------------------------------------------------------------------
  {
    id: 'web-search-baseurl',
    group: 'package',
    order: 170,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchWebSearchBaseUrl,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    successLog: (root) => 'web-search baseURL 补丁: 已应用到 ' + root,
    failLog: (root, err) => 'web-search baseURL 补丁失败(' + root + '): ' + err.message,
  },
  {
    id: 'menu-viewport',
    group: 'package',
    order: 180,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchMenuViewport,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    successLog: (root) => 'menu 视口补丁: 已应用到 ' + root,
    failLog: (root, err) => 'menu 视口补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // 对话删除 / 归档管理补丁（删除 + 恢复归档 + 客户端「删除对话」菜单项）。
  // 在 dsh-workspace / dsh-session / dsh-api-workspace-controller /
  // dsh-api-remotes / dsh-client-ui-workspace 上做外科手术式扩展；孤儿进程
  // 清理（原 session-orphans 补丁）已内联到 deleteSession。菜单项可见性由
  // host-capabilities 的 deleteSession 桥守卫控制（桥缺失即隐藏）。
  // -------------------------------------------------------------------------
  {
    id: 'session-manage',
    group: 'package',
    order: 190,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchSessionManage,
    marker: null,
    requires: ['deleteSession'],
    failPolicy: 'warn',
    cli: false,
    successLog: (root) => '对话删除补丁: 已应用到 ' + root,
    failLog: (root, err) => '对话删除补丁失败(' + root + '): ' + err.message,
  },
  {
    id: 'open-project-dir',
    group: 'package',
    order: 200,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchOpenProjectDir,
    marker: null,
    requires: ['openPath'],
    failPolicy: 'warn',
    cli: false,
    successLog: (root) => '打开项目目录补丁: 已应用到 ' + root,
    failLog: (root, err) => '打开项目目录补丁失败(' + root + '): ' + err.message,
  },
  {
    // 侧栏工作区置顶（v0.6.3）：⋯ 菜单「置顶到列表顶部」，可多选，置顶行按
    // 置顶时间降序压顶；localStorage 持久化。锚点基于 open-project-dir 应用
    // 后的文本（order 200 → 本项 215 在其后），两者改动面互不重叠。
    id: 'workspace-pin',
    group: 'package',
    order: 215,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchWorkspacePin,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    successLog: (root) => '工作区置顶补丁: 已应用到 ' + root,
    failLog: (root, err) => '工作区置顶补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // preset-seat-fix 已退役（0.1.5-rc.1 重靶期）：上游 AgentPresetSeatController
  // 已把 this.remotePresets(ctx) 双重错误（模块级函数误加 this + ctx 应为
  // this.ctx）改为 this.ctx.remote.agentPresets.select(...)，且 select 返回
  // { ok, error } 结果对象（!result.ok 分支复位 busy）——busy 卡死根因已原生
  // 修复，补丁无增量。patch-preset-seat.js 保留（休眠，参照 workspace-search-rail-fix 先例）。
  // -------------------------------------------------------------------------
  {
    id: 'session-persistence',
    group: 'package',
    order: 210,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchSessionPersistence,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => '会话历史尾部恢复补丁: 已应用到 ' + root,
    failLog: (root, err) => '会话历史尾部恢复补丁失败(' + root + '): ' + err.message,
  },
  {
    id: 'tool-source-compat',
    group: 'package',
    order: 220,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchToolSourceCompat,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'tool source 容错补丁: 已应用到 ' + root,
    failLog: (root, err) => 'tool source 容错补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // pi-ai opencode-go 模型目录补丁：内置 catalog 落后于端点，缺
  // deepseek-v4-flash-vision-exp（设置页「获取可用模型」与模型选择器都经
  // 内置 catalog 作答，故看不到该型号）。向 opencode-go.json 克隆同族基型
  // deepseek-v4-flash 条目并追加 image 输入；上游重新生成 catalog 收录后经
  // 「已存在即跳过」自然退役。见 scripts/patch-pi-ai-opencode-go-models.js。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-opencode-go-models',
    group: 'package',
    order: 230,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchPiAiOpencodeGoModels,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'opencode-go 模型目录补丁: 已应用到 ' + root,
    failLog: (root, err) => 'opencode-go 模型目录补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // pi-ai 余额判定前置补丁（F2，第三方模型接入反馈）：opencode 等第三方
  // provider 欠费返回 401 + CreditsError("Insufficient balance")，
  // classifyPiAiError 的 401→AUTH 判定行排在 isQuotaExceededError 之前 →
  // 客户端投影「API key is invalid」，把欠费误报成 key 无效。调换两行顺序
  // （余额在前），真 401（无余额关键词）仍判 AUTH。此前仅 patch-deps
  // （postinstall）应用，node_modules 刷新即静默丢失——v0.5.3 payload 与 dev
  // 树实测均缺失，现补进 boot 期注册表幂等自愈。锚点失配（上游重排判定）
  // 自动退役。见 scripts/patch-pi-ai-credits.js。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-credits',
    group: 'package',
    order: 231,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchPiAiCredits,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'pi-ai 余额判定补丁: 已应用到 ' + root,
    failLog: (root, err) => 'pi-ai 余额判定补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // pi-ai 裸 400/413 no body 友好文案补丁（第三方模型接入）：OpenAI 兼容端点
  // 返回「HTTP 400 无响应体」时，OpenAI SDK 格式化为 "400 status code
  // (no body)"。该形态是模糊信号：既可能是上下文超窗，也可能是供应商网关
  // 拒绝/故障（0.6.0 实测 tokenrhythm 故障窗口内连 530B 标题请求都 400 空体）。
  // 补丁在 overflow 分支把裸 400/413 no body 映射为两成因并列的可操作提示
  // （超限→精简/开新会话；网关→重试/换模型），不再说死成超限误导用户删会话。
  // 其余可读超限文案不丢信息。锚点失配自动退役。见
  // scripts/patch-pi-ai-overflow-message.js。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-overflow-message',
    group: 'package',
    order: 232,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchPiAiOverflowMessage,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'pi-ai 超限文案补丁: 已应用到 ' + root,
    failLog: (root, err) => 'pi-ai 超限文案补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // token-meter-clamp 已退役（0.1.5-rc.1 重靶期）：上游 contextBreakdown 的
  // apply 重构为「systemTokens = findLast(system) + messageTokens = system +
  // message + delta - system」——新公式恒非负（message 为全部非 tools 节点
  // 新 token 总和减去单个 system 节点，非负性天然成立），写端负值 bug 已原生
  // 修复；stateVersion 亦已演进到 4（0.5.6 的 ver=2 负值行经 restoreFloor
  // 自然作废）。两层子补丁均无增量。patch-token-meter-clamp.js 保留（休眠）。
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 设置写入韧性补丁（PR5，v0.5.2「添加供应商没反应/灰」两层根治）：
  //   1) 孤儿锁自愈（dsh-atomic-write）——内核持锁窗口内被强杀留下
  //      settings.yaml.lock 孤儿，此后该机所有设置写入 2s 超时失败（页面只读
  //      面全部正常，用户只见英文路径报错沉在表单底部）。竞争分支追加「锁内
  //      PID 已死即删」探测，PID 复用/权限歧义退回上游语义。
  //      —— 0.2.0-rc.2 起该层退役，见下方退役说明。
  //   2) 设置页韧性（dsh-client-ui-settings-models）——describe 镜像只在 idle
  //      首载而宿主 register 不发事件，镜像陈旧时「添加自定义供应商」按钮
  //      protocols=[] 恒灰、「添加」addNamespace 缺席点击无反应；load() 在
  //      provider 目录与镜像视图偏差时强制重读。附带 CustomProviderCard 的
  //      settings-conflict 静默重试一次（打开后命名空间被写 → 点创建稳定吃
  //      冲突报错，观感同「没反应」）。
  // failPolicy warn：上游形态漂移时 anchor-missing 自动退役，不阻断 boot。
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // atomic-write-orphan-lock 已退役（0.2.0-rc.2 重靶期）：上游在 withFileLock 的
  // 竞争分支里原生加了 takeOverExitedLock——按锁记录 PID 探活，ESRCH 即删锁重试，
  // 并用 `<lock>.takeover-<digest>` 独占 claim 兜住双删竞态；EPERM（他人 PID /
  // 跨用户存活）与不可解析的锁记录一律按仍存活处理，与我们那份同语义、且更严。
  // patchAtomicWriteOrphanLock / transformOrphanLock 保留休眠（参照 preset-seat-fix
  // 先例），锚点已在脚本头注明退役判据，别在版本回退时误恢复。
  // -------------------------------------------------------------------------
  {
    id: 'settings-models-resilience',
    group: 'package',
    order: 243,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchSettingsModelsResilience,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => '设置页韧性补丁: 已应用到 ' + root,
    failLog: (root, err) => '设置页韧性补丁失败(' + root + '): ' + err.message,
  },
  // -------------------------------------------------------------------------
  // pi-ai 手声明路由思考档位默认补丁（F4，v0.5.3「第三方思考强度不生效」
  // 根治）：设置页「添加自定义供应商」的模型条目从不写 reasoningEfforts 字典
  //（上游 UI 有意不设 provider 级控件），而 dsh-llm-pi-ai 的
  // resolveModelReasoning 对未声明字典的条目回落「继承内置 catalog 同 id 条目」
  // ——手声明路由无 catalog 基条目 → 恒 reasoning:false → 思考强度控件永不
  // 出现、显式档位报 UNSUPPORTED_REASONING_EFFORT；v0.5.3 又把 PiAiAdapter
  // 整类豁免出 dsh-third-party-thinking（豁免正确——插件假档位会被原生校验
  // 拒绝），旁路同断。补丁令手声明条目（无 base）未声明字典时回落标准
  // OpenAI 档位字典（off=不发字段；low/medium/high 直通，三个可手声明协议的
  // wire 映射原生消费）：控件开箱即用，未选档位不发任何字段（严格网关安全），
  // catalog 条目与显式声明字典的语义不变。锚点失配（上游重构该函数）自动
  // 退役。见 scripts/patch-pi-ai-reasoning-defaults.js。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-reasoning-defaults',
    group: 'package',
    order: 244,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchPiAiReasoningDefaults,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'pi-ai 思考档位默认补丁: 已应用到 ' + root,
    failLog: (root, err) => 'pi-ai 思考档位默认补丁失败(' + root + '): ' + err.message,
  },

  // -------------------------------------------------------------------------
  // 插件 client bundle 到达瞬态失败重试补丁（E2/问题A，v0.5.3 用户实测
  // 「Failed to load plugins ... dsh-better-sidebar: bundle script
  // /plugins/dsh-better-sidebar/client.js?rev... failed to load」）。
  //
  // 报错来自 dsh-client-modules 浏览器半边 defaultLoadBundle 的 script error
  // 事件——HTTP 取回失败（404/连接拒绝），非模块表失败（#124/PD1 形态另有
  // client-compat 修）。?rev= 仅缓存击穿、serveBundle 不校验，同进程 404 只能
  // 是请求时 readFile 失败：杀软扫描锁（安装/升级后全新文件首读正处扫描窗口）
  // 或插件目录被并发替换（升级 sync / 插件中心 / hub 运行时更新）；跨进程窗口
  // 是内核重启刻意复用同端口、旧页面惰性 import 撞上换代间隙。arrive() 把单次
  // 失败当终态 → loader entry 永久 failed 直到整页刷新。补丁双端修：浏览器半边
  // script error 有界退避重试（4 试 300/900/2700ms + retry= 击穿参数），内核半边
  // serveBundle 对瞬态错误码（ENOENT/EPERM/EBUSY/EACCES/ETIMEDOUT）短重试 3 次
  // 后才 404。见 scripts/lib/bundle-arrival-retry-patch.js。
  // -------------------------------------------------------------------------
  {
    id: 'bundle-arrival-retry',
    group: 'package',
    order: 245,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchBundleArrivalRetry,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => 'bundle 到达重试补丁: 已应用到 ' + root,
    failLog: (root, err) => 'bundle 到达重试补丁失败(' + root + '): ' + err.message,
  },

  // -------------------------------------------------------------------------
  // 工具调度器缺席防崩补丁（E2/问题B，v0.5.3 用户实测 issue #147 同款
  // 「Cannot read properties of undefined (reading 'prepare')」——
  // dsh-agent-loop/lib/index.js:193 的 ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare）。
  //
  // V8 报错形态实证：报 'prepare' 说明 ctx.tools 是对象但符号字段取值 undefined
  //（若 ctx.tools 本身 undefined 报的是 reading 'Symbol(...)'）。该符号是
  // Symbol(...)（副本唯一）：进程内出现第二份 dsh-tools 模块实例（插件自带嵌套
  // 副本）时两份符号互不相认 → undefined → 工具步中途炸；另一形态是 ctx.tools
  // 被替代实现顶替。补丁双端修：dsh-agent-loop 四处裸读改为解析器（私有符号 →
  // Symbol.for 全局镜像 → 带修复指引的显式错误，不伪造工具结果），dsh-tools
  // ToolRuntime 补挂 Symbol.for 进程全局镜像——跨副本查询经镜像真正命中。
  // 见 scripts/lib/scheduler-guard-patch.js。
  // -------------------------------------------------------------------------
  {
    id: 'agent-loop-scheduler-guard',
    group: 'package',
    order: 246,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchSchedulerGuard,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => '调度器防崩补丁: 已应用到 ' + root,
    failLog: (root, err) => '调度器防崩补丁失败(' + root + '): ' + err.message,
  },

  // -------------------------------------------------------------------------
  // 工具调用 name 为空指引补丁（K11，用户实机反馈 `unknown tool ""` 死循环
  // 重试 + repeat-tool-reminder 反复注入）：模型 Think 想调 str_replace_editor
  // 但 tool-call 的 name 字段为空 ""。空 name 由上游 pi-ai 三协议适配器逐字
  // 透传（openai-completions function.name / openai-responses output[].name /
  // anthropic-messages content_block.name 均无空名防御），dsh-tools 的
  // ToolNotFoundError 构造器再把空串嵌成 `unknown tool ""`，用户得不到任何
  // 定位线索。补丁只对「空/缺失 name」这一个明确异常形态特判，把裸报错替换
  // 为三向指引（协议错位 / 中转网关剥离 tool_call / 模型输出 JSON 崩坏），
  // 非空 name 的 unknown-tool / reachableFrom 两分支逐字不变。与
  // tool-source-patch.js（持久化层空 id/name 合成）互补。锚点失配自动退役。
  // 见 scripts/lib/empty-tool-name-patch.js。
  // -------------------------------------------------------------------------
  {
    id: 'empty-tool-name-guidance',
    group: 'package',
    order: 247,
    kind: 'root',
    layout: 'nm-roots',
    wslLayout: 'nm-roots',
    apply: rootAppliers.patchEmptyToolName,
    marker: null,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    successLog: (root) => '空工具名指引补丁: 已应用到 ' + root,
    failLog: (root, err) => '空工具名指引补丁失败(' + root + '): ' + err.message,
  },

  // -------------------------------------------------------------------------
  // model-image-input 已退役（0.2.0-rc.2 重靶期）：上游把「图片输入」做成了原生
  // 能力，本补丁的三组注入全部无增量（实测锚点 5 中 4 失配，只有 numberOf 块还在）：
  //   · 控件：dsh-client-ui-settings-models 新增 ModelInputTypes（client.js:171），
  //     展开区 grid 里直接渲染 ["text","image"] 两个 Checkbox（:250 起、:268 调用），
  //     字段名 inputModalities（:485 inputField）；
  //   · adopt()：字段白名单已含 `...candidate.inputModalities === void 0 ? {} :
  //     { input: [...candidate.inputModalities] }`（:580），端点自报模态不再被丢；
  //   · 门槛语义：dsh-api-session-controller:873 改为「已声明且不含 image 才拒」
  //     （model.inputModalities !== void 0 && !includes("image")），未声明不再当作
  //     纯文本；dsh-llm:2311 的 projectImagesForTextModel 同样只在显式声明不含
  //     image 时触发；dsh-llm/lib/typert.host.js:19 把 inputModalities 收进 zod
  //     schema（text|image 数组、optional），dsh-llm-pi-ai:1806 起以
  //     inputModalities:[...model.input] 双向投影。
  // 原补丁的三个前提（无控件、白名单丢模态、恒回落 DEFAULT_INPUT=["text"]）全部
  // 失效。patch-model-image-input.js 保留（休眠），参照 token-meter-clamp /
  // atomic-write-orphan-lock 先例，别在版本回退时误恢复。
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // agent-preset 未知 id 回落补丁（0.5.0 存量用户 resume 变砖修复，追加条目）。
  //
  // 用户会话/profile 引用 Electron 老版本安装的 minimal-win 预设，0.5.0 Tauri
  // 内核 dsh-agent-presets roster 无此 id → resolve() 抛 UnknownPresetError →
  // resume 硬失败白屏。补丁把该分支改为 warn 降级回落（minimal-win→minimal、
  // 其余未知 id→standard），PresetMountError 保持硬抛。详见 patch-adapters 的
  // transformAgentPresetFallback 注释。cli:false（对齐 prompt-context-literal
  // 先例：桌面壳 boot 链 applyAll 全量应用，CLI 同步期不碰内核包源码之外的目标）。
  // -------------------------------------------------------------------------
  {
    id: 'agent-preset-fallback',
    group: 'runtime',
    order: 240,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRels: AGENT_PRESET_FALLBACK_PKG_RELS,
    transform: transformAgentPresetFallback,
    marker: AGENT_PRESET_FALLBACK_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'agent-preset 回落补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已让未知预设 id 降级回落（minimal-win→minimal / 未知→standard） ' + file,
      failLog: (file, err) => 'agent-preset 回落补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // prompt 插值 name-invalid 字面透传补丁（任何插件写入的非法变量名模板不再
  // 每轮炸瘫 prompt 组装修复，追加条目）。
  //
  // 立论理由与具体插件无关：内核 dsh-system-prompt interpolate() 把所有
  // context/section 文本当 {{name}} 模板扫描，而这两类文本里装的大量是不可信
  // 数据——任何把动态内容（DB 行、检索原文、用户粘贴文本）拼进 context 的插件，
  // 只要数据里有一个字面量长得像 {{state.gold}}，名字带点不过 VARIABLE_NAME →
  // 硬抛 → 整轮 prompt 组装失败，会话每轮必瘫。补丁把该分支改为 warn + 字面
  // 透传；unknown-variable 分支保持硬抛（真实模板作者错误，如 dsh-workspace-anchor
  // 有意引用 {{cwd}}）。历史触发源（2026-09 真实现场）是 graph-memory 的 recall
  // 内容，该插件已随 2026-10 内置伴随插件批量退役，本补丁保留——中招的一直是
  // 「写入非法变量名模板的任意插件」这一整类；原与之互补的插件侧
  // defuseTemplateGroups 随插件下线，内核放宽因此是唯一一层。cli:false（对齐
  // agent-preset-fallback 先例：桌面壳 boot 链 applyAll 全量应用，CLI 同步期
  // 不碰内核包源码之外的目标）。详见 patch-adapters 的
  // transformPromptContextLiteral 注释。
  // -------------------------------------------------------------------------
  {
    id: 'prompt-context-literal',
    group: 'runtime',
    order: 250,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRels: PROMPT_CONTEXT_LITERAL_PKG_RELS,
    transform: transformPromptContextLiteral,
    marker: PROMPT_CONTEXT_LITERAL_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'prompt 字面量透传补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已让非法变量名字面透传 + warn（unknown-variable 仍硬抛） ' + file,
      failLog: (file, err) => 'prompt 字面量透传补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // W1 问题四（2026-08，真实 WSL2 实机）：目录选择器在 WSL 内误判 native。
  //
  // dsh-host-directory-picker-auto 的 resolveDirectoryPickerBackend 在
  // platform=linux + DISPLAY 在场（WSLg 默认 DISPLAY=:0）+ PATH 有 zenity 时
  // 判 "native"——zenity 窗口弹在 WSLg 的 Linux 桌面会话，Windows 用户看不见
  // （表现为「点选择目录没反应」）。补丁在 SSH 分支后注入 WSL 判定：
  // WSL_INTEROP / WSL_DISTRO_NAME（Microsoft 注入的 WSL 标记，Linux 裸机
  // 不可能有）任一在场即强制 "browse"（网页交互，Windows 浏览器直接可见）。
  // WSL 模式主战场是 wslLayout（agent 两副本经 UNC 写穿）；本地 Windows 副本
  // platform=win32 走 native 不受影响（补丁分支不触发）。上游 resolver 内置
  // 同款判定后经 already / anchor-missing 自然退役。cli:false（对齐
  // agent-preset-fallback 先例：桌面壳 boot 链全量应用，CLI 同步期不碰）。
  // -------------------------------------------------------------------------
  {
    id: 'wsl-picker-browse',
    group: 'runtime',
    order: 260,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: PICKER_AUTO_PKG_REL,
    transform: transformDirectoryPickerWslBrowse,
    marker: WSL_PICKER_BROWSE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'WSL 目录选择器补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已让 WSL 内目录选择强制 browse（zenity 窗口在 WSLg 不可见） ' + file,
      failLog: (file, err) => 'WSL 目录选择器补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // R7 根因修复（v0.5.3 用户反馈「registration.adapter.prepareCall is not a
  // function」）：v0.5.3 内核 0.1.1-rc.2 起 LlmRuntime.prepareCall 调用
  // adapter.prepareCall（新增契约）；内置唯一不自带 prepareCall 的自定义
  // provider 适配器 dsh-openclaw-bridge 的 OpenAiCompatAdapter 只 extends
  // LlmAdapter、依赖基类——它经 profile fallback junction 解析到旧内核
  // （0.1.0-rc.7/8，基类无 prepareCall）时该调用点即 undefined → 对话整轮炸。
  // 补丁在 dsh-llm 注入 prepareAdapterCall 守卫：缺失回落基类语义 + 升级指引。
  // failPolicy warn：上游锚点漂移时 anchor-missing 自动退役，不阻断 boot。
  // -------------------------------------------------------------------------
  {
    id: 'adapter-prepare-call-guard',
    group: 'runtime',
    order: 270,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: LLM_PKG_REL,
    transform: transformAdapterPrepareCallGuard,
    marker: ADAPTER_PREPARE_CALL_GUARD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'adapter prepareCall 守卫补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 prepareCall 缺失回落守卫到 ' + file,
      failLog: (file, err) => 'adapter prepareCall 守卫补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // contentHasImage 非数组守卫（v0.6.0 用户反馈「本轮运行失败 Cannot read
  // properties of undefined (reading 'some')」）：dsh-llm 共用唯一递归图片遍历
  // contentHasImage 对 tool-result 递归 contentHasImage(block.content)，某个
  // tool-result 块 content 为非数组（undefined）时裸 content.some 即抛错、
  // 经 adapterStream → turn/end 冒泡成整轮失败。补丁在函数头加
  // if (!Array.isArray(content)) return false（非数组天然无图）。0.6 交付时列为
  // 「同 bug 类残留未定案点」的 dsh-tools/lib/index.js 轮内 result.content.some（约
  // :1297，图片结果 finalize）本 spec 一并多靶根治（共用 marker，transform 按锚点分派）。同一
  // dsh-llm/lib/index.js 靶（adapter-prepare-call-guard 之后）。failPolicy warn：
  // 上游锚点漂移时 anchor-missing 自动退役，不阻断 boot。
  // -------------------------------------------------------------------------
  {
    id: 'content-has-image-guard',
    group: 'runtime',
    order: 271,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRels: [LLM_PKG_REL, DSHTOOLS_REL],
    transform: transformContentHasImageGuard,
    marker: CONTENT_HAS_IMAGE_GUARD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'contentHasImage 非数组守卫补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 contentHasImage 非数组守卫到 ' + file,
      failLog: (file, err) => 'contentHasImage 非数组守卫补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // K5 根因修复（v0.5.4 求稳）：会话 header 扫描缓存 + 读取上限。
  //
  // 打开子代理 → persistence.list() → listArtifacts 全量扫描 291 个会话文件、
  // 每个都 zstd 解压 header，commit 内存吃紧时把内核 node 顶爆 OOM。补丁对
  // dsh-session-persistence-jsonl 注入：1) listArtifacts 读 header 前先 stat、
  // 命中 (path,size,mtimeNs) 缓存直接复用（二次 list()/刷新列表零解码）；
  // 2) readFirstZstdLine 累积缓冲封顶 256KB（损坏/写入中文件不再整读进内存）。
  // failPolicy warn：上游锚点漂移时 anchor-missing 自动退役，不阻断 boot。
  // cli:false（对齐 agent-preset-fallback 先例：桌面壳 boot 链全量应用，CLI
  // 同步期不碰内核包源码之外的目标）。详见 patch-adapters 注释。
  // -------------------------------------------------------------------------
  {
    id: 'session-header-scan-guard',
    group: 'runtime',
    order: 275,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: PERSISTENCE_PKG_REL,
    transform: transformSessionHeaderScanGuard,
    marker: SESSION_HEADER_SCAN_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '会话 header 扫描缓存补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 header 扫描缓存 + 读取上限到 ' + file,
      failLog: (file, err) => '会话 header 扫描缓存补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // K6 根因修复（v0.5.4 求稳）：会话加载撕裂尾部优雅降级。
  //
  // 自动压缩追加的多事件批次中断后，除「结构撕裂的最后一帧」外还可能留下
  // 「结构完整但校验失败 / seq 断档」的损坏帧，readZstdPrefix 抛致命错击穿
  // loadHistory（loadHistory 读路径无 corrupt-guard）。补丁让 readZstdPrefix
  // 解码/校验失败时降级为「加载到最后一个完整帧」+ tornMarker（commitRepair
  // 截断损坏尾部并补 closers），console.warn 保留告警；header 帧损坏仍致命。
  // failPolicy warn：上游锚点漂移时 anchor-missing 自动退役，不阻断 boot。
  // cli:false（对齐 session-header-scan-guard 先例）。
  // -------------------------------------------------------------------------
  {
    id: 'session-load-graceful',
    group: 'runtime',
    order: 280,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: PERSISTENCE_PKG_REL,
    transform: transformSessionLoadGraceful,
    marker: SESSION_LOAD_GRACEFUL_MARKER_V3,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '会话加载优雅降级补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 loadHistory 撕裂尾部优雅降级到 ' + file,
      failLog: (file, err) => '会话加载优雅降级补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // Codex CLI 本地二进制回落补丁（安装包瘦身移除 @openai/codex-win32-x64
  // 原生二进制后）：@openai/codex/bin/codex.js 的 findCodexExecutable() 缺失
  // vendored 二进制即抛错，补丁追加 CODEX_BIN / PATH 回落。cli:true 使 boot +
  // CLI 同步期均应用。见 patch-adapters transformCodexLocalBinFallback。
  // -------------------------------------------------------------------------
  {
    id: 'codex-local-bin-fallback',
    group: 'runtime',
    order: 290,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: CODEX_BIN_PKG_REL,
    transform: transformCodexLocalBinFallback,
    marker: CODEX_LOCAL_BIN_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'Codex 本地二进制回落补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 CODEX_BIN / PATH 回落到 ' + file,
      failLog: (file, err) => 'Codex 本地二进制回落补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // Claude Code 子代理本地二进制回落补丁（安装包瘦身移除
  // @anthropic-ai/claude-agent-sdk-win32-x64 原生二进制后）：向 query({...})
  // 透传 pathToClaudeCodeExecutable = CLAUDE_BIN。cli:true 使 boot + CLI
  // 同步期均应用。见 patch-adapters transformClaudeLocalBinFallback。
  // -------------------------------------------------------------------------
  {
    id: 'claude-local-bin-fallback',
    group: 'runtime',
    order: 300,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: CLAUDE_SUBAGENT_PKG_REL,
    transform: transformClaudeLocalBinFallback,
    marker: CLAUDE_LOCAL_BIN_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'Claude 子代理本地二进制回落补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 pathToClaudeCodeExecutable (CLAUDE_BIN) 到 ' + file,
      failLog: (file, err) => 'Claude 子代理本地二进制回落补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // dsh-llm-deepseek 工具净化补丁（ds-tool-schema-sanitize）：官方 DeepSeek
  // 路由独立于 pi-ai 的工具序列化（适配器自己内联 map），同样需要名字规范化 +
  // schema 净化 + 回映射（官方 API 校验同款 pattern/required）。
  // 净化实现为纯函数重建——内核 deepFreeze 的 schema 上 delete 会抛 TypeError
  // 导致突变式实现静默失效（wire 探针实测）。cli:true。
  // rc.2 重锚（四处唯一命中）：适配器改走 Messages 端点，落点为 serialize() 的
  // 定义名 + input_schema、历史回放 block.name、回程 tool_use native.name。旧
  // completions 世代实测有两处 name: tool.name 而 String.replace 只洗首现，
  // Messages 那条一直漏洗——rc.2 只剩一条，重锚顺带补上该洞。multi-site。
  // -------------------------------------------------------------------------
  {
    id: 'ds-tool-schema-sanitize',
    group: 'runtime',
    order: 340,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: DS_LLM_DEEPSEEK_PKG_REL,
    transform: transformDsToolSchemaSanitize,
    marker: DS_TOOL_SCHEMA_SANITIZE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'ds 工具净化补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 ds 适配器 schema 净化+名字规范化/回映射到 ' + file,
      failLog: (file, err) => 'ds 工具净化补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // pi-ai 工具 schema+函数名净化补丁（pi-ai-tool-schema-sanitize）：DeepSeek/
  // LiteLLM 系路由严格校验：①属性级 required:true/false（JSON Schema 非法位置，
  // 工具工厂批量生成 schema 的插件普遍携带）②函数名含 . 等非法字符（OpenAI 规范
  // 仅 [a-zA-Z0-9_-]，任何带命名空间前缀的插件工具名都会踩）③空 required 数组
  //——任一即整请求 400 MODEL_TOOL_NOT_SUPPORTED（实测 a.b→400/ab→200；
  // required:false 工具单发全 400）。glm/qwen/kimi 不校验。守卫针对的是「任意
  // 插件产出的非法 schema / 非法名字」这一形状，与是哪个插件无关；历史触发源
  //（2026-09 现场）= 已随 2026-10 批量退役的 cardian 系 26 工具。
  // 净化：出口剥属性级布尔 required+删空 required 数组+名字规范化（非法字符→
  // 下划线），解析侧回映射还原原名分发。cli:true。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-tool-schema-sanitize',
    group: 'runtime',
    order: 330,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: PI_AI_COMPLETIONS_PKG_REL,
    transform: transformPiAiToolSchemaSanitize,
    marker: PI_AI_TOOL_SCHEMA_SANITIZE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'pi-ai 工具净化补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 schema 净化+名字规范化/回映射到 ' + file,
      failLog: (file, err) => 'pi-ai 工具净化补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // pi-ai Responses 路径工具名净化补丁（pi-ai-responses-tool-name-sanitize）：
  // 上面那条只清洗 Chat Completions 序列化（openai-completions.js），而
  // openai-responses / azure-openai-responses / openai-codex-responses 三条路由
  // 共用 openai-responses-shared.js 的 convertResponsesTools + 流式槽位构造，
  // 全程零清洗 → 任何带命名空间点号的插件工具名直上 wire（历史触发源 = 已随
  // 2026-10 批量退役的 dsh-cardian 的 `cardian.*`），被 OpenAI
  // 兼容网关按 pattern ^[a-zA-Z0-9_-]+$ 拒为 400 invalid_value（在野整轮失败，
  // 报文 "OpenAI API error (400): Invalid 'tools[1].name'"）。守卫按 wire 形状
  // 立论，插件换成谁都一样要洗。6 落点：出站
  // grammar/function 两分支 name + 历史回放两处 name（回放的必须也是 wire 名）、
  // 入站 function_call/custom_tool_call 槽位 name 还原原名分发。规则与回映射
  // 语义同 completions 补丁，但两文件属不同模块作用域、映射表各自独立。cli:true。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-responses-tool-name-sanitize',
    group: 'runtime',
    order: 335,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: PI_AI_RESPONSES_SHARED_PKG_REL,
    transform: transformPiAiResponsesToolNameSanitize,
    marker: PI_AI_RESPONSES_TOOL_NAME_SANITIZE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'pi-ai Responses 工具名净化补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 Responses 路径名字规范化/回映射到 ' + file,
      failLog: (file, err) => 'pi-ai Responses 工具名净化补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // pi-ai 适配层工具名 wire 中央收口（一处覆盖全部 provider）。
  // 为什么还要一条：completions 与 Responses 两条逐适配器补丁只盖住 OpenAI 家族，而
  // anthropic-messages / google / bedrock / mistral 同样把 name 原样塞进请求，且这四家
  // 的函数名规则都不收点号（Anthropic 是 ^[a-zA-Z0-9_-]{1,64}$）——带点号前缀的
  // 插件工具名（历史触发源：已随 2026-10 批量退役的 dsh-cardian 的
  // cardian.backlinks 一类）在任一家的请求里都会 400。逐适配器打补丁等于长期追上游
  // 尾巴，故在内核与 pi-ai 的唯一交界处收口。与两条逐适配器补丁可并存：清洗幂等
  // （wire 名再洗不变），还原按映射表命中才改。cli:true。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-tool-name-wire',
    group: 'runtime',
    order: 336,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: DSH_LLM_PIAI_PKG_REL,
    transform: transformPiAiToolNameWire,
    marker: PI_AI_TOOL_NAME_WIRE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'pi-ai 工具名 wire 中央收口补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入工具名 wire 规范化/回程还原到 ' + file,
      failLog: (file, err) => 'pi-ai 工具名 wire 中央收口补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // pi-ai 配额耗尽不得重试补丁（pi-ai-quota-not-retryable）：OpenAI 兼容渠道的
  // 配额/余额耗尽与限流同为 429 —— provider-retry.js 的 isRetryableProviderError
  // 把 429 一律判可重试（对**限流**是对的），于是
  // {"message":"Allocated quota exceeded...","type":"insufficient_quota",
  //  "code":"insufficient_quota"} 这类终态错误每次请求都先白等若干轮退避
  // （单轮上限 60s），最后才交上层。上游分类本已正确（@deepseek-ai/dsh-llm 的
  // isQuotaExceededError 覆盖 insufficient_quota / quota exceeded，dsh-llm-pi-ai
  // 的 QUOTA 判定排在 429→RATE_LIMIT 之前），故本条**不动分类、只改可重试性**：
  // 识别为配额耗尽即立即返回不可重试，让用户马上看到配额/余额提示。判定顺序：
  // 显式 x-should-retry 头优先（运维可覆盖），其后才看配额特征；纯限流文案
  // （rate limit / too many requests）不命中，仍走正常退避重试。cli:true。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-quota-not-retryable',
    group: 'runtime',
    order: 337,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: PI_AI_PROVIDER_RETRY_PKG_REL,
    transform: transformPiAiQuotaNotRetryable,
    marker: PI_AI_QUOTA_NOT_RETRYABLE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'pi-ai 配额不重试补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入配额耗尽不可重试判定到 ' + file,
      failLog: (file, err) => 'pi-ai 配额不重试补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // pi-ai 4xx 请求落盘补丁（pi-ai-4xx-dump，"400 status code (no body)" 诊断）：
  // 网关对 streaming 请求的 4xx 一律无响应体（实测 401-no-body），错误侧
  // 看不到任何成因。补丁在 pi-ai stream() 的 catch 里把当时的 model/baseUrl/
  // 完整 params 落到 $DSH_HOME/llm-4xx-dump.log（messages 每条截 2000 字），
  // 一次复现即可定位真实拒因。写失败静默、绝不影响请求流。cli:true。
  // -------------------------------------------------------------------------
  {
    id: 'pi-ai-4xx-dump',
    group: 'runtime',
    order: 320,
    kind: 'file',
    layout: 'runtime-local-nm',
    wslLayout: 'runtime-local-nm',
    pkgRel: PI_AI_COMPLETIONS_PKG_REL,
    transform: transformPiAi4xxDump,
    marker: PI_AI_4XX_DUMP_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'pi-ai 4xx 落盘补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已注入 4xx 请求落盘到 ' + file,
      failLog: (file, err) => 'pi-ai 4xx 落盘补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // skill 目录兼容补丁（skill-dirs-compat，用户技能管理面板空白反馈）：
  // dsh-skill-filesystem 的 roots() 只扫 .dsh/.agents 系根，用户为
  // Claude Code（~/.claude/skills）与 Codex CLI（~/.codex/skills）装的技能
  // 不可见。补丁：1) includeDefaultRoots 时追加 user-claude / user-codex
  // 两个约定根（rank 低于 user-agents、高于 bundled，custom 目录仍优先）；
  // 2) DSH_SKILL_DIRS（path.delimiter 分隔）并入 customSkillDirs。
  // 上游原生收录这些根后经 already / anchor-missing 自然退役。cli:true：
  // boot + CLI 同步期均应用。见 patch-adapters transformSkillDirsCompat。
  // -------------------------------------------------------------------------
  {
    id: 'skill-dirs-compat',
    group: 'runtime',
    order: 310,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: SKILL_FS_PKG_REL,
    transform: transformSkillDirsCompat,
    marker: SKILL_DIRS_COMPAT_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: 'skill 目录兼容补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已让 ~/.claude/skills、~/.codex/skills 与 DSH_SKILL_DIRS 参与技能发现 ' + file,
      failLog: (file, err) => 'skill 目录兼容补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 工作区标签闪跳补丁（workspace-chip-label-hold，0.1.2-alpha.5「选择工作
  // 文件夹时跳闪」反馈）：对话头 chip 标题在 workspace 投影 phase === "ready"
  // 时不再回退 session.cwd 派生标签，而选完文件夹的那一帧里会话已 open、cwd
  // 已就位，workspaces.items[].sessionIds 却要等宿主下一次 upsert 才回显——
  // chipTitle 塌成 undefined，chip 闪回「选择工作区」+ 输入框 inert（禁用）。
  // 补丁删除该 gate 的一项，让 cwd 回退覆盖投影缺口；无 cwd 的真空 hero 态
  // 仍由剩余两项维持。纯显示面，不触状态机。见 patch-adapters
  // transformWorkspaceChipLabelHold（历史 runtime-flash-fix 修的是会话列表侧，
  // 与本补丁同症状、不同向量，二者均在位）。cli:true：boot + CLI 同步期均应用。
  // -------------------------------------------------------------------------
  {
    id: 'workspace-chip-label-hold',
    group: 'runtime',
    order: 350,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: CONVERSATION_PKG_REL,
    transform: transformWorkspaceChipLabelHold,
    marker: WORKSPACE_CHIP_LABEL_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: true,
    logs: {
      prefix: '工作区标签闪跳补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已修复选择工作文件夹时闪回「选择工作区」/输入框禁用 ' + file,
      failLog: (file, err) => '工作区标签闪跳补丁失败(' + file + '): ' + err.message,
    },
  },

  // -------------------------------------------------------------------------
  // 历史对话分页容量放大（h1，历史加载不全主诉之一）：客户端首屏 open 与向上
  // 翻页 loadOlder 的每页条数 50→200，服务端 DEFAULT_MAX_MESSAGES 同步 50→200。
  // 服务端对 maxMessages 仅校验正整数、无上限夹取，故请求 200 即得 200 条。落点
  // 两文件：session-controller lib/client.js（events.open + loadOlder 两处调用点）
  // 与 lib/index.js（DEFAULT_MAX_MESSAGES）。数字字面量正则替换、容忍缩进差异。
  // 与 runtime-flash-fix 同靶 lib/client.js（不同区段，互不重叠）。cli:false：
  // 仅桌面壳 boot 链应用。详见 runtime-patches transformHistoryPageSize。
  // -------------------------------------------------------------------------
  {
    id: 'history-page-size',
    group: 'runtime',
    order: 360,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    // 0.2.0-rc.2 起客户端半已由上游原生覆盖：client.js 把两处调用点的 50 收成
    // 共享常量 HISTORY_PAGE_OPTIONS（maxMessages: 500），比我们的 200 更大，
    // 且不再有 `maxMessages: 50` 字面量可锚（正则的 \b 也不会误改 500）。
    // 服务端默认值仍是 50（index.js 的 DEFAULT_MAX_MESSAGES），故只保留该靶。
    pkgRels: [SESSION_CTRL_INDEX_PKG_REL],
    transform: transformHistoryPageSize,
    marker: HISTORY_PAGE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '历史分页容量补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已放大历史对话分页容量（50→200） ' + file,
      failLog: (file, err) => '历史分页容量补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // journal-stream 历史续读补丁（BUG1「历史加载不全」根因之一）。
  // 靶 dsh-api-gateway/lib/client.js RemoteJournalStream.prepend()：删除「不连续
  // 历史页」断头分支（publish entries:[] + hasMore:false + throw），使其改走下方
  // 正常分支（prepend accepted + 推进 baseSeq + 回填真实 hasMore），历史可持续向
  // 更早处翻页，不再一遇不连续就永久锁死。连续页行为不变（该分支本不触发）。cli:false。
  // -------------------------------------------------------------------------
  {
    id: 'journal-prepend-continuity',
    group: 'runtime',
    order: 370,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: GATEWAY_CLIENT_PKG_REL,
    transform: transformJournalPrependContinuity,
    marker: JOURNAL_PREPEND_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '历史续读补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已放开不连续历史页的续读锁定 ' + file,
      failLog: (file, err) => '历史续读补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 聊天滚到顶自动翻页补丁（BUG1 体验收口）。
  // 靶 dsh-client-ui-chat/lib/client.js ChatView：向 flow column 顶部注入哨兵 div +
  // IntersectionObserver effect，滚入视口即复用现有 loadOlderAnchored 自动翻页，
  // 不再需手动点「加载更早」。不触碰 hot onScroll 采样路径。multi-site（两处注入）。cli:false。
  // -------------------------------------------------------------------------
  {
    id: 'chat-scroll-autoload-older',
    group: 'runtime',
    order: 380,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: UI_CHAT_CLIENT_PKG_REL,
    transform: transformChatAutoLoadOlder,
    marker: CHAT_AUTOLOAD_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '聊天自动翻页补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已启用滚到顶自动加载更早历史 ' + file,
      failLog: (file, err) => '聊天自动翻页补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 会话装配「可观测化 + 自愈」补丁（BUG2 吞消息：发送后功能执行、token 消耗、
  // 后台有轨迹，界面却不渲染新增对话）。
  // 靶 dsh-client-ui-conversation/lib/client.js BoundConversation.accept(window)（装配
  // 驱动点）：装配器对 dup-start / non-appended / update-before-start 一律 throw，
  // 抛错冒泡到 client-store notifySubscribers 被 console.error 静默吞，快照不再前进。
  // 本补丁不碰装配语义/协议热路径/去重，只在驱动层：① 将增量装配（prepend/append）
  // 或整体 replace 的抛错接住，改调 dshSafeRebuild 从 durable 的完整连续窗口
  // window.entries（权威真相）重建——瞬时竞态（start 稍后随翻页补齐）一次重建即恢复；
  // ② 若连重建都无法装配，不再静默，输出带固定前缀 [dsh-assembly-resilience] 的按错
  // 误内容去重一次的 console.error，并保持 feed 存活（不递归、不卡死）。cli:false（仅
  // 桌面壳 boot 链应用，与 history/journal/chat 系 BUG1 补丁同档）。唯一命中定位点，整个
  // accept(window) 方法体（产物内唯一），命中数非 1 整块跳过。见 patch-adapters
  // transformConversationAssemblyResilience。与 workspace-chip-label-hold 同靶
  // dsh-client-ui-conversation/lib/client.js（不同区段，互不重叠）。
  // -------------------------------------------------------------------------
  {
    id: 'conversation-assembly-resilience',
    group: 'runtime',
    order: 390,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: CONVERSATION_PKG_REL,
    transform: transformConversationAssemblyResilience,
    marker: ASSEMBLY_RESILIENCE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '会话装配自愈补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已将会话装配被吞的抛错改为安全重建 + 去重告警 ' + file,
      failLog: (file, err) => '会话装配自愈补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 思考行折叠态空白修复（0.6.3 第一案，群友 poison95 实机 + DOM 实测取证）。
  // 靶 dsh-client-ui-chat/lib/client.js「思考」行折叠态 CSS 的 contain:size layout：
  // size containment 让浏览器把元素宽度按「内容为空」计算，与第三方主题的
  // align-self:flex-start 叠加后折叠行宽度恒 0px（24px 高空白条），展开态规则
  // 不适用故正常。修法：去 size 留 layout，显式 height 继续锁折叠高度。锚点含
  // CSS modules 哈希类（.t2QtNG_root）——compat-pin 锁版 vendored 字节内即稳定锚，
  // 全文件唯一出现（探针实测）。与 chat-scroll-autoload-older 同靶同文件（不同
  // 区段，互不重叠）。cli:false。
  // -------------------------------------------------------------------------
  {
    id: 'reasoning-row-collapse-width',
    group: 'runtime',
    order: 400,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: UI_CHAT_CLIENT_PKG_REL,
    transform: transformReasoningRowCollapseWidth,
    marker: REASONING_ROW_COLLAPSE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '思考行折叠空白修复',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已去掉思考行折叠态 size containment（折叠空白修复） ' + file,
      failLog: (file, err) => '思考行折叠空白修复失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 跨版本 session 日志未知事件类型兜底（0.6.3 第二案）。
  // 靶 dsh-session-persistence/lib/index.js assertEventsSupported：上游对未知且未标
  // ignorable 的事件 fail-closed（一条新版 harness 写入的 slice/digest 就让整个
  // observe 拒载），用户降级/换装后老对话全部打不开。修法：整方法替换为「收集 +
  // 跳过 + [dsh-unknown-event-tolerance] 一次性告警」，格式版本拒绝（assertVersion）
  // 仍 fail-closed。cli:false。
  // -------------------------------------------------------------------------
  {
    id: 'session-unknown-event-tolerance',
    group: 'runtime',
    order: 401,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: SESSION_PERSISTENCE_CORE_PKG_REL,
    transform: transformSessionUnknownEventTolerance,
    marker: SESSION_UNKNOWN_EVENT_TOLERANCE_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: '未知事件容忍补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已把未知 session 事件从拒载改为跳过+告警 ' + file,
      failLog: (file, err) => '未知事件容忍补丁失败(' + file + '): ' + err.message,
    },
  },
  // -------------------------------------------------------------------------
  // 0.6.4 在野缺陷（现场诊断：一台机器 54 会话 19 个读不回）：frozen released-v0
  // 编解码器冻结了第一方 v0 构建当时的载荷成员清单，清单外一律整条拒载。三类实测：
  // compaction/summary 的第三方块账本字段（billion-context-dsh/acp-kernel 写的
  // tier、kernelBlockId、parentBlockIds、directMessageIds、effectiveMessageIds）、
  // permission/preset.origin、subagent/descriptor 的 version:2。
  // 修法是**只扩准入清单、成员原样保留到 v3**（剥离会丢插件语义），必填/类型/形状
  // 校验一律不放宽；描述符仅盖章版本后继续走原有严格校验。cli:false（同族容忍补丁）。
  // -------------------------------------------------------------------------
  {
    id: 'released-v0-history-recovery',
    group: 'runtime',
    order: 402,
    kind: 'file',
    layout: 'runtime-local',
    wslLayout: 'wsl',
    pkgRel: SESSION_FORMAT_V0_TO_V1_PKG_REL,
    transform: transformReleasedV0KeysTolerance,
    marker: RELEASED_V0_HISTORY_MARKER,
    requires: [],
    failPolicy: 'warn',
    cli: false,
    logs: {
      prefix: 'released-v0 历史恢复补丁',
      alreadyLog: alreadySkip,
      doneLog: (file) => '已扩 released-v0 准入清单（块账本/origin/描述符 v2 盖章），成员原样保留 ' + file,
      failLog: (file, err) => 'released-v0 历史恢复补丁失败(' + file + '): ' + err.message,
    },
  },
];

/**
 * 按分组查询补丁清单（无 group 参数返回全部，按 order 升序）。
 * @param {string} [group]
 * @returns {Array<Object>}
 */
function getSpecsByGroup(group) {
  const specs = group ? PATCH_SPECS.filter((s) => s.group === group) : PATCH_SPECS.slice();
  return specs.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * 查询 CLI 同步期（sync-companion-plugins.js --with-patches）需要应用的补丁清单：
 * 仅返回 cli === true 的 spec，按 order 升序。
 * @returns {Array<Object>}
 */
function getSpecsByCli() {
  return PATCH_SPECS.filter((s) => s.cli === true)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

module.exports = { PATCH_SPECS, getSpecsByGroup, getSpecsByCli };
