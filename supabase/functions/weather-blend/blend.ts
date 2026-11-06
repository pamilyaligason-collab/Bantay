// Hyperlocal weather blend (v13 lane Q, D-105..D-108; design in docs/redesign-2026-10-31/WEATHER-BLEND.md). Pure: three provider parsers,
// the per-hour median and the next-2-hours rain line. No Deno globals, so vitest runs it; index.ts adds the database and the secret.
// Every time is the Manila wall clock "YYYY-MM-DDTHH:MM", like the app's Open-Meteo forecast (forecast.ts), so the app reads either one.

export const TZ = 'Asia/Manila'
export const UTC_OFFSET = 8 * 3600 // the whole Philippines is UTC+8, no daylight saving
export const TTL_MS = 30 * 60_000 // one fetch per cell per 30 minutes, shared by every family member in that cell
// MET Norway's terms ask for an app name and a contact; the owner may swap the repo link for an email (WEATHER-BLEND.md, deploy steps)
export const USER_AGENT = 'FamilyBantay/1.0 (+https://github.com/pamilyaligason-collab/Bantay)'

export type ProviderId = 'open-meteo' | 'met-norway' | 'openweather'
export interface Cell { lat: number; lon: number }
export interface Now { time: string; temp: number | null; humidity: number | null; feels: number | null; code: number | null; wind: number | null; gust: number | null; uv: number | null } // wind, gust km/h
export interface Hour { time: string; temp: number | null; prob: number | null; code: number | null; rain: number | null } // rain: mm in that hour
export interface Day { date: string; code: number | null; min: number | null; max: number | null; prob: number | null; uvMax: number | null; sunrise: string | null; sunset: string | null }
export interface Alert { source: string; event: string; start: string; end: string; description: string }
export interface Air { index: number; label: string; pm25: number | null; pm10: number | null } // OpenWeather's 1 (good) .. 5 (very poor)
export interface Slot { time: string; mmh: number | null; estimated: boolean } // 10-minute rain rate; estimated = not from OpenWeather minutely
export interface Series { id: ProviderId; now: Now | null; hours: Hour[]; days: Day[]; minutely?: { ms: number; mm: number }[]; alerts?: Alert[] }
export interface Source { id: ProviderId; ok: boolean; reason?: 'no_key' | 'key_inactive' | 'http' | 'unreachable' | 'bad_data'; credit: string; url: string }
export interface Check { station: string; name: string; observedAt: string; observedTemp: number; forecastTemp: number; bias: number } // METAR vs blended now
export interface Blended { cell: Cell; fetchedAt: string; tz: string; utcOffset: number; now: Now; next2h: Slot[]; hourly48: Hour[]; daily10: Day[]; aqi: Air | null; alerts: Alert[]; sources: Source[]; check: Check | null }
export interface MetCache { expires: string; series: Series }
export interface Gathered { series: Series[]; sources: Source[]; aqi: Air | null; met?: MetCache | null }

const CREDIT: Record<ProviderId, [string, string]> = {
  'open-meteo': ['Weather data by Open-Meteo.com (CC BY 4.0)', 'https://open-meteo.com/'],
  'met-norway': ['Data from MET Norway (CC BY 4.0)', 'https://api.met.no/'],
  openweather: ['Weather data provided by OpenWeather', 'https://openweathermap.org/']
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null) // unknown stays null, never 0
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const r1 = (n: number) => Math.round(n * 10) / 10
const kmh = (ms: unknown) => { const n = num(ms); return n == null ? null : r1(n * 3.6) }
const local = (ms: number) => new Date(ms + UTC_OFFSET * 1000).toISOString().slice(0, 16)
const unix = (v: unknown) => { const n = num(v); return n == null ? '' : local(n * 1000) }
const hourOf = (t: string) => `${t.slice(0, 13)}:00`
const msOf = (t: string) => Date.parse(`${t}:00Z`) - UTC_OFFSET * 1000

/** {lat, lon} rounded to 2 decimals (about 1.1 km) inside a box around the Philippines, else null. */
export function cellOf(b: unknown): Cell | null {
  const o = obj(b)
  const lat = num(o.lat)
  const lon = num(o.lon)
  if (lat == null || lon == null || lat < 4 || lat > 22 || lon < 116 || lon > 127) return null
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }
}

export const openMeteoUrl = (c: Cell) =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${c.lat}&longitude=${c.lon}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index' +
  '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
  '&daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,uv_index_max,sunrise,sunset' +
  `&forecast_days=10&timezone=${encodeURIComponent(TZ)}`
export const metUrl = (c: Cell) => `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${c.lat}&lon=${c.lon}`
const owUrl = (path: string, c: Cell, key: string) => `https://api.openweathermap.org/data/${path}?lat=${c.lat}&lon=${c.lon}&units=metric&appid=${encodeURIComponent(key)}`

export function parseOpenMeteo(j: unknown): Series | null {
  const o = obj(j)
  const c = obj(o.current)
  const h = obj(o.hourly)
  const d = obj(o.daily)
  if (!o.current) return null
  const at = (k: string, i: number, src = h) => num(arr(src[k])[i])
  return {
    id: 'open-meteo',
    now: { time: str(c.time), temp: num(c.temperature_2m), humidity: num(c.relative_humidity_2m), feels: num(c.apparent_temperature), code: num(c.weather_code), wind: num(c.wind_speed_10m), gust: num(c.wind_gusts_10m), uv: num(c.uv_index) },
    hours: arr(h.time).map((t, i) => ({ time: str(t), temp: at('temperature_2m', i), prob: at('precipitation_probability', i), code: at('weather_code', i), rain: at('precipitation', i) })),
    days: arr(d.time).map((t, i) => ({ date: str(t), code: at('weather_code', i, d), min: at('temperature_2m_min', i, d), max: at('temperature_2m_max', i, d), prob: at('precipitation_probability_max', i, d), uvMax: at('uv_index_max', i, d), sunrise: str(arr(d.sunrise)[i]) || null, sunset: str(arr(d.sunset)[i]) || null }))
  }
}

/** MET symbol_code to the WMO code the app already draws. */
function metCode(s: string): number | null {
  const b = s.replace(/_(day|night|polartwilight)$/, '')
  if (b.includes('thunder')) return 95
  if (b.includes('showers')) return b.startsWith('heavy') ? 82 : b.startsWith('light') ? 80 : 81
  if (b.includes('rain') || b.includes('sleet')) return b.startsWith('heavy') ? 65 : b.startsWith('light') ? 61 : 63
  if (b.includes('snow')) return 73
  return ({ clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45 } as Record<string, number>)[b] ?? null
}

/** Only the hourly part of the timeseries (entries with next_1_hours, about 2.5 days); MET adds no daily rows. */
export function parseMet(j: unknown): Series | null {
  const rows = arr(obj(obj(j).properties).timeseries).map(obj).flatMap((e) => {
    const d = obj(e.data)
    const n1 = obj(d.next_1_hours)
    const ms = Date.parse(str(e.time))
    return d.next_1_hours && !Number.isNaN(ms) ? [{ t: local(ms), i: obj(obj(d.instant).details), n: obj(n1.details), code: metCode(str(obj(n1.summary).symbol_code)) }] : []
  })
  if (!rows.length) return null
  const f = rows[0]
  return {
    id: 'met-norway',
    // feels and uv left unknown: MET has no apparent temperature, and its UV is the clear-sky value, which overstates under cloud
    now: { time: f.t, temp: num(f.i.air_temperature), humidity: num(f.i.relative_humidity), feels: null, code: f.code, wind: kmh(f.i.wind_speed), gust: kmh(f.i.wind_speed_of_gust), uv: null },
    hours: rows.map((r) => ({ time: hourOf(r.t), temp: num(r.i.air_temperature), prob: num(r.n.probability_of_precipitation), code: r.code, rain: num(r.n.precipitation_amount) })),
    days: []
  }
}

/** OpenWeather condition id to WMO code. */
const owCode = (id: number | null): number | null =>
  id == null ? null : id < 300 ? 95 : id < 400 ? 53 : id === 500 ? 61 : id === 501 ? 63 : id < 505 ? 65 : id === 511 ? 66 : id === 520 ? 80 : id === 521 ? 81 : id < 600 ? 82 : id < 700 ? 73 : id < 800 ? 45 : id === 800 ? 0 : id === 801 ? 1 : id === 802 ? 2 : 3

export function parseOpenWeather(j: unknown): Series | null {
  const o = obj(j)
  if (!o.current) return null
  const c = obj(o.current)
  const code = (x: Record<string, unknown>) => owCode(num(obj(arr(x.weather)[0]).id))
  const pct = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n * 100) }
  return {
    id: 'openweather',
    now: { time: unix(c.dt), temp: num(c.temp), humidity: num(c.humidity), feels: num(c.feels_like), code: code(c), wind: kmh(c.wind_speed), gust: kmh(c.wind_gust), uv: num(c.uvi) },
    hours: arr(o.hourly).map(obj).map((x) => ({ time: hourOf(unix(x.dt)), temp: num(x.temp), prob: pct(x.pop), code: code(x), rain: num(obj(x.rain)['1h']) ?? 0 })), // OpenWeather leaves rain out when there is none
    days: arr(o.daily).map(obj).map((x) => ({ date: unix(x.dt).slice(0, 10), code: code(x), min: num(obj(x.temp).min), max: num(obj(x.temp).max), prob: pct(x.pop), uvMax: num(x.uvi), sunrise: unix(x.sunrise) || null, sunset: unix(x.sunset) || null })),
    minutely: arr(o.minutely).map(obj).flatMap((m) => { const t = num(m.dt); const mm = num(m.precipitation); return t != null && mm != null ? [{ ms: t * 1000, mm }] : [] }),
    alerts: arr(o.alerts).map(obj).map((a) => ({ source: str(a.sender_name), event: str(a.event), start: unix(a.start), end: unix(a.end), description: str(a.description).slice(0, 600) }))
  }
}

const AQI_WORDS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor']
export function parseAir(j: unknown): Air | null {
  const e = obj(arr(obj(j).list)[0])
  const i = num(obj(e.main).aqi)
  if (i == null || i < 1 || i > 5) return null
  const c = obj(e.components)
  return { index: i, label: AQI_WORDS[i - 1], pm25: num(c.pm2_5), pm10: num(c.pm10) }
}

const vals = (xs: (number | null)[]) => xs.filter((x): x is number => x != null).sort((a, b) => a - b)
/** Median of the providers that have a value; null when none does. */
const mid = (xs: (number | null)[]) => { const v = vals(xs); const m = v.length >> 1; return !v.length ? null : v.length % 2 ? v[m] : r1((v[m - 1] + v[m]) / 2) }
/** Codes are categories, so take one provider's real code; with two, the more severe (higher WMO) one. */
const midCode = (xs: (number | null)[]) => { const v = vals(xs); return v.length ? v[v.length >> 1] : null }
const first = (xs: (string | null)[]) => xs.find((x) => x) ?? null

function groups<T>(rows: T[], key: (r: T) => string, from: string, n: number): T[][] {
  const m = new Map<string, T[]>()
  for (const r of rows) { const k = key(r); if (k >= from) m.set(k, [...(m.get(k) ?? []), r]) }
  return [...m.keys()].sort().slice(0, n).map((k) => m.get(k)!)
}

/** Linear interpolation over [ms, value] points sorted by time; flat before the first and after the last. */
export const interp = (pts: readonly (readonly [number, number])[], ms: number): number => {
  if (ms <= pts[0]![0]) return pts[0]![1]
  for (let i = 1; i < pts.length; i++) {
    const [a, ya] = pts[i - 1]!
    const [b, yb] = pts[i]!
    if (ms <= b) return ya + ((yb - ya) * (ms - a)) / (b - a)
  }
  return pts[pts.length - 1]![1]
}

const rateAt = (hours: Hour[], ms: number): number | null => {
  const pts = hours.flatMap((h) => (h.rain == null ? [] : [[msOf(h.time) + 1_800_000, h.rain] as const])) // an hour's total sits at its midpoint
  return pts.length ? r1(interp(pts, ms)) : null
}

/** Twelve 10-minute slots from now: OpenWeather minutely where it has minutes (60 min), else interpolated from the blended hourly rain. */
export function next2h(minutely: Series['minutely'], hours: Hour[], nowMs: number): Slot[] {
  const start = Math.floor(nowMs / 600_000) * 600_000
  return Array.from({ length: 12 }, (_, i) => {
    const t0 = start + i * 600_000
    const m = (minutely ?? []).filter((x) => x.ms >= t0 && x.ms < t0 + 600_000)
    return m.length
      ? { time: local(t0), mmh: r1(m.reduce((n, x) => n + x.mm, 0) / m.length), estimated: false }
      : { time: local(t0), mmh: rateAt(hours, t0 + 300_000), estimated: true }
  })
}

/** Per-hour and per-day median over whatever providers answered (at least one). */
export function blend(g: Gathered, cell: Cell, nowMs: number): Blended {
  const s = g.series
  const nows = s.flatMap((x) => (x.now ? [x.now] : []))
  const pick = <K extends keyof Now>(k: K) => mid(nows.map((n) => n[k] as number | null))
  const today = local(nowMs).slice(0, 10)
  // from local midnight, so today's earlier hours stay (Today's "rain came earlier" reads them), then 48 hours ahead
  const hourly48 = groups(s.flatMap((x) => x.hours), (h) => h.time, `${today}T00:00`, Number(local(nowMs).slice(11, 13)) + 48).map((hs) => ({
    time: hs[0].time, temp: mid(hs.map((h) => h.temp)), prob: mid(hs.map((h) => h.prob)), code: midCode(hs.map((h) => h.code)), rain: mid(hs.map((h) => h.rain))
  }))
  const daily10 = groups(s.flatMap((x) => x.days), (d) => d.date, today, 10).map((ds) => ({
    date: ds[0].date, code: midCode(ds.map((d) => d.code)), min: mid(ds.map((d) => d.min)), max: mid(ds.map((d) => d.max)), prob: mid(ds.map((d) => d.prob)), uvMax: mid(ds.map((d) => d.uvMax)), sunrise: first(ds.map((d) => d.sunrise)), sunset: first(ds.map((d) => d.sunset))
  }))
  const ow = s.find((x) => x.id === 'openweather')
  return {
    cell, fetchedAt: new Date(nowMs).toISOString(), tz: TZ, utcOffset: UTC_OFFSET,
    now: { time: local(nowMs), temp: pick('temp'), humidity: pick('humidity'), feels: pick('feels'), code: midCode(nows.map((n) => n.code)), wind: pick('wind'), gust: pick('gust'), uv: pick('uv') },
    next2h: next2h(ow?.minutely, hourly48, nowMs), hourly48, daily10, aqi: g.aqi, alerts: ow?.alerts ?? [], sources: g.sources, check: null
  }
}

type Fetch = typeof fetch
const src = (id: ProviderId, reason?: Source['reason']): Source => ({ id, ok: !reason, ...(reason ? { reason } : {}), credit: CREDIT[id][0], url: CREDIT[id][1] })

/** One call per provider, in parallel, 8 s each. A failure drops that provider; nothing here throws, logs, or returns the key. */
export async function gather(cell: Cell, key: string | undefined, f: Fetch, nowMs: number, met: MetCache | null): Promise<Gathered> {
  const get = async (url: string, init: RequestInit = {}): Promise<Response | 'unreachable'> => {
    try { return await f(url, { ...init, signal: AbortSignal.timeout(8_000) }) } catch { return 'unreachable' }
  }
  const read = async (id: ProviderId, r: Response | 'unreachable', parse: (j: unknown) => Series | null): Promise<[Series | null, Source]> => {
    if (r === 'unreachable') return [null, src(id, 'unreachable')]
    if (r.status === 401 && id === 'openweather') return [null, src(id, 'key_inactive')] // a new key returns 401 for its first hours: unavailable, not an error
    if (!r.ok) return [null, src(id, 'http')]
    const p = parse(await r.json().catch(() => null))
    return p ? [p, src(id)] : [null, src(id, 'bad_data')]
  }
  const metFresh = met && Date.parse(met.expires) > nowMs ? met : null // MET's terms: never ask again before Expires
  const [omR, metR, owR, airR] = await Promise.all([
    get(openMeteoUrl(cell)),
    metFresh ? null : get(metUrl(cell), { headers: { 'User-Agent': USER_AGENT } }),
    key ? get(owUrl('3.0/onecall', cell, key)) : null,
    key ? get(owUrl('2.5/air_pollution', cell, key)) : null
  ])
  const om = await read('open-meteo', omR, parseOpenMeteo)
  const mt: [Series | null, Source] = metFresh ? [metFresh.series, src('met-norway')] : await read('met-norway', metR!, parseMet)
  const owx: [Series | null, Source] = owR ? await read('openweather', owR, parseOpenWeather) : [null, src('openweather', 'no_key')]
  const aqi = airR && airR !== 'unreachable' && airR.ok ? parseAir(await airR.json().catch(() => null)) : null
  let metCache = metFresh
  if (!metFresh && mt[0] && metR && metR !== 'unreachable') {
    const exp = Date.parse(metR.headers.get('Expires') ?? '')
    metCache = { expires: new Date(Number.isNaN(exp) ? nowMs + TTL_MS : exp).toISOString(), series: mt[0] }
  }
  return { series: [om[0], mt[0], owx[0]].filter((x): x is Series => x != null), sources: [om[1], mt[1], owx[1]], aqi, met: metCache }
}
