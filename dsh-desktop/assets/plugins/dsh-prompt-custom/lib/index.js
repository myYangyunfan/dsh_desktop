// dsh-prompt-custom（独立移植版）— host 半边
//
// ── 0.3.0 修复：注入作用域（此前「静默不生效」的根因） ──────────────────────
// 内核 SystemPrompt 的节注册表是**分层**的（@deepseek-ai/dsh-scope 的 ScopedLayers）：
// 一个全局层 + 每个 agent 一个 scoped 层。装配时 merge() 先铺全局，再让作用域链由远到近
// 用 Map.set 覆盖同名节（dsh-scope/lib/index.js:177-181）——**判重只发生在同一层内**。
//
// 所以「替换官方人设」的正确语义是：用**同名节**注册到**更近的作用域**。
//   ✗ 注册到插件自己的（根）ctx：根层已被 SystemPrompt 构造函数占用，必然抛
//       prompt section "deployment:persona-prefix" is already registered
//       (for a per-agent override, register through that agent's `agent.ctx` instead)
//     旧版把这个异常 try/catch 吞进 logger，HTTP 只回 applied:null —— 用户侧表现为
//     「开关是开的、保存显示已保存、但提示词根本没注入」。
//   ✓ 注册到 agent.ctx（该 agent 的作用域）：落在 agent 层，遮蔽全局 persona，替换生效。
//
// 本版照内核官方宿主插件范例实现（dsh-file-reference-local/lib/index.js:339-372）：
//   agent.ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section(...))
//   + ctx.get('agents').list() 补历史 agent + agent/created 增量 + agent/disposed 清理。
// 用 agent.ctx.inject(...) 而不是 agent.ctx.systemPrompt：作用域 ctx 是 createScope() 造出来的
// 无 inject 的 fiber，直接取服务拿不到；必须用 inject 派生子 fiber（官方同款写法）。
//
// 另外：节的 text 传**函数**（内核每步装配都重新求值，dsh-system-prompt/lib/index.js:342），
// 因此改文本无需重注册，下一步就生效；只有「启用开关」或「append↔replace 模式」变化才需要
// 重注册（两种模式的节名不同：dsh:custom-prompt vs deployment:persona-prefix）。
//
// ── 0.3.0 附带修复：把静默失败变成可见 ────────────────────────────────────
// /config 现在回传 armed / injected / lastError；设置页据此显示真实状态，
// 不再无条件显示「已保存」。注入失败时把内核错误原文一路带到 UI。
//
// 配置存 $DSH_HOME/prompt-custom.json；读写走插件自己的 webServer 路由。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const name = 'dsh-prompt-custom';
export const inject = ['systemPrompt', 'webServer'];

const SECTION_CUSTOM = 'dsh:custom-prompt';
// 与内核同名才叫「替换」；改名只会变成并列追加（dsh-system-prompt/lib/index.js:49-57）。
const SECTION_PERSONA_PREFIX = 'deployment:persona-prefix';
const SECTION_PERSONA_SUFFIX = 'deployment:persona-suffix';
// 内核 SECTION_ORDERS 的兜底值，仅当 getSectionOrder 取不到时使用。
const ORDER_PERSONA_PREFIX = 0;
const ORDER_PERSONA_SUFFIX = 10200;
const CONFIG_ROUTE = '/api/dsh-prompt-custom/config';
const PREVIEW_ROUTE = '/api/dsh-prompt-custom/preview';
// HTTP 接口协议版本。client 会核对它：宿主 Node 进程不重启就不会换插件代码，
// 而页面一刷新就会拿到新的 client bundle —— 这个错配必须能被 UI 说清楚。
const API_PROTO = 2;

function configPath() {
  const home = process.env.DSH_HOME && String(process.env.DSH_HOME).trim()
    ? String(process.env.DSH_HOME).trim()
    : path.join(os.homedir(), '.dsh');
  return path.join(home, 'prompt-custom.json');
}

function readFileConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    // 必须是**非数组**的普通对象。数组也满足 typeof === 'object'，若不排除，
    // 它会被当成 {"0":..,"1":..} 到处流窜：
    //   · normalize() 展开出 0/1 这种伪字段
    //   · detectUnknownConfigKeys() 会把 "0"/"1" 报成「陌生配置键」（假告警）
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/**
 * 写配置。**只覆盖本插件拥有的字段，保留磁盘上其它键**（非破坏性写盘）。
 *
 * 为什么必须这样：这个文件可能被**另一个版本**的插件写过（例如新版多了一个 `prefix` 字段）。
 * 如果旧版本直接把整个文件重写成自己那三个字段，用户在新版本里的设置就被**不可逆地抹掉**了
 * —— 这与本插件历史上那次「静默失效」是同一类事故：界面上什么都没说，数据就没了。
 * 未知键的存在会由 `unknownConfigKeys` 报到界面上，但**保存本身不能把它们删掉**。
 */
function writeFileConfig(cfg) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let base = {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) base = raw;
  } catch { /* 文件不存在或已损坏：从空对象开始 */ }
  const out = { ...base, ...cfg };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return file;
}

function normalize(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    enabled: src.enabled === true,
    mode: src.mode === 'replace' ? 'replace' : 'append',
    text: typeof src.text === 'string' ? src.text : ''
  };
}

function isLoopback(req) {
  const ra = (req.socket && req.socket.remoteAddress) || '';
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(data.length)
  });
  res.end(data);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// 内核的变量语法（dsh-system-prompt/lib/index.js:58-61）。
const VAR_GROUP = /^\{\{([^{}]*)\}\}/;
const VAR_NAME = /^[a-z][a-z0-9_]*$/;

/** 新建一个变量扫描结果。 */
function newSink() { return { missing: new Set(), malformed: new Set() }; }

/**
 * 只扫描不替换：找出配置文本里会被内核判为「未知/畸形变量」的引用。
 * 这不是学术洁癖 —— 内核 renderPrompt 对未知变量是**抛错**（会让整轮运行失败），
 * 所以用户写出一个 {{modell}} 会让每一次模型步都炸，而页面上什么都看不到。
 * 这里把它变成设置页上的一条可见警告。
 */
function scanVariables(text, known, sink) {
  if (typeof text !== 'string' || !text.includes('{{')) return;
  let last = 0;
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = VAR_GROUP.exec(text.slice(open));
    if (group === null) { last = open + 2; continue; }
    const name = group[0].slice(2, -2);
    if (!VAR_NAME.test(name)) sink.malformed.add(name);
    else if (!known.has(name)) sink.missing.add(name);
    last = open + group[0].length;
  }
}

/**
 * 预览用的插值：已知变量替换成实际值，未知/畸形**原样保留**（预览要宽容，
 * 与内核装配时的抛错行为相对）。扫描结果记进 sink，供页面提示。
 */
function interpolateText(text, variables, sink) {
  if (typeof text !== 'string') return '';
  if (!text.includes('{{')) return text;
  let out = '';
  let last = 0;
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = VAR_GROUP.exec(text.slice(open));
    if (group === null) { out += text.slice(last, open + 2); last = open + 2; continue; }
    const name = group[0].slice(2, -2);
    const known = VAR_NAME.test(name);
    const value = known && Object.hasOwn(variables, name) ? variables[name] : undefined;
    if (known && value !== undefined) {
      out += text.slice(last, open) + String(value);
    } else {
      if (known) sink.missing.add(name); else sink.malformed.add(name);
      out += text.slice(last, open + group[0].length);
    }
    last = open + group[0].length;
  }
  return out + text.slice(last);
}

/** 把装配结果渲染成预览文本（含变量替换）。 */
function renderSections(assembly, sink) {
  const secs = (assembly && assembly.sections) || [];
  const vars = (assembly && assembly.variables) || {};
  return secs
    .filter(Boolean)
    .map((s) => {
      const raw = typeof s.text === 'string' ? s.text : String((s && s.text) || '');
      return s.interpolate === false ? raw : interpolateText(raw, vars, sink);
    })
    .filter((t) => t && t.trim())
    .join('\n\n');
}

/** 只取节名。`assemble()` 返回的 section 只有 `{ name, text, interpolate? }`，**没有 order**
 *  （dsh-system-prompt/lib/index.js:339-344）；order 要用 `getSectionOrder('常量名')` 取，
 *  而这里的 `s.name` 是节名（如 `"deployment:persona-prefix"`）不是常量名，取不到。
 *  所以这里**不返回** order —— 早先版本返回的 `order: undefined` 是个恒定的死字段。 */
function sectionNames(assembly) {
  return ((assembly && assembly.sections) || [])
    .filter(Boolean)
    .map((s) => ({ name: s.name }));
}

/**
 * 本版本认识的配置字段。之外的键 = 这个配置文件是**别的版本**的插件写的。
 *
 * 为什么要专门检测：配置 schema 一旦演进（比如把 `text` 拆成 `prefix`/`suffix`），
 * 新代码读不懂旧文件里的 `text` → 用户**正在生效的提示词会静默消失**。
 * 这个插件已经吃过一次「静默失效」的亏（见 index.js 顶部注释），不能在同源风险上再栽一次。
 */
const KNOWN_CONFIG_KEYS = new Set(['enabled', 'mode', 'text']);

export function apply(ctx, config) {
  const log = (msg) => { try { ctx.logger?.info?.(msg); } catch { console.log(msg); } };
  const warn = (msg) => { try { ctx.logger?.warn?.(msg); } catch { console.warn(msg); } };

  let live = normalize({ ...(config || {}), ...(readFileConfig() || {}) });
  let lastError = null;                 // 最近一次注入失败的内核原文；null = 无错误
  const entries = new Map();            // agent -> { shape: 'off'|'append'|'replace', fiber }
  let lastAgent = null;                 // 供 /preview 选作用域

  /** 当前配置对应的注入形态；'off' 表示不该有任何自定义节。 */
  const desiredShape = () => {
    if (!live.enabled || !String(live.text || '').trim()) return 'off';
    return live.mode === 'replace' ? 'replace' : 'append';
  };

  /**
   * 节文本用函数：内核每次装配都重新求值（dsh-system-prompt/lib/index.js:342），
   * 所以改文本无需重注册、下一步就生效。
   *
   * 这里**不做**「形态/开关是否仍匹配」的判断：那种判断的失败形态是返回空串，
   * 而 replace 模式下空串会把官方人设整段抹掉（比多留一步旧文案严重得多）。
   * 形态与开关的一致性交给 install 的重注册保证（POST 与 GET 都会对齐）。
   *
   * textShadow 专门堵「文本被清空的转换窗口」：清空文本会让 desiredShape 变 'off'，
   * 而销毁已注册的 replace 节是在后续微任务里完成的；在两者之间内核若恰好装配一次，
   * 空串就会把官方人设抹掉（验证台 E4/E6 抓到的空人设帧）。清空时沿用上一份非空文本，
   * 节随后就被销毁、官方人设自然恢复 —— 于是这个窗口不可能产出空人设。
   * 稳态下 textShadow 完全惰性：文本为空时根本不会有节被注册，currentText 不会被调用。
   */
  let textShadow = String(live.text || '');
  const currentText = () => {
    const text = String(live.text || '');
    if (text.trim()) textShadow = text;
    return textShadow;
  };

  const orderOf = (sp, key, fallback) => {
    try {
      const v = typeof sp.getSectionOrder === 'function' ? sp.getSectionOrder(key) : undefined;
      return Number.isFinite(v) ? v : fallback;
    } catch { return fallback; }
  };

  // 安装/卸载串行化：agent/created（内核 serial 且被 await）与设置页保存可能并发，
  // 交错会留下「注册了一半」，或对同一 agent 重复注册（后者会撞内核重名保护）。
  //
  // 关键：这条队列**永不 reject**。它挂在 agent/created 的 listener 上，而内核的
  // serial 派发一旦被 listener 的 rejection 传染，就会让**会话创建失败**——插件绝不能
  // 有这个能力。失败一律降级成 lastError（再由设置页显示出来）。
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const next = queue.then(fn, fn).catch((error) => {
      lastError = String((error && error.message) || error);
      warn('[dsh-prompt-custom] 安装队列异常（已降级）：' + lastError);
    });
    queue = next;
    return next;
  };

  const disposeEntry = async (agent) => {
    const entry = entries.get(agent);
    if (!entry) return;
    entries.delete(agent);
    if (lastAgent === agent) lastAgent = null;
    if (!entry.fiber) return;
    try { await entry.fiber.dispose(); } catch { /* agent 作用域通常已随之销毁 */ }
  };

  /**
   * 在一个 agent 的作用域里装上（或卸下）自定义节。
   * 调用方负责串行化（install / reinstallAll 已持锁）。
   */
  const installInner = async (agent) => {
    if (!agent || !agent.ctx || typeof agent.ctx.inject !== 'function') return;
    const shape = desiredShape();
    const entry = entries.get(agent);
    if (entry && entry.shape === shape) return;      // 形态没变：文本函数自己会跟上
    if (entry) await disposeEntry(agent);
    if (shape === 'off') { entries.set(agent, { shape: 'off', fiber: null }); return; }

    let fiber = null;
    try {
      fiber = agent.ctx.inject(['systemPrompt'], (scope) => {
        try {
          const sp = scope.systemPrompt;
          if (shape === 'replace') {
            // 同名才叫替换；suffix 必须**显式补空节**，否则全局 suffix 仍然生效
            // （merge 只覆盖出现过的名字）。
            sp.section({
              name: SECTION_PERSONA_PREFIX,
              order: orderOf(sp, 'DEPLOYMENT_PERSONA_PREFIX', ORDER_PERSONA_PREFIX),
              text: currentText
            });
            sp.section({
              name: SECTION_PERSONA_SUFFIX,
              order: orderOf(sp, 'DEPLOYMENT_PERSONA_SUFFIX', ORDER_PERSONA_SUFFIX),
              text: ''
            });
          } else {
            sp.section({
              name: SECTION_CUSTOM,
              order: orderOf(sp, 'DEPLOYMENT_PERSONA_SUFFIX', ORDER_PERSONA_SUFFIX) + 1,
              text: currentText
            });
          }
          lastError = null;
        } catch (error) {
          lastError = String((error && error.message) || error);
          warn('[dsh-prompt-custom] 注入失败（agent ' + (agent.id || '?') + '）：' + lastError);
        }
      });
      await fiber;                                   // 等装载完，状态才准
      entries.set(agent, { shape, fiber });
      lastAgent = agent;
      log('[dsh-prompt-custom] 已注入 agent ' + (agent.id || '?') + '：mode=' + shape);
    } catch (error) {
      lastError = String((error && error.message) || error);
      warn('[dsh-prompt-custom] agent 作用域注册失败：' + lastError);
      try { await fiber?.dispose?.(); } catch { /* ignore */ }
      entries.set(agent, { shape: 'off', fiber: null });
    }
  };

  const install = (agent) => serialize(() => installInner(agent));

  /** 配置变化后，把所有已知 agent 的注入形态刷成当前配置。 */
  const reinstallAll = () => serialize(async () => {
    for (const agent of [...entries.keys()]) await installInner(agent);
  });

  // ---- 生命周期 ----
  // 补历史 agent（宿主插件 apply 时通常为空；HMR / 后启用时才有意义）。
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined;
    const list = agents && typeof agents.list === 'function' ? agents.list() : [];
    for (const agent of list || []) install(agent);
  } catch (error) {
    warn('[dsh-prompt-custom] 补历史 agent 失败（忽略）：' + ((error && error.message) || error));
  }

  // agent/created 是 serial 且被 await 的：这里装好的节一定参与该 agent 的第一次装配。
  // 注意 listener 抛错会让会话创建失败（内核语义），所以一律吞掉并记进 lastError。
  ctx.on('agent/created', async ({ agent } = {}) => {
    if (!agent) return;
    lastAgent = agent;
    if (!entries.has(agent)) entries.set(agent, { shape: 'off', fiber: null });
    await install(agent);
  });

  ctx.on('agent/disposed', ({ agent } = {}) => {
    if (!agent) return;
    const entry = entries.get(agent);
    if (!entry) return;
    entries.delete(agent);
    if (lastAgent === agent) lastAgent = null;
    // 节本身注册在 agent 的作用域 fiber 上，会随 agent 一起销毁；这里只清记录。
    // 刻意**不 await** dispose：agent 作用域此时已在拆除，若 dispose 悬挂会卡死
    // 上面那条串行队列，让后续所有 agent 都装不上。
    try {
      const p = entry.fiber?.dispose?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* ignore */ }
  });

  const setConfig = async (next) => {
    live = normalize({ ...live, ...next });
    try { writeFileConfig(live); }
    catch (error) { warn('[dsh-prompt-custom] 持久化失败：' + ((error && error.message) || error)); }
    await reinstallAll();
    return live;
  };

  /** 给设置页用的真实状态：armed=配置就绪、injected=当前已注入的活 agent 数、lastError=内核原文。 */
  const status = () => {
    let injected = 0;
    for (const entry of entries.values()) if (entry.shape !== 'off') injected++;
    return {
      // 接口协议版本：client 半边可能因为「只刷新页面不重启」而先于宿主更新
      // （页面会重新取 index.html，从而拿到新的 client bundle；但宿主 Node 进程里的
      //  插件代码不重启就不会换）。client 靠这个字段判定错配并给出可执行的提示，
      //  否则用户只会看到一个空预览框，完全不知道发生了什么。
      proto: API_PROTO,
      armed: desiredShape() !== 'off',
      agents: entries.size,
      injected,
      lastError,
      // 配置文件里有本版本不认识的键（schema 演进保护，见文件顶部注释）
      unknownConfigKeys: detectUnknownConfigKeys(),
      path: configPath()
    };
  };

  // 变量告警必须同时挂在 /config 上（不能只在 /preview）：
  // 未知变量会让内核 renderPrompt 抛错 → **每一轮模型步都失败**，
  // 用户一进设置页就该看到这个隐患，而不是「点过预览之后」才出现。
  // 已知变量名一律从内核真实装配的 variables 里取，绝不写死（否则会误报）。
  let knownVarNames = null;
  const refreshKnownVars = async () => {
    try {
      const assembly = await ctx.systemPrompt.assemble({});
      knownVarNames = new Set(Object.keys((assembly && assembly.variables) || {}));
    } catch { /* 保持上一次的集合，宁可不报也不要误报 */ }
    return knownVarNames;
  };
  const variableWarnings = () => {
    const sink = newSink();
    if (knownVarNames) {
      // 注意：这里扫描的是**所有承载提示词文本的字段**。将来若把 text 拆成多段，
      // 必须把新字段一并加进来，否则未知变量告警会漏掉一半（后果是每轮模型步抛错）。
      for (const key of ['text']) {
        try { scanVariables(String(live[key] || ''), knownVarNames, sink); } catch { /* ignore */ }
      }
    }
    return { unknownVariables: [...sink.missing], malformedVariables: [...sink.malformed] };
  };

  /**
   * 配置文件里有本版本不认识的键 → 说明它是别的版本的插件写的。
   * 不回传就等于让「配置 schema 演进」变成又一次静默失效。
   */
  const detectUnknownConfigKeys = () => {
    try {
      const raw = readFileConfig();
      return raw ? Object.keys(raw).filter((k) => !KNOWN_CONFIG_KEYS.has(k)) : [];
    } catch { return []; }
  };

  // ---- HTTP 路由（回环限制） ----
  ctx.inject(['webServer'], (webCtx) => {
    const route = (p, handler) => {
      webCtx.effect(
        () => webCtx.webServer.register({ kind: 'exact', path: p, handler }),
        'dsh-prompt-custom: route ' + p
      );
    };

    route(CONFIG_ROUTE, async (req, res) => {
      if (!isLoopback(req)) { res.writeHead(403); res.end('forbidden'); return; }
      if (req.method === 'GET' || req.method === 'HEAD') {
        // 以磁盘为准回读一次，保证多窗口一致。
        // 注意：只更新 live 是不够的 —— 磁盘被本实例 POST 之外的方式改过（手工编辑、
        // 或另一个共享同一 $DSH_HOME 的进程写入）时，已注册的 scoped 节还停在旧形态，
        // 会出现「armed:false 但 injected:1」这种自相矛盾，甚至把官方人设整段抹掉。
        // 所以回读之后必须把注入形态对齐一次（形态没变时 installInner 会直接早退）。
        const fromDisk = readFileConfig();
        if (fromDisk) live = normalize({ ...live, ...fromDisk });
        await refreshKnownVars();
        await reinstallAll();
        sendJson(res, 200, { ok: true, config: live, ...status(), ...variableWarnings() });
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await readBody(req);
          const saved = await setConfig(body && typeof body === 'object' ? body : {});
          await refreshKnownVars();
          sendJson(res, 200, { ok: true, config: saved, ...status(), ...variableWarnings() });
        } catch (error) {
          sendJson(res, 400, { ok: false, message: String((error && error.message) || error) });
        }
        return;
      }
      res.writeHead(405, { allow: 'GET, HEAD, POST' });
      res.end();
    });

    // 预览分两份，语义必须分开：
    //   official  = assemble({})，**不含**按 agent 注入的自定义节 → 就是「官方提示词」，
    //               供用户对照着写替换内容（按钮的本来用途）。
    //   effective = assemble({agent, scope: agent})，模型这一步真正看到的全文，
    //               替换模式下能看出官方 persona 确实被遮蔽了。
    // 早期版本只返回后者并把它当 text 用，于是「预览官方提示词」里出现的是用户自己的文案 —— 已修正。
    route(PREVIEW_ROUTE, async (req, res) => {
      if (!isLoopback(req)) { res.writeHead(403); res.end('forbidden'); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
      let agent = lastAgent && entries.has(lastAgent) ? lastAgent : null;
      if (!agent) { for (const a of entries.keys()) { agent = a; break; } }
      try {
        const sink = newSink();
        const officialAssembly = await ctx.systemPrompt.assemble({});
        const official = renderSections(officialAssembly, sink);
        let effective = official;
        let sections = sectionNames(officialAssembly);
        if (agent) {
          const scopedAssembly = await ctx.systemPrompt.assemble({ agent, scope: agent });
          effective = renderSections(scopedAssembly, sink);
          sections = sectionNames(scopedAssembly);
        }
        // 单独扫一遍用户自己写的文本：它会以函数形式注入，写错变量会让每一步装配都抛错。
        await refreshKnownVars();
        sendJson(res, 200, {
          ok: true,
          official,
          effective,
          // 兼容字段：text 固定给 official（旧客户端的按钮语义就是「官方提示词」）
          text: official,
          scoped: !!agent,
          agentId: agent ? (agent.id || null) : null,
          sections,
          ...variableWarnings(),
          ...status()
        });
      } catch (error) {
        sendJson(res, 500, { ok: false, message: String((error && error.message) || error) });
      }
    });
  });
}
