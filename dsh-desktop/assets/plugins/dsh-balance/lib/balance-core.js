'use strict';

// ===========================================================================
// balance-core.js —— DeepSeek 账户余额 / OpenCode Go 用量数据层（插件宿主半边）
//
// 自 dsh-desktop/balance.js（自制壳时代的主进程数据层）近乎逐字移植，保留其
// 全部安全边界与定价口径；三处宿主替换见文件末「宿主适配」段：
//   1. 密钥：ctx.credentials 优先，.credentials.yaml 顶层键解析器兜底；
//   2. 默认模型：ctx.agentDefaultModel / ctx.settings 优先，settings.yaml
//      抓取器兜底（readActiveModel 仍导出，供无服务场景与单测）；
//   3. 余额：官方账号平台钱包（ctx.deepseekAccount）优先，API Key 端点兜底，
//      两源共用同一 balances 形态（契约见 ../../docs/balance-architecture.md §2）。
//
// 本模块只做「取数 + 规整」，不做编排（节流/重试/推送在 balance-scheduler.js）。
// 所有对外函数返回字段集合跨路径一致的结构化对象。
// ===========================================================================

import * as https from 'node:https';
import * as http from 'node:http';
import * as tls from 'node:tls';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// 配置常量（网络边界参数全部收口在此，测试可经 fetchJson options 覆盖）
// ---------------------------------------------------------------------------

const DEFAULT_BASE = 'https://api.deepseek.com';
const DEFAULT_OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

const FETCH_DEFAULT_TIMEOUT_MS = 15000; // 总超时（自请求发出起算，跨重定向共享 deadline）
const FETCH_MAX_REDIRECTS = 5;          // 重定向上限（超出拒绝）
const FETCH_MAX_BODY_BYTES = 1024 * 1024; // 响应体上限（按字节计，非字符）

const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// 配置文件 mtime 缓存：每轮轮询都会读 .credentials.yaml / settings.yaml，
// 窗口隐藏或最小化时无意义读盘；mtime+size 未变直接复用上次内容，
// 「改凭证后下轮生效」= mtime 变化触发重读。
// ---------------------------------------------------------------------------
const fileTextCache = new Map(); // path -> { mtimeMs, size, text }

export function readFileCached(p) {
  try {
    const st = fs.statSync(p);
    const hit = fileTextCache.get(p);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
    const text = fs.readFileSync(p, 'utf8');
    fileTextCache.set(p, { mtimeMs: st.mtimeMs, size: st.size, text });
    return text;
  } catch {
    fileTextCache.delete(p);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 模型价格（¥/百万 token）。官方定价：
// https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
//
// 2026-08-17 00:00（北京时间）起采用「峰谷定价」：高峰时段
// （北京时间 9:00-12:00、14:00-18:00）为全价，空闲时段为高峰的一半。
// 字段：{ cacheMiss 输入未命中, cacheHit 输入命中, output 输出 }。
// ---------------------------------------------------------------------------

// 高峰全价（2026-08-17 起生效）。flash 档取官方价目表「高峰时段」列
// （输入命中 0.04 / 未命中 2 / 输出 8）；此前 3/0.1/9 是按 pro÷3 推导的，
// 命中价高估 2.5 倍。
export const PEAK_PRICES = {
  // 内核真实模型 id（dsh-llm-deepseek 的 DEFAULT_MODELS 下发）——曾因缺此键，
  // 查表未命中静默落回 pro 档（命中价 0.3 为官方的 7.5 倍），是「命中缓存算错」
  // 的主因；回归锁见 unit-balance-pricing-key.test.js。
  'deepseek-flash': { cacheMiss: 2, cacheHit: 0.04, output: 8 },
  'deepseek-v4-flash': { cacheMiss: 2, cacheHit: 0.04, output: 8 },
  'deepseek-v4-pro': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
  // 旧模型名别名：deepseek-chat 对应 flash 档，deepseek-reasoner 对应 pro 档。
  'deepseek-chat': { cacheMiss: 2, cacheHit: 0.04, output: 8 },
  'deepseek-reasoner': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
};

// 2026-08-17 前的旧版固定价（历史结算参考）。
export const LEGACY_PRICES = {
  'deepseek-flash': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
  'deepseek-chat': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-reasoner': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
};

// 价目表内的全部模型名（内核真实 id + 别名都在内）。priceTable() 逐名取值，
// 客户端按会话实际模型选档。
export const PRICING_MODELS = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'];

// 峰谷定价生效节点：2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC。
export const PEAK_PRICING_SINCE_UTC = Date.UTC(2026, 7, 16, 16, 0, 0);

// 周末全天空闲规则生效节点：2026-08-23 00:00 北京时间 = 2026-08-22 16:00 UTC。
// 官方 2026-08-23 起周六/周日全天按空闲价计（issue #158 / #168）；此前周末
// 沿用工作日窗口，故该规则不得溯及既往——门槛之前的周末仍按旧窗口返回高峰。
// 口径对齐来源：assets/plugins/dsh-offpeak/src/index.js 的
//   WEEKEND_OFFPEAK_EFFECTIVE_FROM 与 isPeak()（北京时间日历日字符串比较）。
// 本模块用固定 +8 偏移（无夏令时），与之一一等价；两处若有调整须同步修改。
export const WEEKEND_OFFPEAK_SINCE_UTC = Date.UTC(2026, 7, 22, 16, 0, 0);

// 模型缺失 / 未知时的兜底档（与价目表回退一致，避免少报费用）。
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// 计价档位（issue #168）：客户端增量账本按「消耗时刻所属档位」入账，
// 档位名即 periodTables 的键。
//   'legacy' —— 峰谷定价生效前的旧版固定价期；
//   'peak'   —— 峰谷期内高峰窗口（全价）；
//   'off'    —— 峰谷期内空闲时段（半价，含 2026-08-23 起的周末全天）。
export const PRICING_TIERS = ['legacy', 'peak', 'off'];

// ---------------------------------------------------------------------------
// 纯函数工具
// ---------------------------------------------------------------------------

/** 正则转义（readCredentialLine 动态拼键名用）。 */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 .credentials.yaml 读取「顶层引用键」的值（`KEY: value`，值可带引号）。
 * 兼容两种布局（dsh-credentials-local 的迁移语义）：
 *   · 旧平铺（pre-release）：`KEY: value` 列 0；
 *   · v1 嵌套：`version: 1` + 原行原样缩进两格进 `refs:`（records: 段的键
 *     形如 `provider/id` 含 `/`，与 POSIX 标识符键名不可能同名，
 *     故两格缩进匹配不会误读 records 值）。
 * 安全约束：只匹配列 0 或恰好两格缩进的键——更深嵌套段下的同名键一律不读。
 * 仅在 ctx.credentials 缺席时作为兜底路径使用。
 */
export function readCredentialLine(dshHome, keyName) {
  try {
    const text = readFileCached(path.join(dshHome, '.credentials.yaml'));
    if (text === null) return '';
    // (?:^|  ) 双形态：列 0（旧平铺）或两格缩进（v1 refs: 下）。
    const keyPattern = new RegExp('^(?:("?)' + escapeRegExp(keyName) + '\\1\\s*:\\s*(.*)$|  ("?)' + escapeRegExp(keyName) + '\\3\\s*:\\s*(.*)$)');
    for (const line of text.split(/\r?\n/)) {
      const m = keyPattern.exec(line);
      if (!m) continue;
      const raw = m[2] !== undefined ? m[2] : m[4];
      const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(raw) || /^'([^']*)'/.exec(raw);
      let value;
      if (quoted) {
        value = quoted[1];
      } else {
        // 无引号标量：` #` 起视为注释（键值本身不含空格的常规形态）。
        value = raw.split(/\s+#/)[0].trim();
      }
      if (value) return value;
    }
  } catch {}
  return '';
}

/** 当前 OpenCode Go 用量端点（支持 OPENCODE_USAGE_URL 覆盖，代理/镜像场景必走该口）。 */
export function opencodeUsageEndpoint() {
  return process.env.OPENCODE_USAGE_URL || DEFAULT_OPENCODE_USAGE_URL;
}

/** 引用键名语法（与 dsh-credentials 的 CredentialRef 文法一致）；不合文法的名字必然无可解析值。 */
export function isCredentialRefName(value) {
  return typeof value === 'string' && CREDENTIAL_REF_PATTERN.test(value);
}

/**
 * 经 ctx.credentials 解析一个引用键的当前值（密钥只在此处离开服务、进入局部
 * 变量，绝不写日志）。服务缺席 / 名字不合法 / 解析抛错一律回空串，
 * 由调用方走 .credentials.yaml 兜底路径。
 */
export async function resolveCredentialValue(credentials, name) {
  if (!credentials || typeof credentials.resolve !== 'function') return '';
  if (!isCredentialRefName(name)) return '';
  try {
    const resolved = await credentials.resolve(name);
    if (!resolved || typeof resolved !== 'object') return '';
    const value = typeof resolved.value === 'string' ? resolved.value.trim() : '';
    return value;
  } catch {
    return '';
  }
}

/** OpenCode Go 用量键：环境变量 → ctx.credentials → .credentials.yaml → OpenCode CLI auth.json。 */
export async function readOpencodeGoKey(dshHome, credentials = null) {
  const envKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY;
  if (envKey) return envKey.trim();
  if (credentials) {
    const viaService = await resolveCredentialValue(credentials, 'OPENCODE_GO_API_KEY');
    if (viaService) return viaService;
  }
  const fromCreds = readCredentialLine(dshHome, 'OPENCODE_GO_API_KEY');
  if (fromCreds) return fromCreds;
  // OpenCode CLI auth.json 兜底（macOS/Linux 默认位置；Windows 相同相对位置存在时也读）。
  try {
    const authPath = path.join(homedir(), '.local', 'share', 'opencode', 'auth.json');
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const entry = raw['opencode-go'] ?? raw['opencode'];
    if (entry && entry.type === 'api' && typeof entry.key === 'string' && entry.key.length > 0) return entry.key;
  } catch {}
  return '';
}

/**
 * 用量窗口规整：percent 缺省（null/undefined）保持 null，绝不把 null 折算成 0
 * （Number(null)=0 会让「未知」显示成「0%」）。
 * percent 非有限值同样归 null；status/resetsAt 只接受字符串，其余归 null。
 */
export function pickUsageWindow(w) {
  if (!w || typeof w !== 'object') return null;
  const percent = w.percent == null ? NaN : Number(w.percent);
  return {
    status: typeof w.status === 'string' ? w.status : null,
    percent: Number.isFinite(percent) ? percent : null,
    resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
  };
}

// 返回 { ok, reason?, error?, usage?: { rolling, weekly, monthly }, warning? }
export async function queryOpencodeUsage(dshHome, deps = {}) {
  const key = deps.readKey
    ? String(await deps.readKey(dshHome) || '').trim()
    : await readOpencodeGoKey(dshHome, deps.credentials || null);
  if (!key) return { ok: false, reason: 'no-key' };
  const endpoint = opencodeUsageEndpoint();
  const warnings = [];
  try {
    const data = await fetchJson(endpoint, key, {
      onAuthStripped: (target) => warnings.push('重定向到非可信目标已剥离 Authorization（' + target + '）'),
    });
    if (/^http:/i.test(endpoint)) {
      warnings.push('OpenCode Go 端点使用 http://，密钥明文传输（仅建议本地代理）');
    }
    const usage = data && typeof data === 'object' && data.usage ? data.usage : data;
    if (!usage || typeof usage !== 'object') return withWarning({ ok: false, reason: 'bad-response' }, warnings);
    return withWarning({
      ok: true,
      usage: {
        rolling: pickUsageWindow(usage.rolling),
        weekly: pickUsageWindow(usage.weekly),
        monthly: pickUsageWindow(usage.monthly),
      },
    }, warnings);
  } catch (err) {
    return withWarning({ ok: false, error: String((err && err.message) || err) }, warnings);
  }
}

/**
 * 当前（或指定时刻）是否处于高峰时段（北京时间工作日 9:00-12:00、14:00-18:00）。
 * 契约：
 *   · 峰谷定价生效之前一律 false——旧版期没有峰谷概念，避免「chip 显示高峰价、
 *     实际按旧版固定价计」的自相矛盾；
 *   · 2026-08-23 起周六/周日全天按空闲价（返回 false），该规则不溯及既往。
 * 无效日期返回 false（宁可显示空闲，不可显示错误的高峰态）。
 */
export function isPeakHour(date) {
  const d = date ? new Date(date) : new Date();
  if (!Number.isFinite(d.getTime())) return false;
  if (d.getTime() < PEAK_PRICING_SINCE_UTC) return false;
  // 平移到北京时区（固定 +8，无夏令时），用 UTC 分量读北京日历字段。
  const shifted = new Date(d.getTime() + 8 * 3600 * 1000);
  if (d.getTime() >= WEEKEND_OFFPEAK_SINCE_UTC) {
    const day = shifted.getUTCDay(); // 0=周日 6=周六
    if (day === 0 || day === 6) return false;
  }
  const hour = shifted.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/**
 * 指定时刻的计价档位：'legacy' | 'peak' | 'off'。
 * 与 effectivePrice()/isPeakHour() 共用同一套门槛，保证「档位 ↔ 价目」不矛盾：
 *   periodTables()[pricingTier(t)] 恒等于 priceTable(t)（未叠加用户覆盖时）。
 * 无效日期按当前时刻求值（与 isPeakHour 的保守取向不同，此处取「不崩」即可）。
 */
export function pricingTier(date) {
  const d = date ? new Date(date) : new Date();
  const t = Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
  if (t < PEAK_PRICING_SINCE_UTC) return 'legacy';
  return isPeakHour(new Date(t)) ? 'peak' : 'off';
}

/**
 * 三张固定价目表（peak / off / legacy，全模型），与「现在」无关。
 * 客户端增量账本据此把每个用量增量按消耗时刻档位选表计价，峰谷切换时
 * 不再重算历史（issue #168）。每次调用返回全新对象，调用方可安全叠加覆盖。
 */
export function periodTables() {
  const dayAt = (hour) => new Date(Date.UTC(2026, 7, 17, hour, 0, 0) - 8 * 3600 * 1000);
  // 取一个峰谷期内的高峰时刻与空闲时刻，复用 effectivePrice 的换算逻辑，
  // 避免在这里重复 /2 的算术（防止两处口径漂移）。
  // 2026-08-17 是周一：北京 10:00 为高峰，北京 13:00 为空闲。
  const peakTable = priceTable(dayAt(10));
  const offTable = priceTable(dayAt(13));
  const legacyTable = priceTable(new Date(PEAK_PRICING_SINCE_UTC - 1000));
  return { peak: peakTable, off: offTable, legacy: legacyTable };
}

/**
 * 定价规则生效节点（ISO 串），供客户端/展示层说明「何时开始按峰谷计价」。
 * 门槛常量只此一处定义，客户端不再硬编码日期。
 */
export function pricingSince() {
  return {
    peakPricing: new Date(PEAK_PRICING_SINCE_UTC).toISOString(),
    weekendOffpeak: new Date(WEEKEND_OFFPEAK_SINCE_UTC).toISOString(),
  };
}

/**
 * 模型名 → 价目表规范键。
 *
 * 官方与聚合渠道常下发带日期/版本后缀的变体名（`deepseek-v4-pro-0813`、
 * `deepseek-v4-flash-250610`、`deepseek-chat-V3` 等），而价目表只有 4 个规范键。
 * 精确查表未命中会落回 DEFAULT_MODEL（pro），实测让 flash 变体按 pro 计价
 * （空闲档 4.5/0.15/13.5 对应有的 1.5/0.05/4.5 → **高估 3 倍**），即「本轮费用
 * 算错」的根因。解析顺序：精确命中 → 剥掉尾随日期/版本段 → 最长前缀命中 →
 * 原值（保持未知模型的老行为）。
 */
export function pricingKeyOf(model) {
  const raw = String(model || '').trim();
  if (!raw) return DEFAULT_MODEL;
  if (PRICING_MODELS.includes(raw)) return raw;
  const stripped = raw.replace(/-(?:\d{8}|\d{6}|\d{4}-\d{2}-\d{2}|v\d+(?:\.\d+)*)$/i, '');
  if (stripped && PRICING_MODELS.includes(stripped)) return stripped;
  const lower = raw.toLowerCase();
  let best = '';
  for (const m of PRICING_MODELS) {
    if (lower.startsWith(m.toLowerCase() + '-') && m.length > best.length) best = m;
  }
  return best || raw;
}

/**
 * 某模型在指定时刻的「有效单价」（已含旧版→峰谷切换与高峰/低谷换算）。
 * 模型名为空或未知时按 deepseek-v4-pro 兜底（保守档，避免少报费用），
 * 旧版期与峰谷期统一回退到 v4-pro 对应档位，杜绝两时期回退档位不一致造成
 * 的费用估算跳变。返回全新对象（可安全展开赋值）。
 */
export function effectivePrice(model, date) {
  const key = pricingKeyOf(model) || DEFAULT_MODEL;
  const now = date ? new Date(date) : new Date();
  if (now.getTime() < PEAK_PRICING_SINCE_UTC) {
    return { ...(LEGACY_PRICES[key] || LEGACY_PRICES[DEFAULT_MODEL]) };
  }
  const peak = PEAK_PRICES[key] || PEAK_PRICES[DEFAULT_MODEL];
  if (isPeakHour(now)) return { ...peak };
  return {
    cacheMiss: peak.cacheMiss / 2,
    cacheHit: peak.cacheHit / 2,
    output: peak.output / 2,
  };
}

/**
 * 指定时刻的全模型价目表（客户端按会话实际模型选档用）。
 * 所有条目由同一时刻求值，保证峰谷一致性。
 */
export function priceTable(date) {
  const out = {};
  for (const model of PRICING_MODELS) out[model] = effectivePrice(model, date);
  return out;
}

/** API Key（兜底路径）：环境变量 DEEPSEEK_API_KEY > DSH_HOME/.credentials.yaml。 */
export function readApiKey(dshHome) {
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey) return envKey.trim();
  return readCredentialLine(dshHome, 'DEEPSEEK_API_KEY');
}

/**
 * API Key（首选路径）：ctx.credentials 优先（dsh-credentials-local 已把
 * 「继承环境 > .credentials.yaml > .env」三层收在同一个 resolve 里），
 * 服务不可用时退回 readApiKey 的自建解析。
 * 无论哪条路径，取到的值只在局部变量里存活，绝不入日志。
 */
export async function resolveApiKey(dshHome, credentials = null) {
  const viaService = await resolveCredentialValue(credentials, 'DEEPSEEK_API_KEY');
  return viaService || readApiKey(dshHome);
}

/**
 * 当前默认模型（~/.dsh/settings.yaml 的 agent-default-model.model）。
 * 决定按哪一档价格估算本轮费用。宿主有 ctx.agentDefaultModel / ctx.settings 时
 * 由 index.js 优先走服务，本函数仅作无服务场景的兜底。
 * 锚定规则（逐行状态机，杜绝正则吞相邻段）：
 *   1. 只认「行首 agent-default-model 后紧跟冒号」的顶层段（agent-default-model-xxx 不算）；
 *   2. 段内取缩进最浅的 `model:` 行——嵌套更深段下的同名键不优先；
 *   3. 无缩进的下一行结束该段。
 * 文件读取走 readFileCached（mtime+size 复用），最小化场景不读盘。
 */
export function readActiveModel(dshHome) {
  try {
    const text = readFileCached(path.join(dshHome, 'settings.yaml'));
    if (text === null) return '';
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^agent-default-model\s*:/.test(lines[i])) continue;
      let best = null; // { indent, value } —— 取缩进最浅者
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
        if (!/^[ \t]/.test(line)) break; // 回到顶层 → 段结束
        const m = /^([ \t]*)model\s*:\s*['"]?([^\s'"#]+)/.exec(line);
        if (!m) continue;
        const indent = m[1].length;
        if (best === null || indent < best.indent) best = { indent, value: m[2] };
      }
      return best ? best.value : '';
    }
  } catch {}
  return '';
}

export function balanceEndpoint() {
  if (process.env.DEEPSEEK_BALANCE_URL) return process.env.DEEPSEEK_BALANCE_URL;
  const base = (process.env.DEEPSEEK_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  return base + '/user/balance';
}

/**
 * 金额解析（余额字段）：
 *   · 千分位逗号 / 全半角空格 / 常见货币符号（¥ ￥ $ € £）剥离后再 Number()；
 *   · 负数按业务钳为 0（余额不可能为负，展示侧不出现「-¥」）；
 *   · 空值 / 非有限 → null（调用方决定降级策略，绝不静默变成 0 掩盖脏数据）。
 * @returns {number|null}
 */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : null;
  const cleaned = String(value).replace(/[,\s￥¥$€£]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

// ---------------------------------------------------------------------------
// 代理支持（DEEPSEEK_BALANCE_URL / DEEPSEEK_API_BASE 覆盖保留）：
//   https URL → HTTPS_PROXY/https_proxy 的 CONNECT 隧道（tls 包装）
//   http  URL → HTTP_PROXY/http_proxy 的 absolute-form GET
//   NO_PROXY/no_proxy 命中（精确主机或域名后缀，* 全放行）→ 直连
// ---------------------------------------------------------------------------

/** 纯函数：为 URL 选择代理 URL（无代理/NO_PROXY 命中/非法 → null）。 */
export function proxyFor(url) {
  const env = process.env;
  const isHttps = url.startsWith('https:');
  const raw = isHttps ? (env.HTTPS_PROXY || env.https_proxy) : (env.HTTP_PROXY || env.http_proxy);
  if (!raw) return null;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const noProxy = env.NO_PROXY || env.no_proxy;
  if (noProxy) {
    for (const part of String(noProxy).split(',')) {
      const p = part.trim().toLowerCase();
      if (!p) continue;
      if (p === '*' || host === p || host.endsWith('.' + p.replace(/^\./, ''))) return null;
    }
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch { return null; }
}

/** https.Agent 子类：经代理 CONNECT 隧道建连，再做 TLS 包装（无第三方依赖）。 */
export class ConnectProxyAgent extends https.Agent {
  constructor(proxy) {
    super({ keepAlive: false });
    this.proxy = proxy;
  }
  createConnection(options, callback) {
    const host = options.host || 'localhost';
    const port = options.port || 443;
    const proxy = this.proxy;
    const proxyPort = proxy.port || (proxy.protocol === 'https:' ? 443 : 80);
    const headers = {};
    if (proxy.username) {
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(
        decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')
      ).toString('base64');
    }
    // https:// 代理需要先对代理自身建立 TLS（两层隧道），否则明文 CONNECT
    // 发给 TLS 端口会被代理拒绝；http:// 代理则明文直连。
    const proxyClient = proxy.protocol === 'https:' ? https : http;
    const proxyReq = proxyClient.request({
      host: proxy.hostname,
      port: proxyPort,
      method: 'CONNECT',
      path: host + ':' + port,
      headers,
    });
    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        callback(new Error('代理 CONNECT 失败: HTTP ' + res.statusCode));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: host, host, port }, () => callback(null, tlsSocket));
      tlsSocket.on('error', (err) => callback(err));
    });
    proxyReq.on('error', (err) => callback(err));
    proxyReq.end();
  }
}

// ---------------------------------------------------------------------------
// HTTP 边界：fetchJson
//
// 安全/健壮性契约：
//   · 重定向跟随：Authorization 只保留在「同主机 且 全程 https」的跳转上；
//     跨主机或 https→http 降级一律剥离（密钥 = 计费凭证，绝不发往非预期主机）。
//   · 超时：总超时（Promise deadline，跨重定向共享剩余时间）+ socket 空闲
//     超时双保险；slow-drip 服务器无法靠空闲超时保活绕过总时限。
//   · 体积上限：按字节累计（Buffer.length），多字节内容不会绕过 1MB 限制。
//   · 失败路径结构化：HTTP 状态码 / 超时 / 体积超限 / JSON 失败均有独立消息。
// ---------------------------------------------------------------------------

/**
 * 判断一次重定向是否允许携带 Authorization。
 * 规则（与安全契约一致）：仅同主机（host 相等）且源/目标均为 https 时保留。
 * @param {string} originUrl 最初请求的 URL（信任锚点）
 * @param {string} targetUrl 重定向目标
 * @param {string} apiKey 密钥（空串 → null）
 * @returns {string|null} 'Bearer xxx' 或 null
 */
export function redirectAuthorization(originUrl, targetUrl, apiKey) {
  if (!apiKey) return null;
  let origin;
  let target;
  try {
    origin = new URL(originUrl);
    target = new URL(targetUrl);
  } catch {
    return null; // URL 解析失败 → 宁可不携带
  }
  // hostname + port 比较（URL.port 对默认端口归一化为空串）：
  // 「同主机」= 主机名相同且端口相同（默认端口 443/80 与省略端口视为一致），
  // 避免把显式默认端口误判为跨主机而误剥密钥。
  const sameHost = origin.hostname === target.hostname && origin.port === target.port;
  const staysHttps = origin.protocol === 'https:' && target.protocol === 'https:';
  return sameHost && staysHttps ? 'Bearer ' + apiKey : null;
}

/**
 * GET JSON（安全边界封装）。跟随 ≤maxRedirects 次重定向；相对 Location
 * 以当前 URL 为基解析。
 * @param {string} url
 * @param {string} apiKey 为空时不带 Authorization
 * @param {object} [options]
 *   timeoutMs     总超时（默认 15000，跨重定向共享 deadline）
 *   maxRedirects  重定向上限（默认 5）
 *   maxBodyBytes  响应体字节上限（默认 1MB）
 *   onAuthStripped(targetUrl) 重定向剥离 Authorization 时的回调（可空）
 * @returns {Promise<any>} 解析后的 JSON
 */
export function fetchJson(url, apiKey, options = {}) {
  const timeoutMs = options.timeoutMs || FETCH_DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? FETCH_MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes || FETCH_MAX_BODY_BYTES;
  const redirects = options.redirects || 0;
  const originUrl = options.originUrl || url;
  const deadline = options.deadline || (Date.now() + timeoutMs);

  return new Promise((resolve, reject) => {
    if (redirects > maxRedirects) {
      reject(new Error('重定向次数过多'));
      return;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error('请求超时（总时长 ' + timeoutMs + 'ms）'));
      return;
    }
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    // 协议选择：DEEPSEEK_BALANCE_URL / DEEPSEEK_API_BASE 可指向本地 http
    // 代理/镜像（README 承诺的代理场景，issue #78）。http 端点会由调用方
    // 附 warning 提示密钥明文传输。
    const lib = url.startsWith('https:') ? https : http;
    const headers = { 'User-Agent': 'DSH-Pack' };
    // 首跳 = 调用方显式配置的端点：始终携带密钥（http 代理场景依赖此行为）。
    // 重定向后续跳才受安全规则约束（跨主机 / 降级剥离，见 redirectAuthorization）。
    const authorization = redirects === 0
      ? (apiKey ? 'Bearer ' + apiKey : null)
      : redirectAuthorization(originUrl, url, apiKey);
    if (authorization) headers.Authorization = authorization;
    else if (apiKey && redirects > 0 && typeof options.onAuthStripped === 'function') options.onAuthStripped(url);

    let totalTimer = null;
    const fail = (err) => {
      if (totalTimer) clearTimeout(totalTimer);
      settle(reject, err);
    };

    const onResponse = (res) => {
      // 跟随 3xx 重定向（CDN 常见）；下一跳共享同一 deadline（总超时）。
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (totalTimer) clearTimeout(totalTimer);
        req.setTimeout(0); // 清理本跳 socket 空闲定时器，避免误 destroy 可能被复用的 socket
        let next;
        try {
          next = new URL(res.headers.location, url).toString();
        } catch {
          return fail(new Error('重定向地址无效'));
        }
        return fetchJson(next, apiKey, {
          timeoutMs,
          maxRedirects,
          maxBodyBytes,
          redirects: redirects + 1,
          originUrl,
          deadline,
          onAuthStripped: options.onAuthStripped,
        }).then((v) => settle(resolve, v), fail);
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > maxBodyBytes) {
          fail(new Error('响应过大'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) return;
        if (totalTimer) clearTimeout(totalTimer);
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const hint = body.slice(0, 200).trim();
          return settle(reject, new Error('HTTP ' + res.statusCode + (hint ? '：' + hint : '')));
        }
        try {
          settle(resolve, JSON.parse(body));
        } catch {
          settle(reject, new Error('JSON 解析失败'));
        }
      });
    };

    // 代理分派：proxyFor 命中时 https 走 CONNECT 隧道 agent，
    // http 走手动 absolute-form（node http 模块不读环境代理）。
    const proxy = proxyFor(url);
    let req;
    if (proxy && url.startsWith('https:')) {
      req = lib.get(url, { headers, agent: new ConnectProxyAgent(proxy) }, onResponse);
    } else if (proxy) {
      const proxyHeaders = { ...headers, Host: new URL(url).host };
      if (proxy.username) {
        proxyHeaders['Proxy-Authorization'] = 'Basic ' + Buffer.from(
          decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')
        ).toString('base64');
      }
      req = http.request({
        host: proxy.hostname,
        port: proxy.port || 80,
        method: 'GET',
        path: url,
        headers: proxyHeaders,
      }, onResponse);
      req.end();
    } else {
      req = lib.get(url, { headers }, onResponse);
    }

    // 总超时：跨重定向共享 deadline，slow-drip 也无法绕过。
    totalTimer = setTimeout(() => fail(new Error('请求超时（总时长 ' + timeoutMs + 'ms）')), remaining);
    // socket 空闲超时（第二道防线）：连接静默即中断。
    req.setTimeout(remaining, () => {
      if (!settled) fail(new Error('请求超时（连接空闲超过 ' + remaining + 'ms）'));
      req.destroy();
    });
    req.on('error', (err) => fail(err));
  });
}

/** 把警告并入结果（有警告才加字段，保持无警告时字段集合不变）。 */
export function withWarning(result, warnings) {
  return warnings.length > 0 ? { ...result, warning: warnings.join('；') } : result;
}

// ---------------------------------------------------------------------------
// 余额：两个数据源，一条载荷契约
//   源 A（官方账号平台，OAuth）：ctx.deepseekAccount.getBalance() →
//     null（未登录）| {status:'failed'} | {status:'ready', value:[钱包], bonusWallets:[钱包]}
//     其中 value = normal_wallets（充值）、bonusWallets = bonus_wallets（赠送），
//     balance 是保留服务端精度的十进制字符串。
//   源 B（API Key）：GET /user/balance → balance_infos[]。
// 两者一律规整为 balances: [{ currency, total, granted, toppedUp }]。
// ---------------------------------------------------------------------------

/** 账号平台钱包 → 统一 balances 形态（纯函数，可单测）。 */
export function walletsToBalances(normalWallets, bonusWallets) {
  const byCurrency = new Map(); // currency -> { granted, toppedUp }
  const bucket = (currency) => {
    if (!byCurrency.has(currency)) byCurrency.set(currency, { granted: 0, toppedUp: 0 });
    return byCurrency.get(currency);
  };
  const absorb = (list, field) => {
    if (!Array.isArray(list)) return;
    for (const w of list) {
      const currency = String(w?.currency || '');
      const amount = parseAmount(w?.balance);
      if (amount === null) continue; // 脏钱包整条丢弃（parseAmount 已钳负数）
      const b = bucket(currency);
      b[field] += amount;
    }
  };
  absorb(normalWallets, 'toppedUp');
  absorb(bonusWallets, 'granted');
  const balances = [];
  for (const [currency, b] of byCurrency) {
    balances.push({ currency, total: b.toppedUp + b.granted, granted: b.granted, toppedUp: b.toppedUp });
  }
  // CNY 优先（与客户端「主条目」选取口径一致），其余按币种名稳定排序。
  balances.sort((x, y) => (x.currency === 'CNY' ? -1 : y.currency === 'CNY' ? 1 : x.currency.localeCompare(y.currency)));
  return balances;
}

/**
 * 源 A：官方账号平台余额。
 * @param {object|null} account ctx.deepseekAccount（可空 = 未挂载该服务）
 * @returns {Promise<{available: boolean, result?: object}>}
 *   available=false → 未登录/服务缺席，调用方应改走 API Key 端点。
 */
export async function queryAccountPlatformBalance(account) {
  if (!account || typeof account.getBalance !== 'function') return { available: false };
  let detail;
  try {
    detail = await account.getBalance();
  } catch (err) {
    return { available: true, result: { ok: false, error: 'account: ' + String((err && err.message) || err), balances: [] } };
  }
  if (detail === null || detail === undefined) return { available: false }; // 未登录 → 交回 API Key 路径
  if (!detail || typeof detail !== 'object' || detail.status !== 'ready') {
    return { available: true, result: { ok: false, error: 'account balance unavailable', balances: [] } };
  }
  const balances = walletsToBalances(detail.value, detail.bonusWallets);
  return { available: true, result: { ok: true, isAvailable: true, balances } };
}

// 返回 { ok, isAvailable?, balances: [{currency,total,granted,toppedUp}], error?, warning? }
// 三条路径返回字段集合一致（prices 由 balance-scheduler.js 统一附加）。
export async function queryBalance(dshHome, deps = {}) {
  const account = deps.account || null;
  if (account) {
    const fromPlatform = await queryAccountPlatformBalance(account);
    if (fromPlatform.available) {
      // 平台已登录但查询失败，且本机另有 API Key 时仍值得一试（两源互补）。
      if (fromPlatform.result && fromPlatform.result.ok) return fromPlatform.result;
      const fallbackKey = deps.resolveApiKey
        ? String(await deps.resolveApiKey(dshHome) || '').trim()
        : await resolveApiKey(dshHome, deps.credentials || null);
      if (!fallbackKey) return fromPlatform.result;
      const apiResult = await queryBalanceByApiKey(dshHome, fallbackKey);
      if (apiResult.ok) apiResult.warning = withReason(fromPlatform.result.error, apiResult.warning);
      return apiResult;
    }
  }
  const key = deps.resolveApiKey
    ? String(await deps.resolveApiKey(dshHome) || '').trim()
    : await resolveApiKey(dshHome, deps.credentials || null);
  return queryBalanceByApiKey(dshHome, key);
}

/** 源 B：API Key 端点。 */
export async function queryBalanceByApiKey(dshHome, key) {
  if (!key) return { ok: false, error: 'no-key', balances: [] };
  const endpoint = balanceEndpoint();
  const warnings = [];
  try {
    const data = await fetchJson(endpoint, key, {
      onAuthStripped: (target) => warnings.push('重定向到非可信目标已剥离 Authorization（' + target + '）'),
    });
    if (/^http:/i.test(endpoint)) {
      warnings.push('余额端点使用 http://，API Key 明文传输（仅建议本地代理）');
    }
    if (!data || typeof data !== 'object') {
      return withWarning({ ok: false, error: 'bad-response', balances: [] }, warnings);
    }
    const balances = Array.isArray(data.balance_infos)
      ? data.balance_infos.map((b) => {
          const total = parseAmount(b.total_balance);
          // 脏数据显式告警，而不是静默显示 0。
          if (total === null) {
            warnings.push('total_balance 无法解析（原值：' + JSON.stringify(b.total_balance) + '），已按 0 显示');
          }
          return {
            currency: String(b.currency || ''),
            total: total ?? 0,
            granted: parseAmount(b.granted_balance) ?? 0,
            toppedUp: parseAmount(b.topped_up_balance) ?? 0,
          };
        })
      : [];
    return withWarning({ ok: true, isAvailable: !!data.is_available, balances }, warnings);
  } catch (err) {
    return withWarning({ ok: false, error: String((err && err.message) || err), balances: [] }, warnings);
  }
}

/** 把「主源失败原因」并到已有 warning 前面（无原 warning 时直接作 warning）。 */
function withReason(reason, existing) {
  const text = '账号平台余额不可用（' + String(reason || 'unknown') + '），已改用 API Key 端点';
  return existing ? text + '；' + existing : text;
}
