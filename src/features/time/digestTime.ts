import { dayIn, getZone, minutesIn, wallToMs } from './zone'

// S30 L9 (A10): the daily safety digest runs on the server at 06:45 Asia/Manila for the whole family (alerts-digest cron). The Alerts settings say
// what that is on THIS member's clock, asked from Intl at the instant so Texas daylight time is right (4:45 PM in winter, 5:45 PM in summer).
export const DIGEST_MANILA = '06:45'

const clock = (min: number): string => { const h = Math.floor(min / 60), m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }

export const SUMMARY_MANILA = '20:00' // the carers' "8 PM summary" (dose-watch) is also a Manila-clock time

/** "6:45 AM Manila time (4:45 PM Texas time)"; just "6:45 AM Manila time" on a Manila clock. */
export const digestTimeLine = (now: Date = new Date(), tz: string = getZone()): string => manilaTimeLine(DIGEST_MANILA, now, tz)
/** The same for the 8 PM carers' summary: "8:00 PM Manila time (6:00 AM Texas time)". */
export const summaryTimeLine = (now: Date = new Date(), tz: string = getZone()): string => manilaTimeLine(SUMMARY_MANILA, now, tz)

function manilaTimeLine(hhmm: string, now: Date, tz: string): string {
  const manila = 'Asia/Manila'
  const at = wallToMs(manila, dayIn(manila, now), hhmm)
  const own = `${clock(minutesIn(manila, at))} Manila time`
  if (tz === manila) return own
  // ponytail: America/Chicago is the only non-Manila family zone today; every other zone reads "on this phone". Add a label when a family member lives elsewhere.
  return `${own} (${clock(minutesIn(tz, at))} ${tz === 'America/Chicago' ? 'Texas time' : 'on this phone'})`
}
