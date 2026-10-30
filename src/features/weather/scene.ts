import { heatBand, heatIndexC } from './heatIndex'

// Pure picks for the weather scene: time of day from the place's own sunrise and sunset, condition layers from the WMO weather code.
// No clock, no network. The picture itself is WeatherScene.tsx.

export type Tod = 'night' | 'dawn' | 'day' | 'dusk'
export type Cond = 'none' | 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'storm'
export const TODS: readonly Tod[] = ['night', 'dawn', 'day', 'dusk']
export const CONDS: readonly Cond[] = ['clear', 'partly', 'overcast', 'fog', 'drizzle', 'rain', 'storm']

/** Sky gradient top and bottom per time of day. The scrim over the scene is SCRIM, so white text stays AA (see scene.test.ts). */
export const SKY: Record<Tod, readonly [string, string]> = {
  night: ['#0B1636', '#25396F'],
  dawn: ['#4B4F96', '#F2A57A'],
  day: ['#2F7CCB', '#86C3F2'],
  dusk: ['#3C3A7C', '#F0895C']
}
export const SCRIM = 0.58 // black-blue veil, alpha, drawn between the picture and the text

/** Which layers a state draws (WeatherScene renders from this, scene.test.ts gates the same list). */
export interface Layers { stars: boolean; sun: boolean; moon: boolean; clouds: 0 | 2 | 4; haze: boolean; fog: boolean; rain: number; flash: boolean; heat: boolean; shimmer: boolean }
const RAIN: Partial<Record<Cond, number>> = { drizzle: 10, rain: 18, storm: 24 }
export function layersFor(tod: Tod, cond: Cond, hot = false): Layers {
  const night = tod === 'night'
  const wet = cond === 'drizzle' || cond === 'rain' || cond === 'storm'
  const body = cond === 'clear' || cond === 'partly' || cond === 'none'
  return {
    stars: night && cond !== 'overcast' && !wet && cond !== 'fog',
    sun: body && !night, moon: body && night,
    clouds: cond === 'partly' || cond === 'fog' ? 2 : cond === 'clear' || cond === 'none' ? 0 : 4,
    haze: cond === 'overcast' || cond === 'fog' || wet, fog: cond === 'fog',
    rain: RAIN[cond] ?? 0, flash: cond === 'storm', heat: hot, shimmer: hot
  }
}

/** The brightest colour each layer can reach at its highest opacity, over the sky. scene.css must carry the same hex (scene.test.ts greps it); the contrast gate uses these. */
export const LIT = {
  sun: { hex: '#FFF4C8', a: 1 }, sunGlow: { hex: '#FFD66B', a: 0.45 },
  moon: { hex: '#F4F1E6', a: 1 }, moonGlow: { hex: '#F4F1E6', a: 0.35 },
  cloud: { hex: '#FFFFFF', a: 0.55 }, fog: { hex: '#EBF0F5', a: 0.55 },
  rain: { hex: '#DCEBFF', a: 0.85 }, flash: { hex: '#FFFFFF', a: 0.55 },
  heat: { hex: '#FF781E', a: 0.5 }, shimmer: { hex: '#FFFFFF', a: 0.18 }, star: { hex: '#FFFFFF', a: 1 }
} as const
export const litOf = (l: Layers): (keyof typeof LIT)[] => [
  ...(l.sun ? ['sun', 'sunGlow'] as const : []), ...(l.moon ? ['moon', 'moonGlow'] as const : []), ...(l.stars ? ['star'] as const : []),
  ...(l.clouds ? ['cloud'] as const : []), ...(l.fog ? ['fog'] as const : []), ...(l.rain ? ['rain'] as const : []),
  ...(l.flash ? ['flash'] as const : []), ...(l.heat ? ['heat'] as const : []), ...(l.shimmer ? ['shimmer'] as const : [])
]

const mins = (t: string | null | undefined): number | null => {
  const m = /T(\d{2}):(\d{2})/.exec(t ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Time of day from the place-local clock ("YYYY-MM-DDTHH:MM") and today's place-local sunrise and sunset. Without them: 6 AM / 6 PM. */
export function todOf(nowLocal: string, sunrise?: string | null, sunset?: string | null): Tod {
  const n = mins(nowLocal)
  if (n == null) return 'day'
  const up = mins(sunrise) ?? 6 * 60
  const down = mins(sunset) ?? 18 * 60
  if (n < up - 30 || n >= down + 45) return 'night'
  if (n < up + 60) return 'dawn'
  if (n >= down - 60) return 'dusk'
  return 'day'
}

/** WMO weather_code to the scene's condition. Unknown stays 'none' (sky only), never a guessed clear. */
export function condOf(code: number | null | undefined): Cond {
  if (code == null || !Number.isFinite(code)) return 'none'
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'overcast'
  if (code <= 48) return 'fog'
  if (code <= 57) return 'drizzle'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'overcast' // snow: not seen in the Philippines, drawn as grey sky
  if (code <= 82) return 'rain'
  if (code <= 86) return 'overcast'
  return 'storm'
}

/** The one "Feels like" for the app. The heat index (what the action line and PAGASA bands use) when it reaches the Caution band,
 *  else the forecast's apparent temperature. `label` is the PAGASA band, only for Extreme caution and above, and only when it is the heat index being shown. */
export function feelsLike(temp: number | null | undefined, humidity: number | null | undefined, apparent: number | null | undefined): { value: number | null; label: string | null } {
  const hi = heatIndexC(temp, humidity)
  const band = heatBand(hi)
  if (hi != null && band) return { value: hi, label: band.level >= 2 ? band.label : null }
  const a = apparent != null && Number.isFinite(apparent) ? apparent : hi
  return { value: a, label: null }
}

/** Heat tint on the scene: Danger (heat index 42 C) and above. */
export const isHot = (temp: number | null | undefined, humidity: number | null | undefined): boolean => (heatBand(heatIndexC(temp, humidity))?.level ?? 0) >= 3
