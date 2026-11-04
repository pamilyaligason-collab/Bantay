export interface HourlyRain { time: string; prob: number | null }
export const HERO_RAIN_FROM_PCT = 30

const part = (h: number) => (h >= 5 && h < 12 ? 'this morning' : h >= 12 && h < 18 ? 'this afternoon' : h >= 18 && h < 22 ? 'this evening' : 'tonight')

/** The hero's own rain line, from the place-local hourly forecast: the highest chance from now to the end of the local day, named by the part of the day it falls in.
 *  "Rain 55% this evening"; null under 30% or without hourly data (never a guess). Times are "YYYY-MM-DDTHH:MM". */
export function heroRainLine(hourly: HourlyRain[], nowLocal: string): string | null {
  const day = nowLocal.slice(0, 10)
  const hour = nowLocal.slice(0, 13)
  let best: { pct: number; h: number } | null = null
  for (const r of hourly) {
    if (r.prob == null || r.time.slice(0, 10) !== day || r.time.slice(0, 13) < hour) continue
    if (!best || r.prob > best.pct) best = { pct: r.prob, h: Number(r.time.slice(11, 13)) }
  }
  return best && best.pct >= HERO_RAIN_FROM_PCT ? `Rain ${Math.round(best.pct)}% ${part(best.h)}` : null
}
