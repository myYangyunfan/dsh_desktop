'use strict';

// pi-ai 手声明路由思考档位默认补丁（F4：v0.5.3「第三方思考强度不生效」根治）。
//
// 问题链（2026-08-23 定案，三环相互独立、都命中用户「不生效」描述）：
//
//   1) 设置页「添加自定义供应商」（CustomProviderCard）写 llm-pi-ai profile
//      时模型条目只有 id/name/contextWindow/maxTokens，**从不写 reasoningEfforts
//      字典**（UI 无该控件，「There is deliberately no reasoning-effort
//      control」是上游有意设计——档位是逐模型能力，provider 级控件没法取值）。
//
//   2) dsh-llm-pi-ai 的 resolveModelReasoning（lib/index.js）对未声明字典的
//      条目回落 `base?.reasoning ?? false`——「继承内置 catalog 同 id 条目」。
//      手声明路由在内置 catalog 里没有条目（base === undefined）→ 恒
//      reasoning:false → reasoningInfo 返回 {} → 思考强度控件永不出现；
//      显式配置档位则 resolveReasoningLevel 抛 UNSUPPORTED_REASONING_EFFORT。
//      即：自定义供应商的思考强度在 pi-ai 原生链路上从未可用过。
//
//   3) v0.5.3 的 VB3 把 PiAiAdapter 整类豁免出 dsh-third-party-thinking 插件
//      （豁免本身正确——插件注入的假档位会被 pi-ai 原生校验拒绝），第三方
//      插件这条旁路也断了 → 用户侧「第三方思考强度不生效」。
//
// 修复（本补丁，宿主侧单一改动）：手声明条目（无 base）在未声明
// reasoningEfforts 时回落**完整 DSH 档位字典**而非 false（off 缺席 = 不发字段）：
//   { minimal: "minimal", low: "low", medium: "medium", high: "high",
//     xhigh: "xhigh", max: "max" }
// 「继承」语义在手声明条目上本就空转（无基条目可继承），改为默认字典后：
//   - 思考强度控件开箱即用（pi-ai 原生 metadata 链：reasoningInfo → 控件）；
//   - wire 映射走 pi-ai 原生 thinkingLevelMap（VB3 已逐协议核实）：三个可手
//     声明协议 openai-completions（reasoning_effort）/ openai-responses
//     （reasoning.effort）/ anthropic-messages（adaptive effort / budget）对
//     同名拼写都有原生消费；
//   - 未选档位时 defaultEffort 缺席 → 不向 wire 发任何字段，严格校验请求体
//     的第三方网关（百炼等）不受影响——与插件 enabled 默认 false 同一保守面；
//   - catalog 路由（openai/anthropic/…）与已显式声明字典的条目不受影响
//     （base 存在走继承、字典存在走声明路径，均维持上游语义）。
//
// 幂等 / 容错契约对齐 scripts/lib 既有补丁：marker 短路 already、锚点失配
// 不改写、异常逐根吸收。上游若把手声明默认收进 resolveModelReasoning，本补丁
// 经 anchor-missing 自然退役。
//
// 用法：
//   node scripts/patch-pi-ai-reasoning-defaults.js [<node_modules 根目录>]
// 同时导出 patchPiAiReasoningDefaults(nmRoot, log, stats, options) 供
// patch-registry（桌面壳启动 / CLI 同步）与 patch-deps（postinstall dev
// node_modules）复用。

const fs = require('node:fs');
const path = require('node:path');
// 原子写与 main.js / 其它补丁脚本共用同一实现（scripts/lib/patch-io.js）。
const { writeFileAtomic } = require('./lib/patch-io');

/** 目标文件（相对 node_modules 根）。 */
const TARGET_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

/** 幂等 marker（产物注释 + 单测同源）。 */
const MARKER = 'dsh-desktop patch (hand-declared reasoning defaults)';

/**
 * 锚点：resolveModelReasoning 的未声明分支（上游 tab 缩进）。
 * 该行在文件内唯一（grep 证实），替换后仍保留原语义的 base 存在分支。
 */
const ANCHOR = '\tif (efforts === void 0) return { reasoning: base?.reasoning ?? false };';

/** 旧版档位字典（v0.5.3 起注入的低/中/高）——已打补丁的文件升级时就地替换。 */
const OLD_MAP = 'thinkingLevelMap: { low: "low", medium: "medium", high: "high" }';
/** 新完整档位字典：手声明条目默认覆盖全 7 档（off 缺席 = 「不发字段」）。 */
const NEW_MAP = 'thinkingLevelMap: { minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }';

/** 注入体（tab 缩进与上游一致；off 缺席 = 「不发字段」的规范 map 形态）。 */
const REPLACEMENT = [
  '\tif (efforts === void 0) {',
  '\t\t// ' + MARKER + ': 手声明条目（无内置 catalog 基条目）默认思考档位。',
  '\t\t// 上游「未声明 = 继承 catalog 同 id 条目」在手声明条目上空转（无 base →',
  '\t\t// reasoning:false），思考强度控件永不出现且显式档位报',
  '\t\t// UNSUPPORTED_REASONING_EFFORT。回落完整 7 档字典（off 缺席 = 不发字段）：',
  '\t\t// minimal/low/medium/high/xhigh/max 全档可调，wire 取同名拼写——与上游',
  '\t\t// openai 路由 thinkingLevelMap[level] ?? level 的同名回落语义一致，',
  '\t\t// anthropic 路由 mapThinkingLevelToEffort 逐档映射。第三方网关对自身不',
  '\t\t// 支持的档位会按端点文档拒绝，选择权交给用户，本补丁不替用户猜档位。',
  '\t\t// catalog 基条目存在时维持上游继承语义（下方 return）。',
  '\t\tif (base === void 0) return {',
  '\t\t\treasoning: true,',
  '\t\t\t' + NEW_MAP,
  '\t\t};',
  '\t\treturn { reasoning: base?.reasoning ?? false };',
  '\t}',
].join('\n');

/**
 * transform：手声明条目思考档位默认（幂等、锚点失配不改写）。
 * @param {string} src
 * @param {string} [file] 诊断用文件名（anchor-missing 的 detail 含之）
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformReasoningDefaults(src, file) {
  if (src.includes(MARKER)) {
    // 已打补丁：新版字典在位则幂等；旧版（仅 low/medium/high）就地升级为新
    // 完整字典——否则已装包用户（payload 镜像了 dev node_modules）会因 marker
    // 短路而永远停留在旧档位。旧版字典被替换为带 xhigh/max 的新字典后，
    // getSupportedThinkingLevels 才会把 xhigh/max 计入可选档。
    if (src.includes(NEW_MAP)) return { status: 'already' };
    if (src.includes(OLD_MAP)) {
      return { status: 'changed', src: src.split(OLD_MAP).join(NEW_MAP) };
    }
    return { status: 'already' }; // marker 在但字典形态不可识别，保守不改写
  }
  if (!src.includes(ANCHOR)) {
    return {
      status: 'anchor-missing',
      detail: '未找到 resolveModelReasoning 未声明分支锚点（版本可能已变更），跳过 ' + (file || '<unknown>'),
    };
  }
  return { status: 'changed', src: src.replace(ANCHOR, REPLACEMENT) };
}

/**
 * 对某个 node_modules 根目录应用 pi-ai 思考档位默认补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats] 可选计数器（与
 *   patch-runner 的 patchReport 口径对齐：锚点失配 / 读写失败各计一次）。
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchPiAiReasoningDefaults(nmRoot, log = () => {}, stats, options) {
  const file = path.join(nmRoot, TARGET_REL);
  if (!fs.existsSync(file)) return 0; // 该根未装 dsh-llm-pi-ai（如 UI 副本），静默跳过
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai 思考档位默认补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformReasoningDefaults(src, file);
  if (result.status === 'already') {
    log('pi-ai 思考档位默认补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai 思考档位默认补丁: 锚点未匹配（pi-ai 版本可能已变化），跳过 ' + file);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    if (options && options.dryRun) {
      log('pi-ai 思考档位默认补丁: dry-run: 将注入手声明条目默认档位 ' + file);
    } else {
      writeFileAtomic(file, result.src);
      log('pi-ai 思考档位默认补丁: 已注入手声明条目默认档位 ' + file);
      return 1;
    }
  } catch (err) {
    log('pi-ai 思考档位默认补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchPiAiReasoningDefaults, transformReasoningDefaults, MARKER, TARGET_REL, ANCHOR, OLD_MAP, NEW_MAP };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAiReasoningDefaults(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
