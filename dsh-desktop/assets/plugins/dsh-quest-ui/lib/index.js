// Host-side entry for dsh-quest-ui:
// registers the durable settings namespace used by the General-settings toggle.
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

const name = "@deepseek-ai/dsh-quest-ui";
const inject = ["settings"];

const NS = settingsNamespace("dsh-quest-ui");
const Config = z.object({
  questMode: z.boolean().default(false)
});

function apply(ctx, config) {
  // 与 conversation-tweaks 相同的降级策略：register 抛异常时只告警，
  // 绝不阻断 dsh 启动（fail-loud 语义下插件 fiber 失败会崩启动）。
  try {
    const scope = ctx.settings.register(NS, Config, { base: config || {} });
    return () => { void scope; };
  } catch (error) {
    console.warn("[dsh-quest-ui] settings section unavailable: " + ((error && error.message) || error));
  }
}

export { Config, apply, inject, name };
