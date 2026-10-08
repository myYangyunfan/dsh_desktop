/**
 * Client half of dsh-basics-panel: registers the zh/en dictionaries into the
 * DSH locale registry and contributes the "基础能力" section to the DSH
 * Settings shell through `settings.section`. The section registration rides
 * `ctx.slots.inject` so it waits for the settings shell to declare the slot;
 * the panel content itself renders the feature registry (tab bar).
 */
import type { Context } from '../context-types.ts'
import { attachLocale, t, zh, en, LOCALE_NS } from './locales.ts'
import { PanelSection } from './panel.tsx'

/** Services required before mounting (provided by the client runtime). */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, sessions, locale).
 */
export function apply(ctx: Context): void {
  // Follow the DSH i18n system: attach the locale service so t() resolves the
  // Host-backed preference, and register the plugin's dictionaries. Disposers
  // run on fiber disposal (HMR re-registers cleanly).
  attachLocale(ctx.locale)
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'dsh-basics-panel: dictionaries')

  // The "基础能力" settings section: appears once the settings shell declares
  // the slot (slots.inject waits for it). The section reads/writes through the
  // plugin's own fenced /basics routes.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'basics-panel',
    order: 200,
    label: () => t('nav'),
    inject: () => ({ ctx }),
  }, PanelSection))
}
