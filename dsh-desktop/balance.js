'use strict';

// DeepSeek 账户余额查询（主进程模块，供对话统计栏小部件 / chrome 菜单使用）。
//
// 密钥来源：环境变量 DEEPSEEK_API_KEY > DSH_HOME/.credentials.yaml。
// 端点：https://api.deepseek.com/user/balance；可用环境变量覆盖：
//   DEEPSEEK_BALANCE_URL —— 完整端点 URL（自定义代理/镜像）
//   DEEPSEEK_API_BASE    —— API 基址（自动拼接 /user/balance）

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { homedir } = require('node:os');

const DEFAULT_BASE = 'https://api.deepseek.com';

// ---------------------------------------------------------------------------
// OpenCode Go 订阅额度（5 小时滚动 / 每周 / 每月）
// 端点：https://opencode.ai/zen/go/v1/usage（官方未公开文档，2026-08 实测可用）
// 密钥来源：环境变量 OPENCODE_GO_API_KEY（兼容 OPENCODE_API_KEY）
// DSH_HOME/.credentials.yaml 的 OPENCODE_GO_API_KEY > OpenCode CLI auth.json
// （opencode-go / opencode 条目，type=api）。
// 返回：{ usage: { rolling, weekly, monthly } }，每窗口
// { status, percent(0-100 已用), resetsAt(ISO) }。
// ---------------------------------------------------------------------------
const OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';

/**
 * 从 .credentials.yaml 逐行读取一个键值（`KEY: value`，值可带引号）。
 * readApiKey / readOpencodeGoKey 共用，避免「读 YAML→正则」样板三处复制漂移。
 * @param {string} dshHome
 * @param {string} keyName
 * @returns {string} 读取失败/未找到返回空串
 */
function readCredentialLine(dshHome, keyName) {
  try {
    const text = fs.readFileSync(path.join(dshHome, '.credentials.yaml'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(new RegExp('^\\s*' + keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*["\']?([^"\'\\s#]+)'));
      if (m) return m[1];
    }
  } catch {}
  return '';
}

function readOpencodeGoKey(dshHome) {
  const envKey = process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY;
  if (envKey) return envKey.trim();
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

function pickUsageWindow(w) {
  if (!w || typeof w !== 'object') return null;
  const percent = Number(w.percent);
  return {
    status: typeof w.status === 'string' ? w.status : null,
    percent: Number.isFinite(percent) ? percent : null,
    resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
  };
}

// 返回 { ok, reason?, error?, usage?: { rolling, weekly, monthly } }
async function queryOpencodeUsage(dshHome) {
  const key = readOpencodeGoKey(dshHome);
  if (!key) return { ok: false, reason: 'no-key' };
  try {
    const data = await fetchJson(OPENCODE_USAGE_URL, key);
    const usage = data && typeof data === 'object' && data.usage ? data.usage : data;
    if (!usage || typeof usage !== 'object') return { ok: false, reason: 'bad-response' };
    return {
      ok: true,
      usage: {
        rolling: pickUsageWindow(usage.rolling),
        weekly: pickUsageWindow(usage.weekly),
        monthly: pickUsageWindow(usage.monthly),
      },
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// ---------------------------------------------------------------------------
// 模型价格（¥/百万 token）。官方定价：
// https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
//
// 2026-08-17 00:00（北京时间）起采用“峰谷定价”：高峰时段
// （北京时间 9:00-12:00、14:00-18:00）为全价，空闲时段为高峰的一半。
// 在此之前为旧版固定价。示意图：
//   deepseek-v4-flash  高峰 3.0 / 0.10 / 9.0   空闲 1.5 / 0.05 / 4.5
//   deepseek-v4-pro    高峰 9.0 / 0.30 / 27.0  空闲 4.5 / 0.15 / 13.5
// 字段：{ cacheMiss 输入未命中, cacheHit 输入命中, output 输出 }。
// ---------------------------------------------------------------------------

// 高峰全价（2026-08-17 起生效）。
const PEAK_PRICES = {
  'deepseek-v4-flash': { cacheMiss: 3, cacheHit: 0.1, output: 9 },
  'deepseek-v4-pro': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
  // 旧模型名别名：deepseek-chat 对应 v4-flash，deepseek-reasoner 对应 v4-pro。
  'deepseek-chat': { cacheMiss: 3, cacheHit: 0.1, output: 9 },
  'deepseek-reasoner': { cacheMiss: 9, cacheHit: 0.3, output: 27 },
};

// 2026-08-17 前的旧版固定价（历史结算参考）。
const LEGACY_PRICES = {
  'deepseek-v4-flash': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-v4-pro': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
  'deepseek-chat': { cacheMiss: 1, cacheHit: 0.02, output: 2 },
  'deepseek-reasoner': { cacheMiss: 3, cacheHit: 0.025, output: 6 },
};

// 峰谷定价生效节点：2026-08-17 00:00 北京时间 = 2026-08-16 16:00 UTC。
const PEAK_PRICING_SINCE_UTC = Date.UTC(2026, 7, 16, 16, 0, 0);

// 当前（或指定时刻）是否处于高峰时段（北京时间 9:00-12:00、14:00-18:00）。
function isPeakHour(date) {
  const d = date ? new Date(date) : new Date();
  const hour = new Date(d.getTime() + 8 * 3600 * 1000).getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

// 某模型在指定时刻的“有效单价”（已含旧版→峰谷切换与高峰/低谷换算）。
// 模型名为空（settings.yaml 缺失 / 调用方未传）时按 deepseek-v4-pro 兜底：
// 与 main.js 的调用方回退一致（readActiveModel() || 'deepseek-v4-pro'）。
// 未知模型名（非空但不在价目表内）同样按 v4-pro 最高档估算，避免少报费用；
// 旧版固定价期与峰谷期统一回退到 v4-pro 对应档位，杜绝两时期回退档位
// 不一致造成的费用估算跳变（旧实现峰谷期回退 pro、旧版期回退 flash）。
function effectivePrice(model, date) {
  const key = String(model || '').trim() || 'deepseek-v4-pro';
  const now = date ? new Date(date) : new Date();
  if (now.getTime() < PEAK_PRICING_SINCE_UTC) {
    return { ...(LEGACY_PRICES[key] || LEGACY_PRICES['deepseek-v4-pro']) };
  }
  const peak = PEAK_PRICES[key] || PEAK_PRICES['deepseek-v4-pro'];
  if (isPeakHour(now)) return { ...peak };
  return {
    cacheMiss: peak.cacheMiss / 2,
    cacheHit: peak.cacheHit / 2,
    output: peak.output / 2,
  };
}

function readApiKey(dshHome) {
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey) return envKey.trim();
  return readCredentialLine(dshHome, 'DEEPSEEK_API_KEY');
}

// 当前默认模型（~/.dsh/settings.yaml 的 agent-default-model.model），
// 决定按哪一档价格估算本轮费用。锚定 agent-default-model 段：settings.yaml
// 其它段落（插件 config 等）也可能有 model: 行，取错档位会算错费用。
function readActiveModel(dshHome) {
  try {
    const text = fs.readFileSync(path.join(dshHome, 'settings.yaml'), 'utf8');
    // YAML 映射段 = 段首行 + 其后的缩进续行；非缩进行（下一顶层键）自然截断。
    const section = /^agent-default-model:.*(?:\n[ \t]+.*)*/m.exec(text);
    if (!section) return '';
    const m = /^\s*model\s*:\s*['"]?([^\s'"#]+)/m.exec(section[0]);
    if (m) return m[1];
  } catch {}
  return '';
}

function balanceEndpoint() {
  if (process.env.DEEPSEEK_BALANCE_URL) return process.env.DEEPSEEK_BALANCE_URL;
  const base = (process.env.DEEPSEEK_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  return base + '/user/balance';
}

function fetchJson(url, apiKey, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { Authorization: 'Bearer ' + apiKey, 'User-Agent': 'DSH-Desktop' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
          if (body.length > 1024 * 1024) req.destroy(new Error('响应过大'));
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            const hint = body.slice(0, 200).trim();
            return reject(new Error('HTTP ' + res.statusCode + (hint ? '：' + hint : '')));
          }
          try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON 解析失败')); }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

// 返回 { ok, isAvailable?, balances: [{currency,total,granted,toppedUp}], error? }
// 三条路径返回字段集合一致（prices 由调用方 main.js 统一附加）。
async function queryBalance(dshHome) {
  const key = readApiKey(dshHome);
  if (!key) return { ok: false, error: 'no-key', balances: [] };
  try {
    const data = await fetchJson(balanceEndpoint(), key);
    const balances = Array.isArray(data.balance_infos)
      ? data.balance_infos.map((b) => ({
          currency: String(b.currency || ''),
          total: Number(b.total_balance) || 0,
          granted: Number(b.granted_balance) || 0,
          toppedUp: Number(b.topped_up_balance) || 0,
        }))
      : [];
    return { ok: true, isAvailable: !!data.is_available, balances };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), balances: [] };
  }
}

module.exports = {
  queryBalance,
  queryOpencodeUsage,
  readActiveModel,
  effectivePrice,
  isPeakHour,
};
