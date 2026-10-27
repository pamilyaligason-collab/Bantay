import { useMemo, useState, type ReactElement } from 'react'
import type { Reading } from '../health/ranges'
import { BP_WORDS, type BpLevel } from '../health/verdict'
import { Icon } from '../shell/Icon'
import { COLOR_OF, SHAPE_OF, tally, yearPixels, type Shape } from './pixelsLogic'

const CELL = 12
const LEFT = 26
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const LEVELS: BpLevel[] = ['in', 'raised', 'above', 'high', 'low']

/** One mark of 8 units centred at (cx, cy). Shape AND colour carry the level. */
export function Mark({ shape, cx, cy, color, r = 4 }: { shape: Shape; cx: number; cy: number; color: string; r?: number }) {
  const p: Record<Shape, ReactElement> = {
    circle: <circle cx={cx} cy={cy} r={r} fill={color} />,
    square: <rect x={cx - r + 0.5} y={cy - r + 0.5} width={2 * r - 1} height={2 * r - 1} fill={color} />,
    diamond: <polygon points={`${cx},${cy - r - 0.5} ${cx + r + 0.5},${cy} ${cx},${cy + r + 0.5} ${cx - r - 0.5},${cy}`} fill={color} />,
    'tri-up': <polygon points={`${cx},${cy - r} ${cx + r + 0.5},${cy + r - 0.5} ${cx - r - 0.5},${cy + r - 0.5}`} fill={color} />,
    'tri-down': <polygon points={`${cx - r - 0.5},${cy - r + 0.5} ${cx + r + 0.5},${cy - r + 0.5} ${cx},${cy + r}`} fill={color} />
  }
  return p[shape]
}

/** The year in pixels: one mark a day (month rows, day columns) from that day's average blood pressure, shape plus colour, with a legend that counts each. Needs no colour vision. */
export function Pixels({ personId, readings, now = new Date() }: { personId: string; readings: Reading[]; now?: Date }) {
  const [year, setYear] = useState(now.getFullYear())
  const cells = useMemo(() => yearPixels({ readings, personId, year, now }), [readings, personId, year, now])
  const t = useMemo(() => tally(cells), [cells])
  const width = LEFT + 31 * CELL
  return (
    <section className="sh-card nu-card" data-testid="nudge-pixels" aria-labelledby="nu-px-h">
      <div className="nu-yr">
        <h2 className="sh-h2" id="nu-px-h">Year in pixels</h2>
        <span className="nu-yrnav">
          <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => setYear(year - 1)} aria-label="Previous year"><Icon name="back" size={18} /></button>
          <b data-testid="px-year">{year}</b>
          <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => setYear(year + 1)} aria-label="Next year" disabled={year >= now.getFullYear()}><Icon name="chev" size={18} /></button>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${12 * CELL}`} className="nu-grid" role="img" aria-label={`${year}: ${t.days} days with a blood pressure. ${LEVELS.map((l) => `${t.by[l]} ${BP_WORDS[l].word}`).join(', ')}.`}>
        {MONTHS.map((m, i) => <text key={i} x={LEFT - 6} y={i * CELL + CELL / 2 + 3.5} textAnchor="end" className="nu-mo">{m}</text>)}
        {cells.map((c) => {
          const d = new Date(`${c.day}T12:00:00`)
          const cx = LEFT + (d.getDate() - 1) * CELL + CELL / 2
          const cy = d.getMonth() * CELL + CELL / 2
          return c.px
            ? <Mark key={c.day} shape={c.px.shape} cx={cx} cy={cy} color={c.px.color} />
            : <circle key={c.day} cx={cx} cy={cy} r={c.future ? 0.8 : 1.4} className="nu-none" />
        })}
      </svg>
      <ul className="nu-legend" aria-label="Legend">
        {LEVELS.map((l) => (
          <li key={l} data-level={l}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><Mark shape={SHAPE_OF[l]} cx={8} cy={8} color={COLOR_OF[l]} r={6} /></svg>
            <span>{BP_WORDS[l].word}</span><b>{t.by[l]}</b>
          </li>
        ))}
      </ul>
      {t.days === 0 && <p className="sh-sub">No blood pressure logged in {year} yet.</p>}
    </section>
  )
}
