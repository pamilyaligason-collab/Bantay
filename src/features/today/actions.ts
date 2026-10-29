import { useEffect, useState } from 'react'
import { pickSlot } from '../health/meds'
import { logActivity, logDose, logMedTaken, logReading, type MedTaken, type Medication } from '../log/store'
import { track } from '../admin/events'
import { supabase } from '../auth/client'
import { selfIdOrCached } from '../sync/profile'
import { db } from '../../db'

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
 *  'told' = saved (and, for Unwell, the alert call went through); 'untold' = Unwell saved here but the network was down; it is queued and retried, so the family has not seen it yet;
 *  'nobody' = Unwell saved here and the server answered, but it reached no carer (a person with a login has no writer carer by design, D-22): the family was NOT told;
 *  'refused' = Unwell saved here but the server said no (signed out, not allowed); it is NOT queued, the person must call. */
export const FEELINGS = [['great', 'Great'], ['ok', 'OK'], ['notgreat', 'Not great'], ['unwell', 'Unwell']] as const
export type Feeling = (typeof FEELINGS)[number][0]
const MOOD: Record<Feeling, 'good' | 'ok' | 'low'> = { great: 'good', ok: 'ok', notgreat: 'low', unwell: 'low' }
export async function logFeeling(f: Feeling): Promise<'told' | 'nobody' | 'untold' | 'refused' | Exclude<LogResult, 'ok'>> {
  let id = ''
  const r = await asPerson(async (personId) => {
    id = personId
    await logActivity({ personId, kind: `mood-${MOOD[f]}`, minutes: null, steps: null, startedAt: now(), source: 'manual' })
    await logActivity({ personId, kind: 'check-in', minutes: null, steps: null, startedAt: now(), source: 'manual' })
    void track('action', 'checkin_done')
  })
  if (r !== 'ok') return r
  if (f !== 'unwell') { await db.kv.delete(UNSENT).catch(() => undefined); return 'told' } // a later Great/OK/Not great supersedes a queued Unwell
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return (await queueUnsent(id)) ? 'untold' : 'failed' // offline: do not even try
  const sent = await raise(id)
  if (sent === 'sent') return 'told'
  if (sent === 'refused') return 'refused'
  if (sent === 'nobody') return 'nobody'
  return (await queueUnsent(id)) ? 'untold' : 'failed' // never lost: retryUnsentMood sends it on reconnect and on Today mount
}

/** Unwell that could not reach the server waits here (kv `mood.unsent`) and is sent by retryUnsentMood. The server keeps one alert per person per day (0030:82), so a repeat is harmless. */
const UNSENT = 'mood.unsent'
const UNSENT_MAX_MS = 24 * 3_600_000 // shortcut: older than a day is dropped, an old "unwell" is not news; raise if the family wants it
async function queueUnsent(personId: string): Promise<boolean> {
  try { await db.kv.put({ key: UNSENT, value: { personId, at: Date.now() } }); return true } catch { return false }
}
/** Only a network failure is 'offline' (worth a retry). A refusal (42501, signed out, no client) will not get better by waiting. */
const isNetwork = (e: { code?: string; message?: string }) => !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '')
/** raise_mood_alert returns how many carer alerts it made (0 = no writer carer, or one was already sent today). Told-today is kept in kv so a second Unwell the same day, which makes 0 new rows, still reads 'sent'. */
const manilaDay = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
async function raise(personId: string): Promise<'sent' | 'nobody' | 'offline' | 'refused'> {
  try {
    if (!supabase) return 'refused'
    const { data, error } = await supabase.rpc('raise_mood_alert', { p_person: personId })
    if (error) return isNetwork(error as { code?: string; message?: string }) ? 'offline' : 'refused'
    const key = `mood.told.${personId}.${manilaDay()}`
    if (typeof data === 'number' && data > 0) { await db.kv.put({ key, value: true }).catch(() => undefined); return 'sent' }
    return (await db.kv.get(key).catch(() => undefined)) ? 'sent' : 'nobody' // unknown count counts as nobody: never promise what we cannot show
  } catch {
    return 'offline'
  }
}
/** true when someone with edit rights (a writer carer) will get this person's alerts. undefined while unknown (reading, offline): no promise is made then.
 *  shortcut: not cached offline, so the promise hides offline; cache in kv like MedDetail's loader if that matters. */
export function useHasWriterCarer(personId: string | null | undefined): boolean | undefined {
  const [got, setGot] = useState<{ id: string; on: boolean }>()
  useEffect(() => {
    if (!personId || !supabase) return
    let live = true
    void (async () => {
      try {
        const r = await supabase!.from('carers').select('carer_id').eq('person_id', personId).eq('can_write', true)
        if (live && !r.error) setGot({ id: personId, on: (r.data ?? []).length > 0 })
      } catch { /* unknown: say nothing */ }
    })()
    return () => { live = false }
  }, [personId])
  return got && got.id === personId ? got.on : undefined
}
/** The line under the mood faces. Only promises the family sees it when a writer carer exists. */
export const moodLine = (writer: boolean | undefined) => writer ? 'Your family will see it in Bantay.' : 'Saved on this phone. If you feel unwell, call your family.'
let retrying: Promise<RetryResult> | null = null
export type RetryResult = 'sent' | 'nobody' | 'none' | 'offline' | 'refused' | { expired: string }
/** One run at a time (Today mount and the online event can fire together). */
export const retryUnsentMood = (): Promise<RetryResult> => (retrying ??= retryOnce().finally(() => { retrying = null }))
async function retryOnce(): Promise<RetryResult> {
  let v: { personId?: string; at?: number } | undefined
  try { v = (await db.kv.get(UNSENT))?.value as typeof v } catch { return 'none' }
  if (!v?.personId) return 'none'
  if (typeof v.at !== 'number') { await db.kv.delete(UNSENT).catch(() => undefined); return 'none' }
  if (Date.now() - v.at > UNSENT_MAX_MS) {
    await db.kv.delete(UNSENT).catch(() => undefined)
    return { expired: new Date(v.at).toLocaleDateString('en-PH', { weekday: 'long' }) }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const r = await raise(v.personId)
  if (r === 'offline') return 'offline'
  await db.kv.delete(UNSENT).catch(() => undefined)
  return r
}
export const retryToast = (r: RetryResult): string | null =>
  r === 'sent' ? 'Your family has been told you are unwell.' : r === 'nobody' ? NOBODY : r === 'refused' ? NOT_TOLD : typeof r === 'object' ? `Your Unwell from ${r.expired} did not reach your family. Call them.` : null
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

const NOT_TOLD = 'Your family was not told. Call them.'
const NOBODY = 'Saved. No one gets your alerts yet. Call your family.'
/** The toast after a face. Unwell saved here but not raised on the server is never reported as told (D-78: the family sees it in Bantay, no push). retryUnsentMood replays it (kv `mood.unsent`) on reconnect and on Today mount. */
export const feelingToast = (r: Awaited<ReturnType<typeof logFeeling>>) => r === 'told' ? 'Saved. Your family will see it in Bantay.' : r === 'untold' ? 'Saved. We will tell them when you are online.' : r === 'nobody' ? NOBODY : r === 'refused' ? NOT_TOLD : FAIL_TEXT[r]
