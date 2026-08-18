'use strict';

// 真实渲染层验证（在 Electron 渲染进程内执行，nodeIntegration 提供 require）：
// 把仓库里真实的 dsh-balance/lib/client.js 产物经 window.__ModuleLoader__ 装载，
// 用仓库 node_modules 里的真实 React 18 渲染到真实 DOM，覆盖：
//   · tokenUsage 归一化（provider 形态 / NaN 清零回归，在真实 React+DOM 中复验）
//   · priceTable 按真实模型取价 + 「按默认模型估算」标注
//   · money 大额/非有限格式化
//   · rel=noopener noreferrer
//   · Go 用量 chip（percent null → "?"）
//   · 单一投递（invoke 只触发、不消费返回值；重挂载不再触发）
// 断言结果写入 process.env.DSH_BALANCE_RENDERER_RESULT 指定的 JSON 文件，
// 并经 'harness-result' IPC 通知主进程。

const { ipcRenderer } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const repoRequire = createRequire(path.join(__dirname, '..', '..', '..', 'package.json'));
const React = repoRequire('react');
const ReactDOMClient = repoRequire('react-dom/client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 断言收集
// ---------------------------------------------------------------------------

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || '' });
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
}
async function waitFor(cond, what, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let v;
    try { v = cond(); } catch { v = false; }
    if (v) return;
    await sleep(25);
  }
  record(what, false, '等待超时');
  throw new Error('waitFor timeout: ' + what);
}

// ---------------------------------------------------------------------------
// 装载客户端产物（与 dsh 装配器同款入口：window.__ModuleLoader__.load）
// ---------------------------------------------------------------------------

const clientSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'assets', 'plugins', 'dsh-balance', 'lib', 'client.js'),
  'utf8',
);
let factory = null;
window.__ModuleLoader__ = { load: (obj) => { factory = obj.factory; } };
const scriptEl = document.createElement('script');
scriptEl.textContent = clientSrc;
document.head.appendChild(scriptEl);
if (typeof factory !== 'function') throw new Error('未能捕获 client.js 的 ModuleLoader factory');

const mod = factory((name) => {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return repoRequire('react/jsx-runtime');
  throw new Error('unexpected require: ' + name);
});
let BalanceDock = null;
mod.apply({
  slots: { register: (_info, Component) => { BalanceDock = Component; } },
  effect: (cb) => cb(),
});
if (typeof BalanceDock !== 'function') throw new Error('未能从 slots.register 捕获 BalanceDock');

// ---------------------------------------------------------------------------
// 真实 React 渲染
// ---------------------------------------------------------------------------

let refreshCount = 0;
window.dshDesktop = { refreshBalance: () => { refreshCount += 1; return Promise.resolve(null); } };

let currentUsage = null;
function App() {
  return React.createElement(BalanceDock, { useProjection: () => currentUsage });
}
let root = ReactDOMClient.createRoot(document.getElementById('root'));
function rerender() {
  root.render(React.createElement(App));
}
rerender();

function push(data) {
  window.dispatchEvent(new CustomEvent('dsh-balance-changed', { detail: data }));
}
function dock() {
  return document.querySelector('.dsh-balance-dock');
}
function rootText() {
  return (document.getElementById('root').innerText || '').replace(/\s+/g, ' ').trim();
}

const FLASH = { cacheMiss: 3, cacheHit: 0.1, output: 9 };
const PRO = { cacheMiss: 9, cacheHit: 0.3, output: 27 };
const BALANCE_DATA = {
  ok: true,
  balances: [{ currency: 'CNY', total: 88.5, granted: 10, toppedUp: 78.5 }],
  prices: FLASH,
  priceTable: { 'deepseek-v4-flash': FLASH, 'deepseek-v4-pro': PRO },
  model: 'deepseek-v4-flash',
};

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

(async () => {
  try {
    // 场景 1：首挂载 loading → 不渲染 + 触发一次主动刷新
    await waitFor(() => refreshCount === 1, '首挂载触发一次主动刷新');
    record('loading 期不渲染（无 dock 元素）', dock() === null);
    record('invoke 返回值不被消费（数据仅走事件通道）', rootText() === '', rootText());

    // 场景 2：事件推送 → 显示余额；usage（投影形态）计费
    currentUsage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    push(BALANCE_DATA);
    rerender();
    await waitFor(() => dock() !== null, '事件推送后 dock 渲染');
    await waitFor(() => rootText().includes('本轮 ¥3.000'), '投影形态计价 3.000', 5000);
    record('余额显示 ¥88.50', rootText().includes('余额 ¥88.50'), rootText());
    record('rel=noopener noreferrer', dock().getAttribute('rel') === 'noopener noreferrer');
    record('target=_blank', dock().getAttribute('target') === '_blank');
    record('默认模型估算标注', String(dock().getAttribute('title')).includes('按默认模型 deepseek-v4-flash 单价估算（会话实际模型未知）'));

    // 场景 3：provider 形态（inputTokens）真实 React 复验 —— 旧代码恒为 0
    currentUsage = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0 };
    rerender();
    await waitFor(() => rootText().includes('本轮 ¥12.00'), 'provider 形态计价 12.00（[BUG] 回归）');
    record('provider 形态 inputTokens 计费', true);

    // 场景 4：cacheWriteTokens 缺省 NaN 清零回归
    currentUsage = { uncachedInputTokens: 1e6, cacheReadTokens: 0, outputTokens: 0 };
    rerender();
    await waitFor(() => rootText().includes('本轮 ¥3.000'), '缺字段不 NaN 清零（[BUG] 回归）');
    record('cacheWriteTokens 缺省不再清零', true);

    // 场景 5：usage 携带真实模型 → 按真实模型计价
    currentUsage = { uncachedInputTokens: 1e6, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, model: 'deepseek-v4-pro' };
    rerender();
    await waitFor(() => rootText().includes('本轮 ¥9.000'), '按会话真实模型计价 9.000');
    record('按会话模型 deepseek-v4-pro 计价', true);
    record('标注切换为按会话模型', String(dock().getAttribute('title')).includes('按会话模型 deepseek-v4-pro 单价估算'));

    // 场景 6：Go 用量 chip
    currentUsage = null;
    push(Object.assign({}, BALANCE_DATA, {
      peak: true,
      opencodeGo: { ok: true, usage: { rolling: { status: 'ok', percent: null, resetsAt: 'x' }, weekly: { status: 'ok', percent: 42, resetsAt: 'x' } } },
    }));
    await waitFor(() => rootText().includes('Go 5h?'), 'Go chip null percent 显示 ?');
    record('Go percent=null 显示 ?', true);
    record('Go 周窗口显示', rootText().includes('周42%'), rootText());
    record('高峰价 chip', rootText().includes('⛰ 高峰价'), rootText());

    // 场景 7：money 大额格式化（1e21 不出现科学计数法）
    currentUsage = null;
    push({ ok: true, balances: [{ currency: 'CNY', total: 1e21, granted: 0, toppedUp: 1e21 }], prices: FLASH });
    await waitFor(() => rootText().includes('1,000,000,000,000,000,000,000.00'), '大额余额渲染（等待新推送生效）');
    record('大额不出现科学计数法', !rootText().includes('e+21'), rootText());

    // 场景 8：disabled 隐藏
    push({ ok: false, disabled: true, balances: [], prices: {} });
    await waitFor(() => dock() === null, 'disabled 隐藏');
    record('disabled 整体隐藏', true);

    // 场景 9：重挂载—— 页面生命周期内已有数据，不再触发刷新
    root.unmount();
    document.getElementById('root').innerHTML = '';
    root = ReactDOMClient.createRoot(document.getElementById('root'));
    rerender();
    await sleep(200);
    record('已有数据后重挂载不再触发刷新', refreshCount === 1, 'refreshCount=' + refreshCount);

    const failures = results.filter((r) => !r.pass).length;
    const resultFile = process.env.DSH_BALANCE_RENDERER_RESULT;
    fs.writeFileSync(resultFile, JSON.stringify({ results, failures }, null, 2), 'utf8');
    ipcRenderer.send('harness-result', failures);
  } catch (err) {
    const resultFile = process.env.DSH_BALANCE_RENDERER_RESULT;
    try {
      fs.writeFileSync(resultFile, JSON.stringify({ results, failures: results.filter((r) => !r.pass).length + 1, fatal: String((err && err.stack) || err) }, null, 2), 'utf8');
    } catch {}
    ipcRenderer.send('harness-result', 1);
  }
})();
