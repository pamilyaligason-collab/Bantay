import './alerts.css'

/** A 44 px on/off button (role=switch). The label names it for screen readers. */
export function Switch(p: { on: boolean; label: string; onChange: (on: boolean) => void; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={p.on} aria-label={p.label} data-testid={p.testId} className="wsw" onClick={() => p.onChange(!p.on)}>
      <span className="wsw-track"><span className="wsw-thumb" /></span>
    </button>
  )
}
