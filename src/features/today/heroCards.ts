import { HOME_ZONES } from '../location/geo'
import { distanceKm, rankAlerts, tierOf, type Alert, type LatLon } from '../safety/alerts'

/** Hero card engine (D-31/D-43): one card per thing that matters now, in priority order:
 *  active alert for the member's zone > medicine due now > weather for the home zone. Nothing applies: one calm summary. */

export interface Dose { name: string; at: number } // at = minutes after local midnight
export interface Wx { temp: number | null; rainPct: number | null; words: string; at: string }
export type HeroActionId = 'ok' | 'safety' | 'taken' | 'skip'
export interface HeroCard {
  key: string
  kind: 'alert' | 'dose' | 'weather' | 'summary'
  kicker: string
  title: string
  body: string
  big?: string
  actions: { id: HeroActionId; label: string }[]
  dose?: Dose
}

export const ALERT_RADIUS_KM = 150
export const DOSE_WINDOW_MIN = 120 // a dose stays "due now" for two hours after its time

/** "Losartan 50 mg 8:00", "Metformin 8:30 PM" -> name and time. No time in the text: null (the card is skipped, never guessed). */
export function parseDose(s: string): Dose | null {
  const m = /^(.*?)[\s,@-]*\b(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i.exec(s.trim())
  if (!m || !m[1]) return null
  let h = Number(m[2])
  const min = Number(m[3])
  const ap = m[4]?.toLowerCase()
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'pm' ? 12 : 0) }
  if (h > 23 || min > 59) return null
  return { name: m[1].trim(), at: h * 60 + min }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes()
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Doses whose time has come (and is under two hours old), not yet taken or skipped today. Oldest first. */
export function dueDoses(profile: unknown, taken: { name: string; takenAt: string }[], skipped: string[], now: Date): Dose[] {
  if (!Array.isArray(profile)) return []
  const nowMin = minutes(now)
  return profile
    .flatMap((s) => (typeof s === 'string' ? [parseDose(s)] : []))
    .filter((d): d is Dose => !!d && nowMin >= d.at && nowMin < d.at + DOSE_WINDOW_MIN)
    .filter((d) => !skipped.some((k) => sameName(k, d.name)))
    .filter((d) => !taken.some((t) => {
      const when = new Date(t.takenAt)
      return sameName(t.name, d.name) && sameDay(when, now) && minutes(when) >= d.at - 60
    }))
    .sort((a, b) => a.at - b.at)
}

const clock = (at: number) => {
  const h = Math.floor(at / 60)
  return `${h % 12 || 12}:${String(at % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const asOf = (iso: string) => {
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? '' : ` · as of ${t.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}`
}

/** Official warnings only (PAGASA, PHIVOLCS tier), inside the radius of where the member is. Area-wide alerts count. */
export function zoneAlert(alerts: Alert[], ref: LatLon | null): Alert | null {
  const refs: LatLon[] = ref ? [ref] : [...HOME_ZONES]
  const near = (a: Alert) => a.lat == null || a.lon == null || refs.some((r) => distanceKm(r, { lat: a.lat!, lon: a.lon! }) <= ALERT_RADIUS_KM)
  return rankAlerts(alerts.filter((a) => tierOf(a.kind) <= 1 && near(a)), ref)[0] ?? null
}

export function heroCards(i: { alerts: Alert[]; ref: LatLon | null; doses: Dose[]; weather: Wx | null; placeName: string }): HeroCard[] {
  const out: HeroCard[] = []
  const a = zoneAlert(i.alerts, i.ref)
  if (a) out.push({
    key: `alert:${a.id}`, kind: 'alert', kicker: `Alert · ${a.where} · ${a.source}`, title: a.title, body: a.doNow,
    actions: [{ id: 'safety', label: 'What to do' }, { id: 'ok', label: "I'm OK" }]
  })
  const d = i.doses[0]
  if (d) out.push({
    key: `dose:${d.name}`, kind: 'dose', kicker: `Due now · ${clock(d.at)}`, title: `Time for ${d.name}`,
    body: i.doses.length > 1 ? `${i.doses.length} medicines are due now` : 'Mark it when you have taken it',
    actions: [{ id: 'taken', label: 'Taken' }, { id: 'skip', label: 'Skipped' }], dose: d
  })
  const w = i.weather
  if (w && w.temp != null) {
    const rainy = w.rainPct != null && w.rainPct >= 60
    out.push({
      key: 'weather', kind: 'weather', kicker: `Weather${asOf(w.at)}`, big: `${Math.round(w.temp)}°`,
      title: rainy ? `Rain likely today in ${i.placeName}` : `${w.words[0]!.toUpperCase()}${w.words.slice(1)} in ${i.placeName}`,
      body: w.rainPct == null ? 'No rain chance number yet.' : rainy ? `Bring an umbrella. Chance of rain: ${w.rainPct}%.` : `Chance of rain today: ${w.rainPct}%.`,
      actions: []
    })
  }
  if (!out.length) out.push({
    key: 'summary', kind: 'summary', kicker: 'Today', title: 'All calm for now',
    body: 'No warnings for your area and nothing due. Official bulletins always come first.',
    actions: [{ id: 'safety', label: 'Open Safety' }]
  })
  return out
}
