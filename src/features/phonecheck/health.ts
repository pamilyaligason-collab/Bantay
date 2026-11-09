/** The one rule for "what is wrong with this phone's alarms", shared by the phone check, the Me row, the Phone alerts page and the Safety hub count (pure: no Capacitor). */
export interface CheckShape { notif_ok?: boolean | null; exact_ok?: boolean | null; battery_ok?: boolean | null; alarms_ok?: boolean | null; call_ok?: boolean | null; oem?: string | null }
export type Problem = 'notif' | 'exact' | 'battery' | 'alarms' | 'call'

/** What is wrong, most important first. Only an explicit false counts; unknown is not a problem. `alarms` is listed only when nothing more specific explains it.
 *  `battery` is a warning, not a problem, while exact alarms and notifications are both OK: those alarms still ring in Doze (D-162). */
export function probeProblems(r: CheckShape): Problem[] {
  const p: Problem[] = []
  if (r.notif_ok === false) p.push('notif')
  if (r.exact_ok === false) p.push('exact')
  if (r.battery_ok === false && !(r.exact_ok === true && r.notif_ok === true)) p.push('battery')
  if (r.alarms_ok === false && !p.length) p.push('alarms')
  if (r.call_ok === false) p.push('call')
  return p
}

/** Battery optimisation is on, but exact alarms and notifications are fine: an amber warning, never a failed check. */
export const batteryWarning = (r: CheckShape | null | undefined): boolean => !!r && r.battery_ok === false && r.exact_ok === true && r.notif_ok === true
export const BATTERY_WARNING_TEXT = 'Battery settings may delay some alarms. Tap Allow so Bantay can keep running.'

export type AlarmState = 'ok' | 'warn' | 'fix' | 'unknown'
/** Medicine alarms: fix when an alarm problem exists, warn for the battery warning, ok only when all four are known good. */
export function alarmState(c: CheckShape | null): AlarmState {
  if (!c) return 'unknown'
  if (probeProblems(c).some((p) => p !== 'call')) return 'fix'
  if (batteryWarning(c)) return 'warn'
  return [c.notif_ok, c.exact_ok, c.battery_ok, c.alarms_ok].every((x) => x === true) ? 'ok' : 'unknown'
}
