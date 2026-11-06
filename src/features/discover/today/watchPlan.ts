import { videoOfTheDay } from '../../today/videos'
import { featured } from './featured'

/** Today's Watch block: the main videos are prepping and health (taken in turn, prepping first), DIY comes after them. One big main video, then a row of the next two main videos and one DIY video; the same day always gives the same picks. */
export function watchPlan<T>(now: Date, prep: T[], health: T[], diy: T[]): { hero: T | null; row: T[] } {
  const main: T[] = []
  for (let i = 0; i < Math.max(prep.length, health.length); i++) { if (i < prep.length) main.push(prep[i]!); if (i < health.length) main.push(health[i]!) }
  const { hero, more } = featured(now, main)
  return { hero, row: [...more, ...(diy.length ? [videoOfTheDay(now, diy)] : [])] }
}
