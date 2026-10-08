// Host-side entry for dsh-quest-ui: 声明设置形状。
import z from "@deepseek-ai/schemastery";


const name = "@deepseek-ai/dsh-quest-ui";
const inject = ["settings"];

const Config = z.object({
  // 必须 volatile：非 volatile 字段不进 settings.describe() 的表单，
  // 页内既读不到当前值、也写不回去（update 还会拒非 volatile 路径）。
  questMode: z.boolean().volatile().default(false)
});

function apply(ctx) {
  // 原先这里调 `ctx.settings.register(NS, Config, {base})`，而内核 0.1.7-rc.1 的
  // SettingsForms 根本没有 register ⇒ 抛 TypeError 被 try/catch 吞成一行 warn，
  // 设置静默存不住。声明式导出 Config 就够了；开关由本包在「设置-通用」自己投一行
  // （client.js 的 settings.general.item 槽），所以关掉内核自动生成页免得出现两处。
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
}

export { Config, apply, inject, name };
