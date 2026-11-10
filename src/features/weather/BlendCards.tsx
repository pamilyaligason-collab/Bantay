import type { Alert as WxAlert, Slot, Source } from '../../../supabase/functions/weather-blend/blend.ts'
import { EmptyState } from '../look/EmptyState'
import { Section } from '../look/Section'
import { RainRemindSwitch } from './Next2hMini'

const clock = (t: string) => { const h = Number(t.slice(11, 13)); return `${h % 12 || 12}:${t.slice(14, 16)}` + (h < 12 ? ' AM' : ' PM') }
const RAIN = 0.1 // mm per hour: below this it is dry

/** One plain sentence for the 12 ten-minute slots, or null when no slot has a number. */
export function nextRainLine(slots: Slot[], raining = false): string | null {
  const known = slots.filter((s) => s.mmh != null)
  if (!known.length) return null
  const wet = known.filter((s) => s.mmh! >= RAIN)
  if (!wet.length) return known.length === slots.length ? (raining ? 'No more rain expected in the next 2 hours' : 'No rain expected in the next 2 hours') : null // some unknown: never read as dry
  const peak = wet.reduce((a, s) => (s.mmh! > a.mmh! ? s : a))
  return wet[0] === known[0] ? `Raining now, heaviest around ${clock(peak.time)}` : `Rain likely from about ${clock(wet[0]!.time)}, heaviest around ${clock(peak.time)}`
}

/** "Next 2 hours": estimated slots say so in the title. Offline or no numbers: an honest empty state, never a frozen chart. */
export function Next2h({ slots: all, offline, now, raining = false }: { slots: Slot[]; offline: boolean; now: number; raining?: boolean }) {
  const slots = all.filter((s) => Date.parse(`${s.time}:00+08:00`) + 600_000 > now) // the Philippines is UTC+8 all year; a cached slot already past is not "now"
  const line = offline || !slots.length ? null : nextRainLine(slots, raining)
  const est = slots.some((s) => s.estimated)
  if (!line) return <Section title="Next 2 hours" testId="wx-next2h"><EmptyState title="Not available now" body={offline ? 'Rain for the next 2 hours needs a fresh forecast.' : 'No rain numbers for the next 2 hours.'} /></Section>
  const max = Math.max(1, ...slots.map((s) => s.mmh ?? 0))
  return (
    <Section title="Next 2 hours" meta={est ? 'estimated' : undefined} testId="wx-next2h">
      <div className="card wx-n2h">
        <b className="wx-n2h-t">{line}</b>
        <ul className="wx-n2h-bars" aria-label="Rain every 10 minutes">
          {slots.map((s, i) => (
            <li key={s.time}>
              <span className="wx-rp">{s.mmh == null ? 'n/a' : s.mmh}</span>
              <i style={{ height: `${Math.max(2, ((s.mmh ?? 0) / max) * 80)}px` }} />
              <span className="wx-sub">{i === 0 ? 'Now' : i % 3 === 0 ? clock(s.time).replace(/ [AP]M/, '') : ' '}</span>
            </li>
          ))}
        </ul>
        <p className="wx-sub">mm of rain per hour, in 10-minute steps.{est ? ' Estimated from hourly data.' : ''}</p>
        <RainRemindSwitch />
      </div>
    </Section>
  )
}

/** OpenWeather's own notices, always below PAGASA's row. */
export function OtherNotices({ alerts: all, now }: { alerts: WxAlert[]; now: number }) {
  const alerts = all.filter((a) => !a.end || !(Date.parse(a.end) < now)) // an ended notice from a cached payload is not shown
  if (!alerts.length) return null
  return (
    <section aria-label="Other weather notices" className="card wx-other" data-testid="wx-other-alerts">
      <span className="eyebrow">Other notices (OpenWeather).</span>
      {alerts.map((a) => <p key={`${a.source}${a.event}${a.start}`}><b>{a.event}</b><span className="wx-sub">{a.source}</span></p>)}
    </section>
  )
}

/** Footer credit lines for the providers that answered; links open outside the app. */
export function Credits({ sources, station }: { sources: Source[]; station: string | null }) {
  const ok = sources.filter((s) => s.ok)
  return (
    <>
      <p className="wx-sub">Forecast for your area: the middle of {ok.length} weather {ok.length === 1 ? 'service' : 'services'}. Official warnings: PAGASA.</p>
      {ok.map((s) => <p key={s.id} className="wx-sub"><a href={s.url} target="_blank" rel="noopener noreferrer">{s.credit}</a></p>)}
      {station && <p className="wx-sub">Temperature checked against {station}.</p>}
    </>
  )
}
