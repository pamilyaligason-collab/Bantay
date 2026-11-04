// The one sentence under the hero. Pure: it names which rain figure it speaks of (daily max vs the next hours).
import { RAIN_WATCH_PCT } from './actionLine'

export const CALM_LINE = 'Nothing to act on now. No heat, rain or strong sun to plan around.'

/** `lines`: the action lines already worked out (heat, hourly rain, sun). When any exist the screen shows those and this returns null.
 *  daily: today's highest rain chance; hourly: the highest in the next hours; tomorrow: tomorrow's chance. */
export function adviceLine(daily: number | null, hourly: number | null, lines: readonly unknown[], tomorrow: number | null = null): string | null {
  if (lines.length) return null
  const rounded = (n: number) => Math.round(n)
  if (daily != null && daily >= RAIN_WATCH_PCT && (hourly ?? 0) < RAIN_WATCH_PCT) return `Rain likely later today (up to ${rounded(daily)}%). Nothing to act on in the next hours.`
  if (tomorrow != null && tomorrow >= RAIN_WATCH_PCT) return `Rain likely tomorrow (${rounded(tomorrow)}%).`
  return CALM_LINE
}
