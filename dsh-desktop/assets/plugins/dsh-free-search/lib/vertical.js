// domain_search 工具：垂直领域源直查（版本/包、学术、安全），对标 free-search-mcp 的领域引擎层（移植方案 P3-1/2/3）。
// 全部免 key 公开 JSON API；httpsJson / htmlToText 取自 fetch_upstream.js（与 #63 fetch 链同源，不依赖 research.js）。
// ponytail: 一个工具 + 引擎注册表，而非每源一工具；引擎的 claims 式自判先不做——agent 从 description 里挑引擎。


import { defineTool } from "@deepseek-ai/dsh-tools";
import { stripLoneSurrogates } from "./safe_text.js";
import { promptLanguageOf, toolDescription, toolParam, localizedEffect } from "./prompt_i18n.js";
import { ENGINES } from "./domain_engines.js";

export { ENGINES };


export function registerDomainSearchTool(ctx, { wrapUntrustedBlock, getConfig = () => ({}), ns, isToolDisabled = () => false } = {}) {
  ctx.inject(["tools"], (sctx) => {
    localizedEffect(sctx, {
      label: "free-search: domain search tool",
      ns,
      getLang: () => promptLanguageOf(getConfig()),
      getEnabled: () => !isToolDisabled("domain_search"),
      register: (lang) => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "domain_search",
          description: toolDescription(lang, "domain_search"),
          parameters: {
            engine: { type: "string", description: toolParam(lang, "domain_search", "engine", { ids: Object.keys(ENGINES).join(", ") }) },
            query: { type: "string", description: toolParam(lang, "domain_search", "query") },
          },
          output: {
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                engine: { type: "string" },
                query: { type: "string" },
                sources: { type: "array", items: { type: "object", additionalProperties: false, properties: { url: { type: "string" }, title: { type: "string" }, snippet: { type: "string" }, publishedAt: { type: "string" } } } },
                error: { type: "string" },
              },
            },
            render(_args, value) {
              if (value.error) {
                const message = stripLoneSurrogates(String(value.error));
                return [{ type: "text", text: `domain_search (${value.engine}) failed: ${message}` }];
              }
              const lines = value.sources.map((s, i) => `- [${i + 1}] ${s.title} — ${s.url}${s.publishedAt ? ` _(${s.publishedAt})_` : ""}${s.snippet ? `\n      ${s.snippet}` : ""}`);
              return [{ type: "text", text: wrapUntrustedBlock(`domain_search ${value.engine} — ${value.query}:\n${lines.join("\n") || "No results."}`) }];
            },
          },
          async execute(args) {
            const engine = ENGINES[args.engine];
            if (!engine) return { engine: args.engine, query: args.query, sources: [], error: `unknown engine; valid: ${Object.keys(ENGINES).join(", ")}` };
            try {
              const sources = await engine.run(args.query);
              return { engine: args.engine, query: args.query, sources };
            } catch (e) {
              return { engine: args.engine, query: args.query, sources: [], error: e.message };
            }
          },
        })
      );
      return () => dispose();
    } });
  });
}
