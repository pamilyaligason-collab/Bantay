import { logActivity, logMedTaken, logReading } from '../log/store'
import { track } from '../admin/events'
import { selfIdOrCached } from '../sync/profile'

/** Writes behind the Today quick-log row. All go through the shared log store (local first, then the outbox).
 *  Signed out: nothing is written and the person is told, never a silent success. */
export type LogResult = 'ok' | 'signedout' | 'failed'

async function asPerson(fn: (personId: string) => Promise<unknown>): Promise<LogResult> {
  try {
    const id = await selfIdOrCached()
    if (!id) return 'signedout'
    await fn(id)
    return 'ok'
  } catch {
    return 'failed' // storage blocked: say so
  }
}

const now = () => new Date().toISOString()

/** No table fits "I'm OK", so it is an activity row of kind 'check-in' (no minutes, no steps). */
export const checkIn = () => asPerson(async (personId) => {
  await logActivity({ personId, kind: 'check-in', minutes: null, steps: null, startedAt: now(), source: 'manual' })
  void track('action', 'checkin_done')
})
/** No mood table either: activity kind mood-good | mood-ok | mood-low. */
export const logMood = (m: 'good' | 'ok' | 'low') => asPerson((personId) => logActivity({ personId, kind: `mood-${m}`, minutes: null, steps: null, startedAt: now(), source: 'manual' }))
export const takeDose = (name: string) => asPerson((personId) => logMedTaken({ personId, name, takenAt: now() }))
export const logBp = (sys: number, dia: number) =>
  asPerson(async (personId) => {
    const takenAt = now()
    await logReading({ personId, takenAt, test: 'bp_systolic', value: sys, unit: 'mmHg' })
    await logReading({ personId, takenAt, test: 'bp_diastolic', value: dia, unit: 'mmHg' })
  })
export const logSugar = (v: number, fasting: boolean) => asPerson((personId) => logReading({ personId, takenAt: now(), test: fasting ? 'fasting_glucose' : 'glucose', value: v, unit: 'mg/dL' }))
export const logWeight = (kg: number) => asPerson((personId) => logReading({ personId, takenAt: now(), test: 'weight', value: kg, unit: 'kg' }))

export const FAIL_TEXT: Record<Exclude<LogResult, 'ok'>, string> = {
  signedout: 'Sign in first, then try again.',
  failed: 'Could not save on this phone. Try again.'
}
