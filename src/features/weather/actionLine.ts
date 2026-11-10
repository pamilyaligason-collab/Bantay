import { heatBand, type HeatBand } from './heatIndex'

// The one line that says what to do. Pure: the caller passes the numbers and the place-local clock.

export type ActionId = 'warning' | 'heat' | 'rain' | 'uv' | 'air'
export interface ActionLine {
  id: ActionId
  text: string // the plain instruction
  band?: string // e.g. "Heat index 42° · Danger"
  rank: number // higher is worse
}
export interface HourlyRain { time: string; prob: number | null } // place-local "YYYY-MM-DDTHH:MM"
export interface WarningIn { kind: string; title: string; doNow?: string | null }

export const RAIN_WATCH_PCT = 60
export const RAIN_WATCH_HOURS = 12
export const UV_STRONG = 8
export const UV_TEXT = 'Strong sun: shade and a hat 10 AM-3 PM'

const hour12 = (h: number) => `${h % 12 || 12}`
const mer = (h: number) => (h % 24 < 12 ? 'AM' : 'PM')
/** "2-5 PM", "11 AM-2 PM". */
export const hourSpan = (a: number, b: number) => (mer(a) === mer(b) ? `${hour12(a)}-${hour12(b)} ${mer(b)}` : `${hour12(a)} ${mer(a)}-${hour12(b)} ${mer(b)}`)

/** "Rain likely 2-5 PM (88%)" from hourly chance >= 60% inside the next 12 hours, or null. */
export function rainWatch(hourly: HourlyRain[], nowLocal: string, raining = false): { text: string; peak: number } | null {
  const from = hourly.findIndex((h) => h.time.slice(0, 13) >= nowLocal.slice(0, 13))
  if (from < 0) return null
  const win = hourly.slice(from, from + RAIN_WATCH_HOURS)
  const hit = (i: number) => (win[i]?.prob ?? -1) >= RAIN_WATCH_PCT
  if (raining && win.some((_, k) => hit(k))) { // A3: while it falls the line says so, never "Rain likely 5-6 PM" under a Raining now hero, whatever the hourly chance says
    let e = 0
    while (e < win.length && hit(e)) e++
    const here = win[0]!.time.slice(0, 13) === nowLocal.slice(0, 13)
    const end = e > 0 && here ? (Number(win[e - 1]!.time.slice(11, 13)) + 1) % 24 : -1
    return { text: end < 0 ? 'Raining now' : `Raining now, until about ${hour12(end)} ${mer(end)}`, peak: Math.max(0, ...win.map((w) => w.prob ?? 0)) }
  }
  let i = 0
  while (i < win.length && !hit(i)) i++
  if (i >= win.length) return null
  let j = i
  let peak = 0
  while (j < win.length && hit(j)) { peak = Math.max(peak, win[j]!.prob!); j++ }
  const hr = (k: number) => Number(win[k]!.time.slice(11, 13))
  const day = win[i]!.time.slice(0, 10)
  const tomorrow = day > nowLocal.slice(0, 10)
  const start = hr(i)
  const end = (hr(j - 1) + 1) % 24
  const now = i === 0 && win[0]!.time.slice(0, 13) === nowLocal.slice(0, 13)
  const when = now ? `now until ${hour12(end)} ${mer(end)}` : `${tomorrow ? 'tomorrow ' : ''}${hourSpan(start, end)}`
  return { text: `Rain likely ${when} (${Math.round(peak)}%)`, peak }
}

export interface ActionIn {
  heatIndexC: number | null
  hourly: HourlyRain[]
  nowLocal: string
  uvMax: number | null
  warning?: WarningIn | null
  raining?: boolean // it is raining now (sky, airport or model): the rain line says so, not "likely"
}

/** Every action that applies, worst first. Caution (27-32 C heat index) is the everyday Philippine reading, so it shows on the heat scale but
 *  does not earn an action line; Extreme caution and above do. */
export function actionLines(i: ActionIn): ActionLine[] {
  const out: ActionLine[] = []
  const w = i.warning
  if (w) {
    if (w.kind === 'air') out.push({ id: 'air', rank: 35, text: w.doNow?.trim() || w.title })
    else out.push({ id: 'warning', rank: 100, text: w.doNow?.trim() ? `${w.title}. ${w.doNow.trim()}` : w.title })
  }
  const band: HeatBand | null = heatBand(i.heatIndexC)
  if (band && band.level >= 2) out.push({ id: 'heat', rank: band.level === 4 ? 90 : band.level === 3 ? 80 : 40, text: band.action, band: `Heat index ${Math.round(i.heatIndexC!)}° · ${band.label}` })
  const rain = rainWatch(i.hourly, i.nowLocal, i.raining)
  if (rain) out.push({ id: 'rain', rank: 50, text: rain.text })
  const h = Number(i.nowLocal.slice(11, 13))
  if (i.uvMax != null && i.uvMax >= UV_STRONG && h < 15) out.push({ id: 'uv', rank: 30, text: UV_TEXT })
  return out.sort((a, b) => b.rank - a.rank)
}

/** The worst one, or null. */
export const actionLine = (i: ActionIn): ActionLine | null => actionLines(i)[0] ?? null
