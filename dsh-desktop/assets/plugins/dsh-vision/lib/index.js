/**
 * dsh-vision: eyes for a text-only model. Registers a `view_image` tool that
 * forwards the model's question about an image to an OpenAI-compatible VLM
 * endpoint and returns the answer as text. Backend is fully configurable —
 * Zhipu's free glm-4.6v-flash (default), DashScope, Ark, a local Ollama, or
 * DeepSeek's own vision API the day it ships (users' existing key then just works).
 * @module dsh-vision
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { visionChat } from './vlm.js';
export const name = 'dsh-vision';
export const inject = ['tools', 'systemPrompt', 'settings'];
const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
/** Zhipu's free tier gets congested (HTTP 429 code 1305); older free models still answer. */
const DEFAULT_FREE_FALLBACKS = ['glm-4.1v-thinking-flash', 'glm-4v-flash'];
/** Errors worth trying the next model for: rate limit, missing model, server trouble. */
const RETRIABLE = /returned (?:429|404|5\d\d)/;
export const Config = z.object({
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
const NS = settingsNamespace('dsh-vision');
// 配置的 getter；setSource 会被替换为 settings scope 读取器（热生效）。
let liveConfig = () => ({});

const PROMPT_TEXT = `## Vision (view_image)
The chat model itself cannot see images, but the view_image tool can. Whenever an image matters — a screenshot path the user mentions, an image URL, a chart, a UI mockup — call view_image instead of guessing or refusing. Ask it a specific question (extract text, count objects, read a chart, describe the layout); it answers arbitrary questions, not just captions. Prefer one focused call per thing you need to know; ask a follow-up call rather than one vague question.`;
const TEXT_OUTPUT = {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
};
export function apply(ctx, config) {
    liveConfig = () => config || {};
    installSettingsSection(ctx, NS, Config, config || {}, {
        setSource: (source) => {
            liveConfig = source;
        },
        onChange: () => {
            const cfg = liveConfig() || {};
            console.log("[dsh-vision] settings updated: " + JSON.stringify({ baseURL: cfg.baseURL, model: cfg.model, apiKey: cfg.apiKey ? "***" : "" }));
        }
    });
    // 每次调用都从热配置计算，设置页保存后无需重启服务即可生效。
    const current = () => {
        const cfg = liveConfig() || {};
        const baseURL = cfg.baseURL ?? DEFAULT_BASE_URL;
        const model = cfg.model ?? "glm-4.6v-flash";
        const fallbackModels = Array.isArray(cfg.fallbackModels) && cfg.fallbackModels.length > 0
            ? cfg.fallbackModels
            : baseURL === DEFAULT_BASE_URL && model === "glm-4.6v-flash" ? DEFAULT_FREE_FALLBACKS : [];
        return {
            baseURL,
            model,
            fallbackModels,
            maxTokens: cfg.maxTokens ?? 2048,
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
    ctx.effect(() => ctx.tools.register(defineTool({
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
            const input = args;
            const source = typeof input.source === 'string' ? input.source : '';
            if (source === '')
                throw new Error('view_image: source is required');
            const question = typeof input.question === 'string' && input.question !== ''
                ? input.question
                : 'Describe this image thoroughly. Include any visible text verbatim, the overall layout, and notable details.';
            const resolved = current();
            const apiKey = resolveApiKey();
            let lastError;
            for (const model of [resolved.model, ...resolved.fallbackModels]) {
                try {
                    return await visionChat({ ...resolved, model, apiKey, source, question, signal: exec.signal });
                }
                catch (error) {
                    lastError = error;
                    if (!(error instanceof Error) || !RETRIABLE.test(error.message))
                        throw error;
                }
            }
            throw lastError;
        },
    })), 'dsh-vision.tool');
    ctx.effect(() => ctx.systemPrompt.section({
        name: 'tool:dsh-vision',
        order: 116,
        text: PROMPT_TEXT,
    }), 'dsh-vision.prompt');
}
