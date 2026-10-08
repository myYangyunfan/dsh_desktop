/**
 * M4 — configurable prompt templates: the per-stage model-visible texts
 * (nudge frames, range table, system prompt, tool descriptions) rendered from
 * `config.prompts` templates with named placeholders.
 *
 * Design: docs/configurable-prompts-design.md (v4).
 * - placeholders are `{identifier}` only; literal braces like
 *   `compress({ content: [...] })` are left untouched (spaces/commas break the
 *   identifier rule);
 * - resolvePrompts merges user overrides over DEFAULT_PROMPTS per key
 *   (null/undefined → default, string → override; group-level null → whole
 *   group default for YAML hosts) and validates unknown placeholders at
 *   construction time (fail-fast, no silent typos);
 * - renderTemplate throws when a known placeholder has no value — callers
 *   must provide every value (e.g. tokens via a typeof fallback).
 * @module billion-context-dsh/prompts
 */
/** 用户可写值:字符串模板,或 null(= 用默认,等价于不写)。YAML 宿主写 null 是合法输入。 */
export type PromptInput = string | null;
/** 按组生成"每键可选、可 null"的覆盖类型。 */
export type PromptOverride<T> = {
    [K in keyof T]?: PromptInput;
};
export interface NudgePrompts {
    /** 普通档首句。占位符:{pct}（`{philosophy}` 仍被校验器接受,但 B6 会把渲染出的哲学段摘掉——它只能经系统提示到达模型) */
    normal: string;
    /** 紧急档首句。占位符:{pct}（`{philosophy}` 同上) */
    emergency: string;
    /** 指导行（HOW_TO_COMPRESS_RULES）。无占位符 */
    guidance: string;
    /** tier 蒸馏行。占位符:{tier} {count} {prevTier} {tokens} {seqs} {firstSeq} {lastSeq} */
    tier: string;
    /** 上下文分解。占位符:{system} {tool} {summaries} {code} {text} */
    breakdown: string;
    /** 增长行。占位符:{growth} */
    growth: string;
    /** 溢出提示。无占位符 */
    tip: string;
}
export interface RangeTablePrompts {
    /** 表头。占位符:{surface} */
    header: string;
    /** 标题。占位符:{count}(表格行数) */
    title: string;
    /** 每行。占位符:{start} {end} {count} {tokens} */
    line: string;
    /** 表尾调用语法。无占位符 */
    footer: string;
}
export interface ToolPrompts {
    /** 工具描述(纯文本,无占位符) */
    compress: string;
    decompress: string;
    searchContext: string;
    acpStatus: string;
}
export interface AcpPrompts {
    readonly nudge?: PromptOverride<NudgePrompts>;
    readonly rangeTable?: PromptOverride<RangeTablePrompts>;
    readonly tools?: PromptOverride<ToolPrompts>;
    /** 整段 system prompt 模板;`{philosophy}` 引用 kernel 的 COMPRESS_PHILOSOPHY */
    readonly systemPrompt?: PromptInput;
}
/** 解析结果 —— 所有字段已填满(纯 string,无 null)、已校验。构造一次,全程复用。 */
export interface ResolvedPrompts {
    readonly nudge: NudgePrompts;
    readonly rangeTable: RangeTablePrompts;
    readonly tools: ToolPrompts;
    /** 注意:这是【模板】(含 {philosophy}),不是渲染结果。渲染用 renderSystemPrompt。 */
    readonly systemPromptTemplate: string;
}
/**
 * 纯替换。两个契约:
 * 1. 未知占位符不可能到达这里(构建期已校验);
 * 2. 已知占位符缺值 = 编程错误 → throw(绝不静默渲染空串)。
 */
export declare function renderTemplate(template: string, vars: Record<string, string | number>): string;
/**
 * 深合并 + 校验;引擎构造期调用一次,出错即抛(fail-fast)。
 * 未传入时返回 DEFAULT_RESOLVED,零校验重跑。
 */
export declare function resolvePrompts(input?: AcpPrompts): ResolvedPrompts;
/** 渲染 system prompt 模板(注入 kernel 压缩哲学、压缩规则、蒸馏规则)。 */
export declare function renderSystemPrompt(prompts: ResolvedPrompts): string;
/**
 * 默认模板 —— 与 v4 之前的硬编码文案逐字节一致
 * (回归锚点见 tests/prompts.test.ts 的硬编码字面量快照)。
 */
export declare const DEFAULT_PROMPTS: ResolvedPrompts;
/** 模块级默认缓存:默认参/兜底直接引用,避免每次调用重跑校验。 */
export declare const DEFAULT_RESOLVED: ResolvedPrompts;
