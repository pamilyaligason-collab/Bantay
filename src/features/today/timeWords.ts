/** S28: the one wording of a clock time and of "how long ago" on Today. 'h:mm AM/PM' always upper case (never 'pm'); durations in whole words ('3 days ago'). */
export const clock12 = (d: Date | number | string, timeZone?: string): string => {
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  const f = (tz?: string) => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).replace(/\s/g, ' ').toUpperCase()
  try { return f(timeZone) } catch { return f() }
}

const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** '5 minutes ago', '1 hour ago', '3 days ago' from whole minutes. */
export const agoWords = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes))
  return `${m < 60 ? unit(m, 'minute') : m < 1440 ? unit(Math.round(m / 60), 'hour') : unit(Math.round(m / 1440), 'day')} ago`
}

/** Keeps a number with its unit and a time with AM/PM on one line, so a narrow kicker never leaves '9:09' on one line and 'PM' on the next. */
export const noBreak = (s: string): string => s.replace(/(\d) (?=(?:days?|hours?|minutes?|AM|PM)\b)/g, '$1 ').replace(/\bof (?=\d)/g, 'of ')
