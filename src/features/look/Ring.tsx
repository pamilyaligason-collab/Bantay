import type { Hue } from './cardParts'

/** Progress ring, 0..1 (C-10). L0 draws it static; L9 adds the draw-in motion. `label` makes it a named image; without it the value must be visible text beside it (ML-40). */
export function Ring({ value, size = 28, hue = 'green', label }: { value: number; size?: 20 | 28 | 40; hue?: Hue; label?: string }) {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const r = size / 2 - 3
  const len = 2 * Math.PI * r
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg className="rg" data-hue={hue} width={size} height={size} viewBox={`0 0 ${size} ${size}`} focusable="false" {...a11y}>
      <circle className="rg-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" />
      <circle className="rg-val" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${len * v} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}
