import { useEffect, useState } from 'react'
import { manilaDay } from '../assistant/cap'
import { getMember } from '../auth/session'
import { pickSlot } from '../health/meds'
import { logActivity, logDose, logMedTaken, logReading, type MedTaken, type Medication } from '../log/store'
import { track } from '../admin/events'
import { supabase } from '../auth/client'
import { selfIdOrCached } from '../sync/profile'
import { db } from '../../db'

/** Writes behind the Today quick-log row. All go through the shared log store (local first, then the outbox).
 *  Signed out: nothing is written and the person is told, never a silent success. */
export type LogResult = 'ok' | 'signedout' | 'failed'

/** B2-2: the person is the signed-in one (selfIdOrCached) unless a named UI entry point passes `explicit` (View as, D-99). This file never reads the acting id itself (C-6). */
async function asPerson(fn: (personId: string) => Promise<unknown>, explicit?: string): Promise<LogResult> {
  try {
    const id = explicit || (await selfIdOrCached())
    if (!id) return 'signedout'
    await fn(id)
    return 'ok'
  } catch {
    return 'failed' // storage blocked: say so
  }
}

const now = () => new Date().toISOString()

/** No table fits "I'm OK", so it is an activity row of kind 'check-in' (no minutes, no steps). */
export const checkIn = (personId?: string) => asPerson(async (personId) => {
  await logActivity({ personId, kind: 'check-in', minutes: null, steps: null, startedAt: now(), source: 'manual' })
  void track('action', 'checkin_done')
}, personId)
/** How are you? (quick log and Simple mode): four faces. The mood and a check-in are saved on this phone; Unwell also asks the server to tell the carers (`raise_mood_alert`, the only alert an app caller may raise, once a day).
 *  'told' = saved (and, for Unwell, the alert call went through); 'untold' = Unwell saved here but the network was down; it is queued and retried, so the family has not seen it yet;
 *  'nobody' = Unwell saved here and the server answered, but it reached no carer (a person with a login has no writer carer by design, D-22): the family was NOT told;
 *  'refused' = Unwell saved here but the server said no (signed out, not allowed); it is NOT queued, the person must call. */
export const FEELINGS = [['great', 'Great'], ['ok', 'OK'], ['notgreat', 'Not great'], ['unwell', 'Unwell']] as const
export type Feeling = (typeof FEELINGS)[number][0]
const MOOD: Record<Feeling, 'good' | 'ok' | 'low'> = { great: 'good', ok: 'ok', notgreat: 'low', unwell: 'low' }
export async function logFeeling(f: Feeling, forPerson?: string): Promise<'told' | 'nobody' | 'untold' | 'refused' | Exclude<LogResult, 'ok'>> {
  let id = ''
  const r = await asPerson(async (personId) => {
    id = personId
    await logActivity({ personId, kind: `mood-${MOOD[f]}`, minutes: null, steps: null, startedAt: now(), source: 'manual' })
    await logActivity({ personId, kind: 'check-in', minutes: null, steps: null, startedAt: now(), source: 'manual' })
    void track('action', 'checkin_done')
  }, forPerson)
  if (r !== 'ok') return r
  if (f !== 'unwell') { await clearUnsent(id); return 'told' } // a later Great/OK/Not great supersedes a queued Unwell for THIS person only (M2-1)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return (await queueUnsent(id)) ? 'untold' : 'failed' // offline: do not even try
  const sent = await raise(id)
  if (sent === 'sent') return 'told'
  if (sent === 'refused') return 'refused'
  if (sent === 'nobody') return 'nobody'
  return (await queueUnsent(id)) ? 'untold' : 'failed' // never lost: retryUnsentMood sends it on reconnect and on Today mount
}

/** Unwell that could not reach the server waits here (kv `mood.unsent.<personId>`, one per person so an admin's own Great never erases Mama's Unwell) and is sent by retryUnsentMood.
 *  The server keeps one alert per person per day (0030:82), so a repeat is harmless. A row written by the old version (single key `mood.unsent`, value carries its personId) is still read and sent. */
const UNSENT = 'mood.unsent'
const unsentKey = (personId: string) => `${UNSENT}.${personId}`
const UNSENT_MAX_MS = 24 * 3_600_000 // shortcut: older than a day is dropped, an old "unwell" is not news; raise if the family wants it
async function queueUnsent(personId: string): Promise<boolean> {
  try {
    const by = (await getMember().catch(() => null))?.userId // who queued it: a different user signing in on this phone must never send it (retryOne)
    await clearLegacyUnsent(personId); await db.kv.put({ key: unsentKey(personId), value: { personId, at: Date.now(), ...(by ? { by } : {}) } }); return true
  } catch { return false }
}
/** Sign-out: queued Unwell alerts belong to the signed-out user and are dropped (called by the View as bar's sign-out hook). */
export async function clearUnsentMood(): Promise<void> {
  const keys = await db.kv.where('key').startsWith(UNSENT).primaryKeys().catch(() => [])
  await db.kv.bulkDelete(keys).catch(() => undefined)
}
async function clearLegacyUnsent(personId: string): Promise<void> {
  const old = (await db.kv.get(UNSENT).catch(() => undefined))?.value as { personId?: string } | undefined
  if (old?.personId === personId) await db.kv.delete(UNSENT).catch(() => undefined)
}
const clearUnsent = async (personId: string) => { await db.kv.delete(unsentKey(personId)).catch(() => undefined); await clearLegacyUnsent(personId) }
/** Only a network failure is 'offline' (worth a retry). A refusal (42501, signed out, no client) will not get better by waiting. */
const isNetwork = (e: { code?: string; message?: string }) => !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '')
/** raise_mood_alert returns how many carer alerts it made (0 = no writer carer, or one was already sent today). Told-today is kept in kv so a second Unwell the same day, which makes 0 new rows, still reads 'sent'. */
async function raise(personId: string): Promise<'sent' | 'nobody' | 'offline' | 'refused'> {
  try {
    if (!supabase) return 'refused'
    const { data, error } = await supabase.rpc('raise_mood_alert', { p_person: personId })
    if (error) return isNetwork(error as { code?: string; message?: string }) ? 'offline' : 'refused'
    const prefix = `mood.told.${personId}.`
    const key = prefix + manilaDay()
    if (typeof data === 'number' && data > 0) {
      await db.kv.put({ key, value: true }).catch(() => undefined)
      await db.kv.where('key').startsWith(prefix).filter((r) => r.key !== key).delete().catch(() => undefined) // keep today's flag only
      return 'sent'
    }
    return (await db.kv.get(key).catch(() => undefined)) ? 'sent' : 'nobody' // unknown count counts as nobody: never promise what we cannot show
  } catch {
    return 'offline'
  }
}
/** true when the person has a writer carer other than their own login (carers.can_write; notify_family and dose-watch skip the owner): only then is "your family will see it" true.
 *  undefined while reading, offline, or when this user may not read the person's carer rows (carers_read RLS): no promise is made then.
 *  shortcut: no offline cache, so the promise hides offline; cache in kv like useCanMark.loadWritable if that matters. */
export function useHasWriterCarer(personId: string | null | undefined, ownerUserId?: string): boolean | undefined {
  const [got, setGot] = useState<{ id: string; on: boolean }>()
  useEffect(() => {
    if (!personId || !supabase) return
    let live = true
    void (async () => {
      try {
        const r = await supabase!.from('carers').select('carer_id').eq('person_id', personId).eq('can_write', true)
        if (!live || r.error) return
        const m = ownerUserId ? null : await getMember().catch(() => null) // callers that already know the login pass it
        const owner = ownerUserId ?? (m?.personId === personId ? m.userId : undefined)
        if (live) setGot({ id: personId, on: ((r.data ?? []) as { carer_id: string }[]).some((c) => c.carer_id !== owner) })
      } catch { /* unknown: say nothing */ }
    })()
    return () => { live = false }
  }, [personId, ownerUserId])
  return got && got.id === personId ? got.on : undefined
}
/** The line under the mood faces. Only promises the family sees it when a writer carer exists. */
export const moodLine = (writer: boolean | undefined) => writer ? 'Your family will see it in Bantay.' : 'Saved on this phone. If you feel unwell, call your family.'
let retrying: Promise<RetryResult> | null = null
export type RetryResult = 'sent' | 'nobody' | 'none' | 'offline' | 'refused' | { expired: string }
/** One run at a time (Today mount and the online event can fire together). */
export const retryUnsentMood = (): Promise<RetryResult> => (retrying ??= retryOnce().finally(() => { retrying = null }))
/** Sends every person's queued Unwell (mine and anyone I acted for). The result is about MY queued one, so a toast never says "you are unwell" about someone else; others are sent silently. */
async function retryOnce(): Promise<RetryResult> {
  let rows: { key: string; value: unknown }[]
  try { rows = await db.kv.where('key').startsWith(UNSENT).toArray() } catch { return 'none' }
  const mine = await selfIdOrCached().catch(() => null)
  let own: RetryResult | null = null
  let anyOffline = false
  for (const row of rows) {
    if (row.key !== UNSENT && !row.key.startsWith(`${UNSENT}.`)) continue
    const v = row.value as { personId?: string; at?: number; by?: string } | undefined
    const res = await retryOne(row.key, v)
    if (res === 'offline') anyOffline = true
    if (v?.personId && v.personId === mine && res !== 'none') own = res
  }
  return own ?? (anyOffline ? 'offline' : 'none')
}
async function retryOne(key: string, v: { personId?: string; at?: number; by?: string } | undefined): Promise<RetryResult> {
  if (!v?.personId) return 'none'
  if (v.by) { // queued under another account (shared phone): drop it, never send it under this session
    const m = await getMember().catch(() => null)
    if (!m) return 'none'
    if (m.userId !== v.by) { await db.kv.delete(key).catch(() => undefined); return 'none' }
  }
  if (typeof v.at !== 'number') { await db.kv.delete(key).catch(() => undefined); return 'none' }
  if (Date.now() - v.at > UNSENT_MAX_MS) {
    await db.kv.delete(key).catch(() => undefined)
    return { expired: new Date(v.at).toLocaleDateString('en-PH', { weekday: 'long' }) }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const r = await raise(v.personId)
  if (r === 'offline') return 'offline'
  await db.kv.delete(key).catch(() => undefined)
  return r
}
export const retryToast = (r: RetryResult): string | null =>
  r === 'sent' ? 'Your family has been told you are unwell.' : r === 'nobody' ? NOBODY : r === 'refused' ? NOT_TOLD : typeof r === 'object' ? `Your Unwell from ${r.expired} did not reach your family. Call them.` : null
// The trailing `personId` below is passed only by the named UI entry points while acting (D-99); everything else leaves it out and acts as the signed-in person.
export const takeDose = (name: string, personId?: string) => asPerson((personId) => logMedTaken({ personId, name, takenAt: now() }), personId)
/** A dose of one of my medications from the quick log: logged against its medication id and the open slot nearest now (no slot for an as-needed medicine or an extra dose). */
export const takeMedication = (med: Medication, takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[], personId?: string) => asPerson(async (personId) => {
  const slot = pickSlot(med, takes, new Date())
  if (slot) await logDose({ personId, name: med.name, serverId: med.serverId }, slot)
  else await logMedTaken({ personId, name: med.name, takenAt: now(), ...(med.serverId ? { medicationId: med.serverId } : {}) })
}, personId)
export const logBp = (sys: number, dia: number, personId?: string) =>
  asPerson(async (personId) => {
    const takenAt = now()
    await logReading({ personId, takenAt, test: 'bp_systolic', value: sys, unit: 'mmHg' })
    await logReading({ personId, takenAt, test: 'bp_diastolic', value: dia, unit: 'mmHg' }, { track: false }) // one blood pressure is one reading_added
  }, personId)
export const logSugar = (v: number, fasting: boolean, personId?: string) => asPerson((personId) => logReading({ personId, takenAt: now(), test: fasting ? 'fasting_glucose' : 'glucose', value: v, unit: 'mg/dL' }), personId)
export const logWeight = (kg: number, personId?: string) => asPerson((personId) => logReading({ personId, takenAt: now(), test: 'weight', value: kg, unit: 'kg' }), personId)

export const FAIL_TEXT: Record<Exclude<LogResult, 'ok'>, string> = {
  signedout: 'Sign in first, then try again.',
  failed: 'Could not save on this phone. Try again.'
}

const NOT_TOLD = 'Your family was not told. Call them.'
const NOBODY = 'Saved. No one gets your alerts yet. Call your family.'
/** The toast after a face. Unwell saved here but not raised on the server is never reported as told (D-78: the family sees it in Bantay, no push). retryUnsentMood replays it (kv `mood.unsent`) on reconnect and on Today mount. */
export const feelingToast = (r: Awaited<ReturnType<typeof logFeeling>>, acting?: ActingToast) => acting ? actingFeelingToast(r, acting) : r === 'told' ? 'Saved. Your family will see it in Bantay.' : r === 'untold' ? 'Saved. We will tell them when you are online.' : r === 'nobody' ? NOBODY : r === 'refused' ? NOT_TOLD : FAIL_TEXT[r]

/** Toasts while an admin acts for someone name the actor (m2-6, C-9 copy). `name` = the member, `actor` = the signed-in admin, `unwell` = the face was Unwell (the alert also reaches the actor, 0030:60). */
export type ActingToast = { name: string; actor: string; unwell?: boolean }
export const savedForToast = (name: string) => `Saved for ${name}.`
export const sentAsToast = (actor: string) => `Sent as ${actor}`
const actingFeelingToast = (r: Awaited<ReturnType<typeof logFeeling>>, a: ActingToast) =>
  r === 'told' ? (a.unwell ? `Family told. Sent as ${a.actor}.` : savedForToast(a.name))
  : r === 'untold' ? `Saved for ${a.name}. We will tell the family when you are online.`
  : r === 'nobody' ? `Saved for ${a.name}. No one gets their alerts yet. Call the family.`
  : r === 'refused' ? `The family was not told. Call them.`
  : FAIL_TEXT[r]
