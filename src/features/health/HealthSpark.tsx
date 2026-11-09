import { sparkPoints } from '../today/myWeekLogic'
import type { Series } from './trendLogic'

/** A 7-day sparkline in the colour of its tile. Decorative: the number and the days it covers are in the text beside it. Nothing is drawn for fewer than 2 days of data (null when empty, never a flat line at 0). */
export function HealthSpark({ values, w = 72, h = 28 }: { values: Series; w?: number; h?: number }) {
  const pts = sparkPoints(values, w, h)
  if (!pts) return null
  const last = pts[pts.length - 1]!
  return (
    <svg className="tk-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
      <circle cx={last.x} cy={last.y} r="2.5" />
    </svg>
  )
}
