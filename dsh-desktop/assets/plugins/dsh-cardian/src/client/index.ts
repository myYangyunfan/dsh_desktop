// cardian 知识树 — dsh web client plugin entry.
//
// Browser half of the cardian package (the host half lives in ../src). It adds
// a "知识树" (Knowledge Tree) control to the left sidebar foot and a floating
// panel that renders everything the host plugin has captured.
//
// Slot contract (from deepseek-harness):
//   * `sidebar.footer.action`  — list slot owned by ui-sidebar; additive actions
//     beside Settings at the sidebar foot. Owner props: `{ wide }`.
//   * `shell.overlay`          — list slot owned by ui-layout; the additive seat
//     for a frame-wide floating surface. No owner props.
//
// Both are additive, so this plugin sits beside the shipped entries instead of
// replacing the sidebar or the conversation surface.

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only imports pull the SlotMap merge (slot key types) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

import { KnowledgeController } from './controller'
import { KnowledgeTreeTrigger, KnowledgeTreePanelSafe } from './KnowledgeTree'
import { zh, en, type KnowledgeTreeKey } from './locales'

declare module '@deepseek-ai/dsh-client-locale' {
  interface LocaleNamespaceMap {
    'cardian.sidebar': KnowledgeTreeKey
  }
}

const NS = 'cardian.sidebar'

export const inject = ['slots', 'locale', 'remote']

export function apply(ctx: ClientContext): void {
  console.log('[cardian] 插件客户端已加载 (apply)，开始注册槽位')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cardian: dictionaries')

  const controller = new KnowledgeController(ctx)

  // 与生态内其它插件（side-session / community-market）一致的注入写法：
  // 包 ctx.effect + try/catch，槽未就绪时 slots.inject 会等待声明，注册失败
  // 则记 warning 而不是静默吞掉（便于排查“点击没反应”一类问题）。
  ctx.effect(() => {
    try {
      return ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-cardian',
          order: 10,
          locale: NS,
          inject: () => controller.triggerProps(),
        }, KnowledgeTreeTrigger),
      )
    } catch (err) {
      console.warn('[cardian] sidebar.footer.action 槽注册失败:', err)
      return undefined
    }
  }, 'cardian: 侧边栏触发按钮')

  ctx.effect(() => {
    try {
      return ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-cardian',
          order: 10,
          locale: NS,
          inject: () => controller.panelProps(),
        }, KnowledgeTreePanelSafe),
      )
    } catch (err) {
      console.warn('[cardian] shell.overlay 槽注册失败:', err)
      return undefined
    }
  }, 'cardian: 知识树面板')
}
