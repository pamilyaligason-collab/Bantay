import { wxLocal, type Wx } from './heroCards'
import { interp as at } from '../../../supabase/functions/weather-blend/blend'

export const MINI_SLOTS = 8 // 8 bars of 15 minutes = the next 2 hours
const STEP = 15 * 60_000
const WET_PCT = 30 // same threshold as the hero's own rain line (heroRain.ts)
const MM_FULL = 2.5 // a full bar in millimetre mode: 2.5 mm in 15 minutes = 10 mm an hour, heavy rain (A2: fixed, not the day's own maximum)
/** mm: millimetres in this 15 minutes, from the forecast's real hourly millimetres; null when the forecast has none (then pct, the rain chance, is what the bar shows). */
export interface MiniSlot { time: string; mm: number | null; pct: number | null; wet: boolean }

export const clock = (t: string) => { const h = Number(t.slice(11, 13)); const m = t.slice(14, 16); return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}` }
const ms = (t: string) => Date.parse(`${t.slice(0, 16)}:00Z`)
const local = (n: number) => new Date(n).toISOString().slice(0, 16)
const r2 = (n: number) => Math.round(n * 100) / 100

/** Eight 15-minute slots, the first starting now. With real hourly millimetres each slot is that rate / 4; without them (old cache, null) each slot is the rain chance and carries no mm. A storm uses the chance, floored at 60%, so it never reads dry.
 *  null when the hourly forecast has neither: unknown is never read as dry. */
export function miniSlots(wx: Wx, now: Date, storm = false): MiniSlot[] | null {
  const h = wx.hourly
  if (!h) return null
  const mid = (t: string) => ms(t) + 1_800_000 // an hour's value sits at its midpoint
  const mmPts: [number, number][] = []
  const pctPts: [number, number][] = []
  h.time.forEach((t, i) => {
    const m = h.mm?.[i]; const p = h.prob[i]
    if (m != null) mmPts.push([mid(t), m])
    if (p != null) pctPts.push([mid(t), storm ? Math.max(p, 60) : p])
  })
  const useMm = !storm && mmPts.length > 0
  if (!useMm && !pctPts.length) return null
  const start = Math.floor(ms(wxLocal(wx, now)) / 60_000) * 60_000 // now, to the minute: no slot, and so no "heaviest around", starts in the past
  return Array.from({ length: MINI_SLOTS }, (_, i) => {
    const m = start + i * STEP + STEP / 2
    const time = local(start + i * STEP)
    if (useMm) { const mm = r2(at(mmPts, m) / 4); return { time, mm, pct: null, wet: mm > 0 } }
    const pct = Math.round(at(pctPts, m))
    return { time, mm: null, pct, wet: pct >= WET_PCT }
  })
}

/** The plain sentence for the bars, null when no slot is wet. Starts "Next 2 hours:" so it is never a second copy of the hero's own tip. */
export function miniSummary(slots: MiniSlot[]): string | null {
  const wet = slots.filter((s) => s.wet)
  if (!wet.length) return null
  const val = (s: MiniSlot) => s.mm ?? s.pct ?? 0
  const peak = wet.reduce((a, s) => (val(s) > val(a) ? s : a))
  const mm = peak.mm != null
  const from = wet[0] === slots[0] ? (mm ? 'rain now' : 'rain likely now') : `${mm ? 'rain' : 'rain likely'} from about ${clock(wet[0]!.time)}`
  return `Next 2 hours: ${from}, ${mm ? 'heaviest' : 'most likely'} around ${clock(peak.time)} (${mm ? `about ${peak.mm} mm in 15 minutes` : `${peak.pct}% chance`})`
}

/** Under the rain sentence: 8 bars of 15 minutes, the value as text on the tallest. Real millimetres say "Estimated from hourly data"; a chance-only forecast says "Chance of rain" and shows no mm. No rain in the next 2 hours: one plain line instead. Nothing when the forecast has no numbers. */
export default function RainMini({ slots, raining = false }: { slots: MiniSlot[] | null; raining?: boolean }) {
  if (!slots) return null
  const summary = miniSummary(slots)
  if (!summary) return <p className="td-rm-none" data-testid="rain-mini">{raining ? 'No more rain expected in the next 2 hours' : 'No rain in the next 2 hours'}</p>
  const chance = slots[0]!.mm == null
  const val = (s: MiniSlot) => (chance ? s.pct : s.mm) ?? 0
  const top = slots.reduce((a, s, i) => (val(s) > val(slots[a]!) ? i : a), 0) // the tallest bar carries the number
  const unknown = (s: MiniSlot) => (chance ? s.pct : s.mm) == null // ML-05: no number is not 0%: a dashed stub, no bar height
  const frac = (s: MiniSlot) => Math.min(1, val(s) / (chance ? 100 : MM_FULL)) // A2: a fixed scale (0-100% chance; MM_FULL mm per 15 min), never the highest slot, so a flat 20% does not look like a flat 90%
  return (
    <div className="td-rm" data-testid="rain-mini">
      <span className="td-vh">{summary}</span>
      <ul className="td-rm-bars" aria-hidden="true">
        {slots.map((s, i) => (
          <li key={s.time}>
            <span className="td-rm-v">{i === top ? (chance ? `${s.pct}%` : `${s.mm} mm`) : ' '}</span>
            <i className={unknown(s) ? 'td-rm-unk' : undefined} style={unknown(s) ? undefined : { height: `${Math.max(2, frac(s) * 36)}px` }} />
            <span className="td-rm-l">{i === 0 ? 'Now' : i === 4 ? '+1 h' : ' '}</span>
          </li>
        ))}
      </ul>
      <span className="td-rm-note">{chance ? 'Chance of rain' : 'Estimated from hourly data'}</span>
    </div>
  )
}
