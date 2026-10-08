// Host-side entry for dsh-conversation-tweaks: 声明设置形状。
//
// 这里原先调 `ctx.settings.register(NS, Config, {base})` 去「注册一个持久化命名空间」，
// 但内核 0.1.7-rc.1 的 SettingsForms 根本没有 register（全内核 0 处命中），
// 于是 apply 里抛 TypeError，被 try/catch 降级成一行 warn ⇒ 设置静默存不住。
//
// 声明式形状才是真的：插件导出 `Config`，cordis 的 resolveConfig() 拿它校验 profile 行的
// `config:`；只要有一个 `.volatile()` 字段，`settings.describe()` 就会收录本条目
// （它按 **profile 条目 id** 索引，这里是 `conversation-tweaks`），
// 页内 bundle 便能用 `ctx.remote.settings.describe()/mutate()` 读写。
import z from "@deepseek-ai/schemastery";

const name = "@deepseek-ai/dsh-conversation-tweaks";
const inject = ["settings"];

const Config = z.object({
  // 必须 volatile：非 volatile 字段不进 describe() 的表单，页内也就写不回去。
  quietOutput: z.boolean().volatile().default(false)
});

function apply(ctx) {
  // 开关由本包在「设置-通用」里自己投一行（client.js 的 settings.general.item 槽），
  // 所以关掉内核的自动生成页，免得同一个设置出现两处。
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
}

export { Config, apply, inject, name };
