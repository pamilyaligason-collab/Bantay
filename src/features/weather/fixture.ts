// Made-up Open-Meteo answer for tests (unit and e2e). Not real weather. Times are place-local, built from `now` and the offset.
export interface FixtureOpts {
  now?: Date
  offsetS?: number
  tz?: string
  temp?: number
  humidity?: number
  feels?: number
  /** rain chance for a local hour of the day (0-23) */
  hourlyProb?: (hourOfDay: number) => number
  uvMax?: number
}

const local = (ms: number) => new Date(ms).toISOString().slice(0, 16)

export function openMeteoFixture(o: FixtureOpts = {}) {
  const off = o.offsetS ?? 8 * 3600
  const nowL = (o.now ?? new Date()).getTime() + off * 1000
  const dayStart = Math.floor(nowL / 86400_000) * 86400_000
  const times = Array.from({ length: 24 * 7 }, (_, i) => dayStart + i * 3600_000)
  const prob = o.hourlyProb ?? ((h: number) => (h >= 14 && h <= 17 ? 80 : 10))
  return {
    latitude: 9.65, longitude: 123.88, timezone: o.tz ?? 'Asia/Manila', utc_offset_seconds: off,
    current: { time: local(Math.floor(nowL / 3600_000) * 3600_000), temperature_2m: o.temp ?? 33, relative_humidity_2m: o.humidity ?? 68, apparent_temperature: o.feels ?? 42, weather_code: 2, wind_speed_10m: 9, wind_gusts_10m: 18, uv_index: 9 },
    hourly: {
      time: times.map(local),
      temperature_2m: times.map((_, i) => 27 + Math.round(7 * Math.max(0, Math.sin(((i % 24) - 6) / 12 * Math.PI)))),
      precipitation_probability: times.map((_, i) => prob(i % 24)),
      weather_code: times.map((_, i) => (prob(i % 24) >= 60 ? 63 : 2))
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => local(dayStart + i * 86400_000).slice(0, 10)),
      weather_code: [2, 63, 63, 2, 0, 2, 63],
      temperature_2m_min: [26, 25, 25, 26, 26, 26, 25],
      temperature_2m_max: [34, 32, 31, 33, 34, 33, 31],
      precipitation_probability_max: [30, 88, 70, 20, 10, 25, 60],
      uv_index_max: [o.uvMax ?? 10, 9, 8, 9, 10, 9, 7]
    }
  }
}
