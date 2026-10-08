/**
 * Shared presentational primitives: a custom toggle switch (a real checkbox
 * driving a styled track/thumb) and a status dot. Feature components reuse
 * these so the panel stays visually consistent as features are added.
 */
import css from './panel.module.css'

/** The custom switch. */
export function Toggle(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  const { checked, onChange, label, disabled } = props
  return (
    <label className={css.switch}>
      <input
        type="checkbox"
        className={css.switchInput}
        checked={checked}
        disabled={disabled === true}
        aria-label={label}
        onChange={event => { onChange(event.currentTarget.checked) }}
      />
      <span className={css.switchTrack} aria-hidden="true">
        <span className={css.switchThumb} />
      </span>
    </label>
  )
}

/** A colored status dot. */
export function StatusDot(props: { kind: 'connected' | 'enabled' | 'disabled' }) {
  const className = props.kind === 'connected' ? css.dotConnected : props.kind === 'enabled' ? css.dotEnabled : css.dotDisabled
  return <span className={`${css.statusDot} ${className}`} aria-hidden="true" />
}
