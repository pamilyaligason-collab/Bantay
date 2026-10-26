import { pickSlot } from '../health/meds'
import { logActivity, logDose, logMedTaken, logReading, type MedTaken, type Medication } from '../log/store'
import { track } from '../admin/events'
import { supabase } from '../auth/client'
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
/** How are you? (quick log and Simple mode): four faces. The mood and a check-in are saved on this phone; Unwell also asks the server to tell the carers (`raise_mood_alert`, the only alert an app caller may raise, once a day).
 *  'told' = saved (and, for Unwell, the alert call went through); 'untold' = Unwell saved here but the alert call failed, so the family may not have seen it. */
export const FEELINGS = [['great', 'Great'], ['ok', 'OK'], ['notgreat', 'Not great'], ['unwell', 'Unwell']] as const
export type Feeling = (typeof FEELINGS)[number][0]
const MOOD: Record<Feeling, 'good' | 'ok' | 'low'> = { great: 'good', ok: 'ok', notgreat: 'low', unwell: 'low' }
export async function logFeeling(f: Feeling): Promise<'told' | 'untold' | Exclude<LogResult, 'ok'>> {
  let id = ''
  const r = await asPerson(async (personId) => {
    id = personId
    await logActivity({ personId, kind: `mood-${MOOD[f]}`, minutes: null, steps: null, startedAt: now(), source: 'manual' })
    await logActivity({ personId, kind: 'check-in', minutes: null, steps: null, startedAt: now(), source: 'manual' })
    void track('action', 'checkin_done')
  })
  if (r !== 'ok') return r
  if (f !== 'unwell') return 'told'
  try {
    const { error } = (await supabase?.rpc('raise_mood_alert', { p_person: id })) ?? { error: true } // signed out of the server or no client: nothing was raised
    return error ? 'untold' : 'told'
  } catch {
    return 'untold'
  }
}
export const takeDose = (name: string) => asPerson((personId) => logMedTaken({ personId, name, takenAt: now() }))
/** A dose of one of my medications from the quick log: logged against its medication id and the open slot nearest now (no slot for an as-needed medicine or an extra dose). */
export const takeMedication = (med: Medication, takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[]) => asPerson(async (personId) => {
  const slot = pickSlot(med, takes, new Date())
  if (slot) await logDose({ personId, name: med.name, serverId: med.serverId }, slot)
  else await logMedTaken({ personId, name: med.name, takenAt: now(), ...(med.serverId ? { medicationId: med.serverId } : {}) })
})
export const logBp = (sys: number, dia: number) =>
  asPerson(async (personId) => {
    const takenAt = now()
    await logReading({ personId, takenAt, test: 'bp_systolic', value: sys, unit: 'mmHg' })
    await logReading({ personId, takenAt, test: 'bp_diastolic', value: dia, unit: 'mmHg' }, { track: false }) // one blood pressure is one reading_added
  })
export const logSugar = (v: number, fasting: boolean) => asPerson((personId) => logReading({ personId, takenAt: now(), test: fasting ? 'fasting_glucose' : 'glucose', value: v, unit: 'mg/dL' }))
export const logWeight = (kg: number) => asPerson((personId) => logReading({ personId, takenAt: now(), test: 'weight', value: kg, unit: 'kg' }))

export const FAIL_TEXT: Record<Exclude<LogResult, 'ok'>, string> = {
  signedout: 'Sign in first, then try again.',
  failed: 'Could not save on this phone. Try again.'
}

/** The toast after a face. Unwell saved here but not raised on the server is never reported as told (D-78: the family sees it in Bantay, no push). */
export const feelingToast = (r: Awaited<ReturnType<typeof logFeeling>>) => r === 'told' ? 'Saved. Your family will see it in Bantay.' : r === 'untold' ? 'Saved on this phone. Your family has not seen it yet.' : FAIL_TEXT[r]
