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

const DEFAULT_BASE = 'https://api.deepseek.com';

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

// 兜底档（deepseek-v4-flash 高峰价）。
const FALLBACK_PRICES = { cacheMiss: 3, cacheHit: 0.1, output: 9 };

// 兼容旧引用：DEFAULT_PRICES 即高峰全价表。
const DEFAULT_PRICES = PEAK_PRICES;

// 当前（或指定时刻）是否处于高峰时段（北京时间 9:00-12:00、14:00-18:00）。
function isPeakHour(date) {
  const d = date ? new Date(date) : new Date();
  const hour = new Date(d.getTime() + 8 * 3600 * 1000).getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

// 某模型在指定时刻的“有效单价”（已含旧版→峰谷切换与高峰/低谷换算）。
function effectivePrice(model, date) {
  const key = String(model || '').trim() || 'deepseek-v4-flash';
  const now = date ? new Date(date) : new Date();
  if (now.getTime() < PEAK_PRICING_SINCE_UTC) {
    return { ...(LEGACY_PRICES[key] || FALLBACK_PRICES) };
  }
  const peak = PEAK_PRICES[key] || PEAK_PRICES['deepseek-v4-flash'];
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
  try {
    const text = fs.readFileSync(path.join(dshHome, '.credentials.yaml'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DEEPSEEK_API_KEY\s*:\s*["']?([^"'\s#]+)/);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

// 从 env 或 ~/.dsh/.credentials.yaml 读取任意凭据条目（与 readApiKey 同构）。
function readCredentialValue(dshHome, name) {
  const envKey = process.env[name];
  if (envKey) return envKey.trim();
  try {
    const text = fs.readFileSync(path.join(dshHome, '.credentials.yaml'), 'utf8');
    const re = new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*["\']?([^"\'\\s#]+)');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(re);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

// OpenCode Go 套餐用量查询（官方配额接口：GET https://opencode.ai/zen/go/v1/usage，
// Authorization: Bearer <OPENCODE_GO_API_KEY>）。响应：
//   { usage: { rolling, weekly, monthly: { percent, status, resetsAt } } }
// 三个窗口均为「套餐额度已用百分比」。失败只影响本 provider，不影响 DeepSeek 余额。
async function queryOpenCodeGoUsage(dshHome) {
  const key = readCredentialValue(dshHome, 'OPENCODE_GO_API_KEY');
  if (!key) return { ok: false, error: 'no-key' };
  try {
    const data = await fetchJson('https://opencode.ai/zen/go/v1/usage', key);
    const u = (data && data.usage) || {};
    const windows = {};
    for (const k of ['rolling', 'weekly', 'monthly']) {
      const v = u[k];
      if (v && typeof v === 'object') {
        windows[k] = {
          percent: Number(v.percent) || 0,
          status: String(v.status || ''),
          resetsAt: v.resetsAt ? new Date(v.resetsAt).toISOString() : '',
        };
      }
    }
    if (!Object.keys(windows).length) return { ok: false, error: 'empty usage payload' };
    return { ok: true, windows };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// 当前默认模型（~/.dsh/settings.yaml 的 agent-default-model.model），
// 决定按哪一档价格估算本轮费用。
function readActiveModel(dshHome) {
  try {
    const text = fs.readFileSync(path.join(dshHome, 'settings.yaml'), 'utf8');
    const m = text.match(/^\s*model\s*:\s*(\S+)/m);
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

// 返回 { ok, isAvailable?, balances: [{currency,total,granted,toppedUp}], error?, prices }
async function queryBalance(dshHome) {
  const key = readApiKey(dshHome);
  if (!key) return { ok: false, error: 'no-key', balances: [], prices: DEFAULT_PRICES };
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
  queryOpenCodeGoUsage,
  readCredentialValue,
  readActiveModel,
  effectivePrice,
  isPeakHour,
  PEAK_PRICES,
  LEGACY_PRICES,
  DEFAULT_PRICES,
  FALLBACK_PRICES,
};
