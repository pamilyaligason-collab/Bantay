import { Icon } from '../shell/Icon'
import { kindOf } from '../weather/forecast'
import { rainChanceText } from '../weather/rainNow'
import { wxLocal, type Wx } from './heroCards'
import { stormSlots, type Slot } from './stormView'

export const STRIP_HOURS = 12
const deg = (n: number) => `${Math.round(n)}°`
const hourLabel = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` }

/** The next 12 hours from the place-local current hour, current hour first, from the hourly forecast the hero already loaded. Fewer when the forecast is shorter (nothing invented); empty without hourly data.
 *  The first item uses the current temperature so it matches the big number. */
export function hourlySlots(wx: Wx, now: Date, storm = false): Slot[] {
  const h = wx.hourly
  if (!h) return []
  const at = wxLocal(wx, now).slice(0, 13)
  const from = h.time.findIndex((t) => t.slice(0, 13) >= at)
  if (from < 0) return []
  const out = h.time.slice(from, from + STRIP_HOURS).map((t, k): Slot => ({ time: k === 0 ? 'Now' : hourLabel(t), kind: kindOf(h.code?.[from + k] ?? null), pct: h.prob[from + k] ?? null, temp: k === 0 ? wx.temp ?? h.temp?.[from] ?? null : h.temp?.[from + k] ?? null }))
  return storm ? stormSlots(out) : out // T16: under a storm the strip agrees with the title
}

/** A horizontally scrollable strip of the next 12 hours: time, icon, temperature, rain chance. Focusable so the arrow keys scroll it; each item is 44 px or more. */
export default function HourlyStrip({ slots }: { slots: Slot[] }) {
  if (!slots.length) return null
  return (
    <ul className="td-hs" aria-label="Next 12 hours" tabIndex={0} data-testid="hourly-strip">
      {slots.map((s, i) => (
        <li key={i}>
          <span className="td-hs-t">{s.time}</span>
          <span className="td-hs-i" aria-hidden="true"><Icon name={s.kind} size={22} /></span>
          {s.temp != null && <span className="td-hs-d">{deg(s.temp)}</span>}
          {s.pct != null && <span className="td-hs-p">{s.pct < 10 ? rainChanceText(s.pct) : `${Math.round(s.pct)}% rain`}</span>}
        </li>
      ))}
    </ul>
  )
}
