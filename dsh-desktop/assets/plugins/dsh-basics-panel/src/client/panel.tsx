/**
 * The "基础能力" settings section: a tab bar over the feature registry. Each
 * tab mounts its feature component inside the panel content column; the shell
 * supplies the section's `close` affordance (unused by the panel, which keeps
 * the settings shell open while the user works).
 */
import { useState } from 'react'
import type { Context } from '../context-types.ts'
import { FEATURES } from './feature-registry.tsx'
import { t } from './locales.ts'
import css from './panel.module.css'

export interface PanelSectionProps {
  close: () => void
  ctx: Context
}

export function PanelSection(props: PanelSectionProps) {
  const { ctx } = props
  const [active, setActive] = useState<string>(FEATURES[0]?.id ?? '')
  const feature = FEATURES.find(item => item.id === active) ?? FEATURES[0]
  const Active = feature?.Component

  return (
    <div className={css.section}>
      <p className={css.intro}>{t('intro')}</p>
      <div className={css.tabs} role="tablist">
        {FEATURES.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === active}
            className={item.id === active ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => { setActive(item.id) }}
          >
            {item.label()}
          </button>
        ))}
      </div>
      {Active !== undefined && (
        <Active ctx={ctx} />
      )}
    </div>
  )
}
