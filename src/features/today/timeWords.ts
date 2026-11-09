/** S28: the one wording of "how long ago" on Today ('3 days ago', in whole words). Clock times are clockIn (weather/forecast): 'h:mm AM/PM', always upper case. */

const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** '5 minutes ago', '1 hour ago', '3 days ago' from whole minutes. */
export const agoWords = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes))
  return `${m < 60 ? unit(m, 'minute') : m < 1440 ? unit(Math.floor(m / 60), 'hour') : unit(Math.floor(m / 1440), 'day')} ago`
}

/** Keeps a number with its unit and a time with AM/PM on one line, so a narrow kicker never leaves '9:09' on one line and 'PM' on the next. */
export const noBreak = (s: string): string => s.replace(/(\d) (?=(?:days?|hours?|minutes?|AM|PM)\b)/g, '$1 ').replace(/\bof (?=\d)/g, 'of ')

/** Today's wording of a safety check age: 'Checked 5 minutes ago' (Safety keeps its own short freshText). */
export const checkedWords = (ageMin: number | null): string => ageMin === null ? 'Never checked' : ageMin < 1 ? 'Checked just now' : `Checked ${noBreak(agoWords(ageMin))}`
