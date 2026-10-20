import { doseStates, medSlots } from '../health/model'
import { HOME_ZONES } from '../location/geo'
import { distanceKm, rankAlerts, tierOf, type Alert, type LatLon } from '../safety/alerts'
import { actionLine, type WarningIn } from '../weather/actionLine'
import { heatIndexC } from '../weather/heatIndex'

/** Hero card engine (D-31/D-43): one card per thing that matters now, in priority order:
 *  active alert for the member's zone > medicine due now > weather for the home zone. Nothing applies: one calm summary. */

export interface Dose { name: string; at: number } // at = minutes after local midnight
/** Rain from the hourly forecast. startH/endH are clock hours 0-23 in Manila; now = it is raining this hour; tomorrow = it starts after midnight. */
export interface RainOutlook { now: boolean; tomorrow: boolean; startH: number; endH: number; hours: number; peakPct: number }
/** hourly: the forecast as fetched (Manila local times). Absent in old caches; the outlook is worked out from it at render time. */
export interface Wx {
  temp: number | null; rainPct: number | null; words: string; at: string; code?: number | null
  /** Place-local "YYYY-MM-DDTHH:MM" times (the clock of the place the forecast is for, with utcOffset). */
  hourly?: { time: string[]; prob: (number | null)[] }
  utcOffset?: number // seconds; absent in old caches and fixtures = Manila
  tz?: string // IANA zone the forecast service reported
  humidity?: number | null
  uvMax?: number | null
  offline?: boolean // the forecast is the last good one from the cache, not a fresh reading
}
export type HeroActionId = 'ok' | 'safety' | 'taken' | 'skip' | 'plan'
export interface HeroCard {
  key: string
  kind: 'alert' | 'dose' | 'plan' | 'weather' | 'summary'
  sky?: Sky
  kicker: string
  title: string
  body: string
  big?: string
  actions: { id: HeroActionId; label: string }[]
  dose?: Dose
}

export type Sky = 'clear' | 'cloud' | 'rain' | 'storm' | 'fog'
/** Background mood for the weather card, from the WMO weather_code (unknown = none). */
export const skyOf = (w: Wx): Sky | undefined => {
  const c = w.code
  if (c == null) return undefined
  return c <= 1 ? 'clear' : c <= 3 ? 'cloud' : c <= 48 ? 'fog' : c >= 95 ? 'storm' : c >= 51 && c <= 86 ? 'rain' : 'cloud'
}

export const ALERT_RADIUS_KM = 150
export const RAIN_HERO_PCT = 60 // Next up shows weather only from this chance of rain
export const HEAT_C = 33 // or from this temperature
export const DOSE_WINDOW_MIN = 120 // the inbox calls a dose missed this long after its time; Today keeps it due until taken or skipped
export const SKIP_KEY = 'today.skipped' // { day, names }: doses marked Skipped today, so the card does not come back on reload

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

/** A skip is stored per dose as name@minute. A legacy name-only entry counts only for that medicine's earliest open dose. */
export const doseKey = (name: string, at: number) => `${name}@${at}`
const PER_DOSE = /@[0-9]+$/
/** Slots skipped per dose are dropped BEFORE takes are allotted, so a later take cannot be handed to a skipped slot. */
export const notSkippedPerDose = <T extends { name: string; at: number | null }>(slots: T[], skipped: string[]) =>
  slots.filter((s) => s.at == null || !skipped.some((k) => PER_DOSE.test(k) && sameName(k, doseKey(s.name, s.at!))))
/** Legacy name-only entries (no @time) cover only that medicine's earliest open dose. */
export const isSkipped = (skipped: string[], name: string, at: number, firstOpenAt: number) =>
  skipped.some((k) => !PER_DOSE.test(k) && at === firstOpenAt && sameName(k, name))

/** Doses whose time has come, not yet taken or skipped today (same rule as Next up). Oldest first. */
export function dueDoses(profile: unknown, taken: { name: string; takenAt: string }[], skipped: string[], now: Date): Dose[] {
  if (!Array.isArray(profile)) return []
  const nowMin = minutes(now)
  const open = doseStates(notSkippedPerDose(medSlots(profile.filter((x): x is string => typeof x === 'string')), skipped), taken, now)
    .filter((s) => s.at != null && s.at <= nowMin && !s.taken)
    .map((s) => ({ name: s.name, at: s.at! }))
  const first = (n: string) => Math.min(Infinity, ...open.filter((d) => sameName(d.name, n)).map((d) => d.at))
  return open.filter((d) => !isSkipped(skipped, d.name, d.at, first(d.name))).sort((a, b) => a.at - b.at)
}

const clock = (at: number) => {
  const h = Math.floor(at / 60)
  return `${h % 12 || 12}:${String(at % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const hour12 = (h: number) => `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`

/** First run of hours with chance >= 50%, from the current hour (times are Open-Meteo local "YYYY-MM-DDTHH:MM"). */
export function rainOutlook(times: unknown[] | undefined, probs: unknown[] | undefined, nowLocal: string | undefined, raining = true): RainOutlook | null | undefined {
  if (!Array.isArray(times) || !Array.isArray(probs) || !nowLocal || !times.length) return undefined
  const from = times.findIndex((t) => typeof t === 'string' && t.slice(0, 13) >= nowLocal.slice(0, 13))
  if (from < 0) return undefined
  const p = (i: number) => (typeof probs[i] === 'number' ? (probs[i] as number) : -1)
  let i = from
  const first = raining ? from : from + 1 // the sky does not show rain: this hour's chance is not "now", start from the next hour
  i = first
  while (i < times.length && p(i) < 50) i++
  if (i >= times.length) return null
  let j = i
  let peak = 0
  while (j < times.length && p(j) >= 50) { peak = Math.max(peak, p(j)); j++ }
  const hr = (k: number) => Number(String(times[k]).slice(11, 13)) % 24
  return { now: raining && i === from, tomorrow: String(times[i]).slice(0, 10) > nowLocal.slice(0, 10), startH: hr(i), endH: j < times.length ? hr(j) : -1, hours: j - i, peakPct: Math.round(peak) }
}

export function rainWords(r: RainOutlook): string {
  if (r.now) return r.endH < 0 ? `Rain now, likely to last. Chance: ${r.peakPct}%.` : `Rain now, easing around ${hour12(r.endH)}.`
  return `Rain likely ${r.tomorrow ? 'tomorrow ' : ''}from ${hour12(r.startH)} for about ${r.hours} ${r.hours === 1 ? 'hour' : 'hours'}. Chance: ${r.peakPct}%.`
}

const asOf = (iso: string, tz = 'Asia/Manila') => {
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? '' : ` · as of ${t.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: tz })}`
}

/** Official warnings only (PAGASA, PHIVOLCS tier), inside the radius of where the member is. Area-wide alerts count. */
export function zoneAlert(alerts: Alert[], ref: LatLon | null): Alert | null {
  const refs: LatLon[] = ref ? [ref] : [...HOME_ZONES]
  const near = (a: Alert) => a.lat == null || a.lon == null || refs.some((r) => distanceKm(r, { lat: a.lat!, lon: a.lon! }) <= ALERT_RADIUS_KM)
  return rankAlerts(alerts.filter((a) => tierOf(a.kind) <= 1 && near(a)), ref)[0] ?? null
}

/** Manila wall clock as Open-Meteo prints it: "YYYY-MM-DDTHH:MM". */
export const manilaLocal = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).replace(' ', 'T').slice(0, 16)

/** The wall clock of the place a reading is for, "YYYY-MM-DDTHH:MM": from its UTC offset, else Manila (the hourly times are in that same clock). */
export const wxLocal = (w: Pick<Wx, 'utcOffset'>, d: Date): string =>
  w.utcOffset == null ? manilaLocal(d) : new Date(d.getTime() + w.utcOffset * 1000).toISOString().slice(0, 16)

/** Rain really came: the sky shows it now, or an earlier hour today reached 50%. A null outlook then means it has stopped, not that it never came. */
export const rainPassed = (w: Wx, nowLocal: string): boolean => {
  const s = skyOf(w)
  return s === 'rain' || s === 'storm' || !!w.hourly?.time.some((t, i) => t < nowLocal && t.slice(0, 10) === nowLocal.slice(0, 10) && (w.hourly!.prob[i] ?? 0) >= 50)
}
/** The one rain sentence Today and the Safety hub both show. rain: rainOutlook result (undefined = no hourly data, null = never raining in the window). */
export function rainBody(w: Wx, rain: ReturnType<typeof rainOutlook> | undefined, rainy: boolean, nowLocal: string): string {
  if (rain) return rainWords(rain)
  if (w.rainPct == null) return 'No rain chance number yet.'
  const pct = Math.round(w.rainPct)
  if (rain === null) return rainPassed(w, nowLocal) ? 'No more rain expected for now.' : `Chance of rain today: ${pct}%.`
  return rainy ? `Bring an umbrella. Chance of rain: ${pct}%.` : `Chance of rain today: ${pct}%.`
}

/** The rain sentence, worked out at render time (the cached reading can be hours old). Shared by the hero card and the one-line weather helper. */
export function rainLine(w: Wx, now: Date): string {
  const sky = skyOf(w)
  const nowLocal = wxLocal(w, now)
  const rain = w.hourly ? rainOutlook(w.hourly.time, w.hourly.prob, nowLocal, sky === 'rain' || sky === 'storm') : undefined
  return rainBody(w, rain, w.rainPct != null && w.rainPct >= 60, nowLocal)
}

export function heroCards(i: { alerts: Alert[]; ref: LatLon | null; doses: Dose[]; weather: Wx | null; placeName: string; now?: Date }): HeroCard[] {
  const out: HeroCard[] = []
  const a = zoneAlert(i.alerts, i.ref)
  if (a) out.push({
    key: `alert:${a.id}`, kind: 'alert', kicker: `Alert · ${a.where} · ${a.source}`, title: a.title, body: a.doNow,
    actions: [{ id: 'safety', label: 'What to do' }, { id: 'ok', label: "I'm OK" }]
  })
  const d = i.doses[0]
  if (d) out.push({
    key: `dose:${d.name}`, kind: 'dose', kicker: `${minutes(i.now ?? new Date()) >= d.at + DOSE_WINDOW_MIN ? 'Not taken yet' : 'Due'} · ${clock(d.at)}`, title: `Time for ${d.name}`,
    body: new Set(i.doses.map((x) => x.name)).size > 1 ? `${new Set(i.doses.map((x) => x.name)).size} medicines are due now` : 'Mark it when you have taken it',
    actions: [{ id: 'taken', label: 'Taken' }, { id: 'skip', label: 'Skipped' }], dose: d
  })
  const w = i.weather
  if (w && w.temp != null) {
    const rainy = w.rainPct != null && w.rainPct >= 60
    const hot = !rainy && w.temp >= HEAT_C
    const sky = skyOf(w)
    // worked out now, not at fetch time: the cached reading can be hours old
    const nowLocal = wxLocal(w, i.now ?? new Date())
    const rain = w.hourly ? rainOutlook(w.hourly.time, w.hourly.prob, nowLocal, sky === 'rain' || sky === 'storm') : undefined
    const place = i.placeName
    out.push({
      key: 'weather', kind: 'weather', kicker: `Weather${asOf(w.at, w.tz)}`, sky, big: `${Math.round(w.temp)}°`,
      title: hot ? `Hot today in ${place}` : rain ? (rain.now ? `Raining now in ${place}` : `Rain likely ${rain.tomorrow ? 'tomorrow' : 'today'} in ${place}`) : rain === null && rainPassed(w, nowLocal) ? `Rain has passed in ${place}` : rainy ? `Rain likely today in ${place}` : `${w.words[0]!.toUpperCase()}${w.words.slice(1)} in ${place}`,
      body: hot ? `It is ${Math.round(w.temp)}° now. Drink water and rest in the shade.` : rainBody(w, rain, rainy, nowLocal),
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

/** The one action line weather earns on Today and in Simple mode. It is the top line of the Weather screen's actionLines() (heat index first,
 *  then rain in the next 12 hours, then strong sun), so Today and Weather never disagree. null when none applies. */
export function weatherAction(w: Wx | null, now: Date = new Date(), warning: WarningIn | null = null): string | null {
  if (!w || w.temp == null) return null
  return actionLine({
    heatIndexC: heatIndexC(w.temp, w.humidity),
    hourly: (w.hourly?.time ?? []).map((time, i) => ({ time, prob: w.hourly!.prob[i] ?? null })),
    nowLocal: wxLocal(w, now),
    uvMax: w.uvMax ?? null,
    warning
  })?.text ?? null
}
