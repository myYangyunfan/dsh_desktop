/**
 * dsh-vision: eyes for a text-only model. Registers a `view_image` tool that
 * forwards the model's question about an image to an OpenAI-compatible VLM
 * endpoint and returns the answer as text. Backend is fully configurable —
 * Zhipu's free glm-4.6v-flash (default), DashScope, Ark, a local Ollama, or
 * DeepSeek's own vision API the day it ships (users' existing key then just works).
 *
 * Multimodal-feel layer: images the user attaches directly to a message
 * (composer attach button / paste / drop) are intercepted at the `llm/stream`
 * waterfall — the LLM service's per-call boundary — and replaced with their
 * VLM recognition text BEFORE the (text-only) LLM adapter sees them. The
 * interception rewrites only the request copy that goes to the model; the
 * session log keeps the original message with its image attachment, so the
 * user interface always shows the picture cards and the recognition text
 * never leaks back into the conversation. Recognition failures degrade to an
 * explanatory text block and never block the conversation.
 *
 * Prompt-gate cooperation: the host apiproxy rejects image content at
 * prompt time when the selected model's inputModalities exclude "image"
 * (MODEL_DOES_NOT_SUPPORT_IMAGES), which fires BEFORE this plugin's
 * llm/stream interception ever runs. This plugin therefore wraps every LLM
 * adapter's resolveModel/listModels to declare image input for models that
 * claim text-only — the image is admitted, then converted to text here, so
 * the text-only model never actually sees it. The wrap records each model's
 * ORIGINAL capability in a native-support cache; the llm/stream interception
 * consults that cache and passes images through untouched for models that
 * are natively multimodal (e.g. pi-ai).
 * @module dsh-vision
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';

import { visionChat } from './vlm.js';
export const name = 'dsh-vision';
export const inject = ['tools', 'systemPrompt', 'settings', 'llm', 'attachments'];
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4.6v-flash';
/** Zhipu's free tier gets congested (HTTP 429 code 1305); older free models still answer. */
const DEFAULT_FREE_FALLBACKS = ['glm-4.1v-thinking-flash', 'glm-4v-flash'];
/** Errors worth trying the next model for: rate limit, missing model, server trouble. */
const RETRIABLE = /returned (?:429|404|5\d\d)/;
/**
 * Zhipu's older free vision models cap max_tokens at 1024 (HTTP 400 code 1210
 * "max_tokens参数非法"). The plugin default is 2048 (tuned for glm-4.6v-flash),
 * so a stored config that selects a legacy model 400s on every call and the
 * fallback chain never runs (400 is not in RETRIABLE). Clamp the budget for
 * these models instead of forcing users to know per-model limits.
 */
const LEGACY_1K_CAP_MODELS = new Set(['glm-4v-flash', 'glm-4.1v-thinking-flash']);
/**
 * Any HTTP 400 from the endpoint may be a max_tokens-over-cap rejection (Zhipu
 * replies "code 1210 max_tokens参数非法"; the body wording can change, and the
 * code may be the only stable signal). Matching plain `returned 400` keeps the
 * downgrade retry working even if the message text drifts — the cost of one
 * extra request is far lower than silently missing the rejection.
 */
const MAX_TOKENS_REJECTED = /returned 400/;
export const Config = z.object({
    enabled: z.boolean().default(false)
        .description('Master switch (default OFF) — false disables image admission, automatic attach-image recognition, the view_image tool, and the prompt section (natively multimodal models are untouched); turn it on in Settings → 识图插件（view_image）'),
    baseURL: z.string().default(DEFAULT_BASE_URL)
        .description('OpenAI-compatible endpoint base URL (…/chat/completions is appended)'),
    apiKey: z.string().role('secret').default('')
        .description('API key; falls back to $DSH_VISION_API_KEY, then $ZHIPUAI_API_KEY / $DASHSCOPE_API_KEY'),
    model: z.string().default('glm-4.6v-flash')
        .description('Vision model id at the endpoint, e.g. glm-4.6v-flash (free) / glm-4.6v / qwen3-vl-flash / qwen3.7-plus / qwen3-vl:4b'),
    fallbackModels: z.array(z.string()).default([])
        .description('Models tried in order when the primary returns 429/404/5xx; defaults to Zhipu free-tier chain when baseURL is the default'),
    maxTokens: z.number().step(1).min(1).max(32_768).default(2048),
    timeoutMs: z.number().step(1).min(1_000).max(300_000).default(60_000),
    maxImageBytes: z.number().step(1).min(1).default(10 * 1024 * 1024),
});
const NS = 'dsh-vision';
// 配置的 getter；setSource 会被替换为 settings scope 读取器（热生效）。
let liveConfig = () => ({});

const PROMPT_TEXT = `## Vision (view_image)
The chat model itself cannot see images, but the view_image tool can. Whenever an image matters — a screenshot path the user mentions, an image URL, a chart, a UI mockup — call view_image instead of guessing or refusing. Ask it a specific question (extract text, count objects, read a chart, describe the layout); it answers arbitrary questions, not just captions. Prefer one focused call per thing you need to know; ask a follow-up call rather than one vague question.
Images the user attaches to a message are recognized automatically in the background and arrive as "[图片] 识别结果" text blocks — treat them as ordinary text context (the image itself never reaches a text-only model; natively multimodal models receive the original image). The user interface keeps showing the original picture.`;
const TEXT_OUTPUT = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
};

/**
 * Cache cap for per-attachment recognition text. A turn re-claims messages on
 * later steps and the same attachment can legitimately recur across a long
 * session; caching the text avoids re-calling the VLM for the same bytes,
 * while the cap keeps memory bounded.
 */
const IMAGE_TEXT_CACHE_LIMIT = 64;

/**
 * Ask the configured VLM chain one question about one image (primary model,
 * then fallbacks on 429/404/5xx, plus the 1024-token downgrade retry for
 * legacy models). Reused by both the `view_image` tool and the automatic
 * attach-image recognition.
 * @param resolved - effective config from {@link current}.
 * @param apiKey - resolved key ('' for keyless local endpoints).
 * @param source - image as http(s)/data: URL (auto path already base64s bytes).
 * @param question - what to find out about the image.
 * @param signal - turn cancellation.
 * @returns the recognition text.
 * @throws the last error when every model failed.
 */
export async function recognizeWithFallbacks(resolved, apiKey, source, question, signal) {
    let lastError;
    for (const model of [resolved.model, ...resolved.fallbackModels]) {
        try {
            return await visionChat({ ...resolved, model, apiKey, source, question, signal });
        }
        catch (error) {
            lastError = error;
            if (!(error instanceof Error)) throw error;
            // 400（可能是 max_tokens 超上限，如智谱 code 1210）：降档到 1024
            // 重试同一模型一次，而不是直接放弃——fallback 链只对 429/404/5xx 生效。
            if (MAX_TOKENS_REJECTED.test(error.message) && resolved.maxTokens > 1024) {
                try {
                    return await visionChat({ ...resolved, model, apiKey, source, question, maxTokens: 1024, signal });
                }
                catch (error2) {
                    lastError = error2;
                    if (!(error2 instanceof Error) || !RETRIABLE.test(error2.message)) throw error2;
                    continue;
                }
            }
            if (!RETRIABLE.test(error.message)) throw error;
        }
    }
    throw lastError;
}

/**
 * Recognize one image block into text. NEVER throws: every failure (invalid
 * ref, oversized image, attachment store outage, VLM error, abort) degrades
 * to an explanatory text block so the conversation always proceeds.
 * @param block - the image content block ({type:'image', attachment: ref}).
 * @param question - user message text ('' when the message is image-only).
 * @param deps - { readImage, recognize, signal, maxImageBytes, cache }.
 */
async function describeImageBlock(block, question, deps) {
    const ref = block && block.attachment;
    if (!ref || typeof ref !== 'object' || typeof ref.attachmentId !== 'string' || typeof ref.mediaType !== 'string') {
        return '[图片未识别] 附件引用无效，该图片被跳过。';
    }
    const cache = deps.cache;
    if (cache) {
        const cached = cache.get(ref.attachmentId);
        if (cached !== undefined) return cached;
    }
    let text;
    try {
        const maxBytes = typeof deps.maxImageBytes === 'number' ? deps.maxImageBytes : 10 * 1024 * 1024;
        if (typeof ref.bytes === 'number' && ref.bytes > maxBytes) {
            text = `[图片未识别] 图片 ${ref.bytes} 字节超过 ${maxBytes} 字节上限（可在识图插件设置中调大 maxImageBytes）。`;
        }
        else {
            const { readImage, recognize } = deps;
            const read = await readImage(ref, deps.signal);
            const data = read && read.data instanceof Uint8Array ? read.data : read;
            if (!(data instanceof Uint8Array)) throw new Error('附件读取未返回图像字节');
            const source = `data:${ref.mediaType};base64,${Buffer.from(data).toString('base64')}`;
            const questionText = typeof question === 'string' && question.trim() !== ''
                ? question
                : '请描述这张图片：包括所有可见文字（逐字）、整体布局与值得注意的细节。';
            text = await recognize(source, questionText, deps.signal);
        }
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        text = `[图片识别失败] ${reason}（已跳过该图片，其余对话不受影响）。`;
    }
    if (cache) {
        if (cache.size >= IMAGE_TEXT_CACHE_LIMIT) cache.clear();
        cache.set(ref.attachmentId, text);
    }
    return text;
}

/**
 * Replace every image block in the claimed messages with its recognition
 * text. Pure over the injected deps, so it is unit-testable without cordis.
 * Messages without images pass through untouched (changed=false, zero cost).
 * @param messages - request message array (llm/stream options.messages).
 * @param deps - { readImage(ref, signal), recognize(source, question, signal),
 *   signal?, maxImageBytes?, cache? (Map)}.
 * @returns { messages, changed }.
 */
export async function convertMessagesWithImages(messages, deps) {
    if (!Array.isArray(messages)) return { messages, changed: false };
    let changed = false;
    const out = [];
    for (const message of messages) {
        if (!message || !Array.isArray(message.content)) {
            out.push(message);
            continue;
        }
        const imageBlocks = message.content.filter((b) => b && b.type === 'image');
        if (imageBlocks.length === 0) {
            out.push(message);
            continue;
        }
        changed = true;
        // 用户消息里的文本部分就是识别问题（贴合「这张图里写了什么」这类问法）。
        const question = message.content
            .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text)
            .join('')
            .trim();
        const blocks = [];
        let index = 0;
        for (const block of message.content) {
            if (!block || block.type !== 'image') {
                blocks.push(block);
                continue;
            }
            index += 1;
            const label = imageBlocks.length > 1 ? `[图片 ${index}/${imageBlocks.length}]` : '[图片]';
            const description = await describeImageBlock(block, question, deps);
            blocks.push({ type: 'text', text: `${label} 识别结果：\n${description}` });
        }
        out.push({ ...message, content: blocks });
    }
    return { messages: out, changed };
}

/**
 * Wrap one LLM adapter so text-only models declare image input. The host
 * apiproxy's prompt-time gate (inputModalities check) would otherwise reject
 * attached images as MODEL_DOES_NOT_SUPPORT_IMAGES before this plugin's
 * llm/stream interception can convert them to text. Prototype-inherited
 * (Object.create) like dsh-third-party-thinking, so wrapper chains from other
 * plugins compose.
 *
 * The ORIGINAL capability of every resolved model is recorded in
 * nativeImageSupport (provider+"\0"+model -> boolean). The llm/stream
 * interception reads that cache to pass images through untouched for natively
 * multimodal models.
 *
 * IMPORTANT: resolveModel here only RECORDS capability and returns the info
 * UNCHANGED. Adding "image" is done exclusively by the llm service instance
 * wrap (wrapVisionResolveModelInfo below) — if both wraps added "image", each
 * would pollute the other's native-capability reading. listModels adds "image"
 * for UI consistency only (model pickers never drive the prompt gate), and only
 * while the master switch is on (isEnabled callback, default always-true for
 * the exported pure function).
 * @param adapter - the registration's current adapter (possibly already
 *   wrapped by another plugin).
 * @param provider - provider id the adapter is registered under.
 * @param nativeImageSupport - Map<string, boolean> recording native capability.
 * @param isEnabled - optional () => boolean; false suspends the listModels
 *   image declaration (capability recording continues — harmless, and the
 *   cache stays warm for a later re-enable).
 * @returns the wrapped adapter (same reference when already wrapped).
 */
export function wrapVisionAdapter(adapter, provider, nativeImageSupport, isEnabled = () => true) {
    if (!adapter || adapter.__dshVisionWrapped) return adapter;
    const wrapped = Object.create(adapter);
    wrapped.__dshVisionWrapped = true;
    wrapped.resolveModel = async (providerId, model, signal) => {
        const info = await adapter.resolveModel(providerId, model, signal);
        const modalities = info && Array.isArray(info.inputModalities) ? info.inputModalities : undefined;
        const nativeSupportsImages = modalities !== undefined && modalities.includes('image');
        if (typeof providerId === 'string' && typeof model === 'string') {
            nativeImageSupport.set(providerId + '\0' + model, nativeSupportsImages);
        }
        return info;
    };
    wrapped.listModels = async (providerId) => {
        const models = await adapter.listModels(providerId);
        if (!Array.isArray(models) || !isEnabled()) return models;
        return models.map((m) => {
            const mods = m && Array.isArray(m.inputModalities) ? m.inputModalities : undefined;
            if (mods !== undefined && mods.includes('image')) return m;
            return { ...m, inputModalities: [...(mods ?? ['text']), 'image'] };
        });
    };
    return wrapped;
}

/**
 * Wrap the llm SERVICE instance method `resolveModelInfo` so the host prompt
 * gate (dsh-host-apiproxy) sees "image" in inputModalities for every model.
 * This is the reliable admission path: the host gate always calls
 * `ctx.llm.resolveModelInfo`, and the llm service instance already exists when
 * this plugin applies (it is declared in `inject`), so the wrap cannot miss
 * its window the way the adapter-registry wrap did (adapters may register
 * after this plugin's apply).
 *
 * The ORIGINAL capability is recorded into nativeImageSupport for the
 * llm/stream handler (asking the wrapped method again would be polluted — it
 * now always includes "image"). Idempotent per service instance via
 * `service.__dshVisionResolveWrapped`. Returns a restore function, or
 * undefined when nothing was wrapped (missing method / already wrapped).
 *
 * While the optional isEnabled callback resolves false (master switch off) the
 * wrapped method returns the info UNCHANGED — no "image" is admitted, so the
 * host prompt gate rejects attached images for text-only models exactly as it
 * would without this plugin (recording still happens; it is read-only and
 * keeps the native-capability cache warm for a later re-enable).
 * @param service - the llm service object (ctx.llm).
 * @param nativeImageSupport - Map<string, boolean> recording native capability.
 * @param isEnabled - optional () => boolean consulted per call (hot config).
 * @returns restore function | undefined.
 */
export function wrapVisionResolveModelInfo(service, nativeImageSupport, isEnabled = () => true) {
    if (!service || typeof service.resolveModelInfo !== 'function') return undefined;
    if (service.__dshVisionResolveWrapped) return undefined;
    const hadOwn = Object.prototype.hasOwnProperty.call(service, 'resolveModelInfo');
    const original = service.resolveModelInfo;
    const bound = typeof original.bind === 'function' ? original.bind(service) : original;
    const wrapped = async (provider, model, signal) => {
        const info = await bound(provider, model, signal);
        const modalities = info && Array.isArray(info.inputModalities) ? info.inputModalities : undefined;
        const nativeSupportsImages = modalities !== undefined && modalities.includes('image');
        if (typeof provider === 'string' && typeof model === 'string') {
            nativeImageSupport.set(provider + '\0' + model, nativeSupportsImages);
        }
        if (modalities === undefined || nativeSupportsImages || !isEnabled()) return info;
        // Text-only model: admit the image at the prompt gate — this plugin
        // converts it to recognition text in llm/stream before the adapter
        // ever sees it.
        return { ...info, inputModalities: [...modalities, 'image'] };
    };
    service.__dshVisionResolveWrapped = { hadOwn, bound };
    service.resolveModelInfo = wrapped;
    console.log('[dsh-vision] wrapped llm.resolveModelInfo service method for image-input admission');
    return () => {
        if (!service.__dshVisionResolveWrapped) return;
        const entry = service.__dshVisionResolveWrapped;
        delete service.__dshVisionResolveWrapped;
        if (entry.hadOwn) service.resolveModelInfo = entry.bound;
        else delete service.resolveModelInfo; // fall back to the prototype method
    };
}

/**
 * Apply every vision admission wrap: the llm service instance method
 * (reliable gate admission) plus every registered adapter (listModels UI
 * consistency + native-capability recording). Re-runs on llm/adapters-updated
 * so adapters registered after this plugin's apply are covered too. Never
 * throws (logging only) — a wrap failure must not take the plugin fiber down.
 * @returns the service-method restore function collected from the wrap (or
 *   undefined); the caller's teardown effect replays it verbatim instead of
 *   re-implementing the unwrap steps.
 */
function applyVisionWraps(ctx, nativeImageSupport, isEnabled) {
    let restoreService;
    try {
        if (ctx.llm) {
            restoreService = wrapVisionResolveModelInfo(ctx.llm, nativeImageSupport, isEnabled);
            if (ctx.llm.adapters) {
                let wrappedCount = 0;
                for (const [provider, registration] of ctx.llm.adapters) {
                    if (!registration || !registration.adapter) continue;
                    if (registration.adapter.__dshVisionWrapped) continue;
                    registration.adapter = wrapVisionAdapter(registration.adapter, provider, nativeImageSupport, isEnabled);
                    wrappedCount += 1;
                }
                if (wrappedCount > 0) {
                    console.log('[dsh-vision] wrapped ' + wrappedCount + ' LLM adapter(s) for vision admission');
                }
            }
        }
    }
    catch (error) {
        console.warn('[dsh-vision] vision wrap failed: ' + ((error && error.message) || error));
    }
    return restoreService;
}

export function apply(ctx, config) {
    liveConfig = () => config || {};
    // settings 已在本插件 inject 中声明，apply 时服务必在；直接同步注册并
    // try/catch：存储的 dsh-vision 配置节非法会让 register() 抛异常 → 插件
    // fiber 失败 → dsh fail-loud 启动崩溃。降级为组合配置继续运行（不阻断启动）。
    try {
        const scope = ctx.settings.register(NS, Config, { base: config || {} });
        liveConfig = () => scope.get();
        scope.watch(() => {
            const cfg = liveConfig() || {};
            console.log("[dsh-vision] settings updated: " + JSON.stringify({ enabled: cfg.enabled, baseURL: cfg.baseURL, model: cfg.model, apiKey: cfg.apiKey ? "***" : "" }));
            syncEnabledSurfaces();
        });
    } catch (error) {
        console.warn("[dsh-vision] settings section unavailable (invalid stored config); falling back to composition config: " + ((error && error.message) || error));
    }
    // 每次调用都从热配置计算，设置页保存后无需重启服务即可生效。
    const current = () => {
        const cfg = liveConfig() || {};
        const baseURL = cfg.baseURL ?? DEFAULT_BASE_URL;
        const model = cfg.model ?? DEFAULT_MODEL;
        const fallbackModels = Array.isArray(cfg.fallbackModels) && cfg.fallbackModels.length > 0
            ? cfg.fallbackModels
            : baseURL === DEFAULT_BASE_URL && model === DEFAULT_MODEL ? DEFAULT_FREE_FALLBACKS : [];
        // 旧模型（glm-4v-flash 等）max_tokens 上限 1024：默认 2048 必然 400，直接钳制。
        const maxTokens = LEGACY_1K_CAP_MODELS.has(model)
            ? Math.min(cfg.maxTokens ?? 2048, 1024)
            : cfg.maxTokens ?? 2048;
        return {
            // 总开关：默认 false（用户要求内置识图默认关闭；可在设置页打开）。
            // settings 路径下 scope.get() 已按 schema 解析出布尔值，此处的 ??
            // 仅覆盖 settings 注册失败的降级路径（组合配置未显式给出时同样默认关）。
            enabled: cfg.enabled ?? false,
            baseURL,
            model,
            fallbackModels,
            maxTokens,
            timeoutMs: cfg.timeoutMs ?? 60_000,
            maxImageBytes: cfg.maxImageBytes ?? 10 * 1024 * 1024,
        };
    };
    // Key is resolved per call, not at mount: the plugin loads fine without one
    // and the tool explains exactly where to put it. Local endpoints need none.
    const resolveApiKey = () => {
        const cfg = liveConfig() || {};
        const resolved = current();
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(resolved.baseURL);
        const key = cfg.apiKey !== undefined && cfg.apiKey !== "" ? cfg.apiKey
            : process.env.DSH_VISION_API_KEY ?? process.env.ZHIPUAI_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
        if (key === "" && !isLocal) {
            throw new Error("view_image: no API key. Set the dsh-vision apiKey in Settings, or export DSH_VISION_API_KEY (also honored: ZHIPUAI_API_KEY, DASHSCOPE_API_KEY). The default model glm-4.6v-flash is FREE — create a key at https://open.bigmodel.cn. Offline alternative: baseURL http://localhost:11434/v1 + an Ollama vision model, no key needed.");
        }
        return key;
    };
    // —— 总开关的面（surfaces）：enabled=false 时撤下 view_image 工具与系统
    // 提示段，true 时恢复。两处注册器都返回注销函数，开关热切换即时生效；
    // 插件 fiber 卸载时统一回收（含当前处于开启态的部分）。
    let offTool = null;
    let offPrompt = null;
    function syncEnabledSurfaces() {
        const enabled = current().enabled;
        if (!enabled) {
            if (offTool !== null) { offTool(); offTool = null; }
            if (offPrompt !== null) { offPrompt(); offPrompt = null; }
            return;
        }
        if (offTool === null) {
            offTool = ctx.tools.register(defineTool({
                name: 'view_image',
                description: 'Look at an image and answer a question about it (OCR, counting, chart reading, layout, arbitrary visual questions). Accepts an absolute local file path, an http(s) URL, or a data: URL.',
                parameters: {
                    source: {
                        type: 'string',
                        required: true,
                        description: 'The image: absolute local file path, http(s) URL, or data: URL',
                    },
                    question: {
                        type: 'string',
                        description: 'What to find out about the image. Be specific. Default: a thorough general description including any visible text.',
                    },
                },
                output: TEXT_OUTPUT,
                timeoutMs: current().timeoutMs,
                isConcurrencySafe: () => true,
                execute: async (args, exec) => {
                    // 开关关闭时工具本应已撤下；此处兜底（toggle 竞态窗口内的
                    // 在途调用）保证「关闭 = vision admission 不生效」语义完整。
                    if (!current().enabled) {
                        throw new Error('view_image: 识图能力已关闭。可在 设置 → 识图插件（view_image） 顶部打开「启用识图」开关后重试。');
                    }
                    const input = args;
                    const source = typeof input.source === 'string' ? input.source : '';
                    if (source === '')
                        throw new Error('view_image: source is required');
                    const question = typeof input.question === 'string' && input.question !== ''
                        ? input.question
                        : 'Describe this image thoroughly. Include any visible text verbatim, the overall layout, and notable details.';
                    return recognizeWithFallbacks(current(), resolveApiKey(), source, question, exec.signal);
                },
            }));
        }
        if (offPrompt === null) {
            offPrompt = ctx.systemPrompt.section({
                name: 'tool:dsh-vision',
                order: 116,
                text: PROMPT_TEXT,
            });
        }
    }
    ctx.effect(() => {
        syncEnabledSurfaces();
        return () => {
            if (offTool !== null) { offTool(); offTool = null; }
            if (offPrompt !== null) { offPrompt(); offPrompt = null; }
        };
    }, 'dsh-vision.capability');
    // —— 多模态体感：用户直接发图 → 后台 VLM 识别后以文本送入纯文本模型 ——
    // 拦截点选在 llm/stream（LLM 服务的每次流式调用 waterfall，payload 是
    // request 信封，含 messages）。它比 agent/pre-step 更靠后、更干净：替换
    // 只作用于「送进模型的消息副本」，session 里 append 的仍是原始消息
    // （image block 原样）→ 用户界面始终显示图片卡片，识别文本永不回流 UI。
    // llm/stream 是同步链（listener 必须同步返回流，fallback 是流工厂）；
    // 识别是异步的，所以返回一个包装 async generator：先 await 识别，再以
    // 转换后的消息重入 llm.stream()（带防重入标记，完整链含校验重走一遍）。
    const VISION_CONVERTED = Symbol('dsh-vision.converted');
    const imageTextCache = new Map();
    // 原生能力缓存：adapter wrap 时记录「模型本身是否支持 image」（不被本
    // 插件的 inputModalities 声明污染）。llm/stream 拦截据此决定：原生多模
    // 态模型（如 pi-ai）原图透传；文本型模型走 VLM 识别替换。
    const nativeImageSupport = new Map();
    const visionHandler = createLlmStreamHandler({
        // 总开关关闭时拦截器整体透明（不识别、不替换、不重入）。
        isEnabled: () => current().enabled,
        convert: async (messages, signal) => {
            // attachments 已在 inject 中声明，cordis 会在装配时校验服务存在
            // （宿主 prompt 入口的 saveImage 依赖同一服务，必然已装配）；
            // 此前用 try/catch 可选访问反而把 Proxy 的
            // "cannot get property "attachments" without inject" 吞成 undefined。
            const attachments = ctx.attachments;
            return convertMessagesWithImages(messages, {
                readImage: async (ref, sig) => {
                    if (!attachments || typeof attachments.readImage !== 'function') {
                        throw new Error('附件存储服务不可用（attachments.readImage 缺失）');
                    }
                    return attachments.readImage(ref, sig);
                },
                recognize: (source, question, sig) =>
                    recognizeWithFallbacks(current(), resolveApiKey(), source, question, sig),
                signal,
                cache: imageTextCache,
                maxImageBytes: current().maxImageBytes,
            });
        },
        getLlm: () => {
            try { return ctx.get('llm'); } catch { return undefined; }
        },
        markerKey: VISION_CONVERTED,
        supportsImages: async (options) => {
            const provider = options && options.provider;
            const model = options && options.model;
            if (typeof provider !== 'string' || typeof model !== 'string') return false;
            // 未命中时保守 false（识别替换）——DeepSeek 等文本型模型最常见；
            // host 的 prompt 检查会先调 resolveModel（本插件 wrap 版）填好缓存。
            return nativeImageSupport.get(provider + '\0' + model) === true;
        },
    });
    ctx.effect(() => ctx.on('llm/stream', visionHandler, { global: true, prepend: true }), 'dsh-vision.llm-stream');
    // 放行 prompt 入口的 inputModalities 检查：文本型模型由本插件声明 image
    // （图片会在 llm/stream 转成文本）。服务实例方法 wrap 在 apply 时立即生
    // 效（llm 服务已在 inject 中装配）；adapter 后注册的（热装配）经
    // llm/adapters-updated 重打——必须 {global:true}：该事件从 llm 服务作用
    // 域发出，插件作用域不在其祖先链上，非 global 监听永远收不到（上一版
    // 修复失败的根因）。总开关经 isEnabled 每次调用现查（热生效），关闭时
    // 不再声明 image，host prompt 门槛自然回到「文本模型拒绝图片」。
    const isEnabled = () => current().enabled;
    const restoreVisionService = applyVisionWraps(ctx, nativeImageSupport, isEnabled);
    ctx.effect(() => ctx.on('llm/adapters-updated', () => applyVisionWraps(ctx, nativeImageSupport, isEnabled), { global: true }), 'dsh-vision.vision-wrap');
    // 插件 fiber 卸载时恢复服务方法（防热重载叠加/污染）——直接复用 wrap
    // 返回的 restore，避免第二份手写 unwrap 漂移。
    ctx.effect(() => () => {
        try {
            if (restoreVisionService) restoreVisionService();
        } catch { /* 清理失败不阻断卸载 */ }
    }, 'dsh-vision.vision-unwrap');
}

/**
 * Build the `llm/stream` waterfall listener that rewrites image-bearing
 * request messages into their recognition text. Pure over the injected deps,
 * so it is unit-testable without cordis.
 *
 * Contract: the listener is synchronous (the waterfall returns its value
 * verbatim and the consumer `for await`s it as a stream). Image recognition
 * is async, so for requests that actually contain image blocks the listener
 * returns a wrapping async generator that (1) awaits the conversion, (2)
 * re-enters `llm.stream()` with the converted messages plus a re-entry marker
 * when anything changed, or (3) falls through to the original chain via
 * `next()` when nothing changed or the LLM service is unavailable. Requests
 * without images (and already-marked re-entries) pass through untouched.
 * When `deps.supportsImages` is provided and resolves true for a request
 * (natively multimodal model, e.g. pi-ai), the request falls through to
 * `next()` untouched so the model receives the real image.
 * When `deps.isEnabled` is provided and resolves false (master switch off),
 * the listener is fully transparent: every request falls through to `next()`
 * — no recognition, no rewrite, no re-entry (images are then stopped earlier,
 * at the host prompt gate, which no longer admits them).
 * @param deps - { convert(messages, signal) → Promise<{messages, changed}>,
 *   getLlm() → {stream(options)}, markerKey (Symbol),
 *   supportsImages?(options) → Promise<boolean>,
 *   isEnabled?() → boolean }.
 * @returns the (options, next) => stream listener.
 */
export function createLlmStreamHandler(deps) {
    const hasImageBlocks = (messages) => Array.isArray(messages) && messages.some((m) =>
        m && Array.isArray(m.content) && m.content.some((b) => b && b.type === 'image'));
    return (options, next) => {
        if (options === null || typeof options !== 'object') return next();
        if (deps.markerKey !== undefined && options[deps.markerKey] === true) return next();
        if (deps.isEnabled !== undefined && !deps.isEnabled()) return next();
        if (!hasImageBlocks(options.messages)) return next();
        const signal = options && options.signal !== undefined ? options.signal : undefined;
        return (async function* () {
            // 原生多模态模型：原图透传（不做识别替换）；判定失败时保守走识别。
            if (typeof deps.supportsImages === 'function') {
                try {
                    if (await deps.supportsImages(options)) {
                        yield* next();
                        return;
                    }
                }
                catch (error) {
                    console.warn('[dsh-vision] native image support check failed, converting images anyway: ' + ((error instanceof Error ? error.message : String(error)) || error));
                }
            }
            let messages = options.messages;
            try {
                const converted = await deps.convert(options.messages, signal);
                if (converted && converted.changed && Array.isArray(converted.messages)) {
                    messages = converted.messages;
                }
            }
            catch (error) {
                console.warn('[dsh-vision] recognition failed, sending original messages: ' + ((error instanceof Error ? error.message : String(error)) || error));
            }
            if (messages === options.messages) {
                yield* next();
                return;
            }
            let llm;
            try { llm = deps.getLlm(); } catch { llm = undefined; }
            if (!llm || typeof llm.stream !== 'function') {
                yield* next();
                return;
            }
            const marked = deps.markerKey === undefined ? options : { ...options, [deps.markerKey]: true };
            yield* llm.stream({ ...marked, messages });
        })();
    };
}
