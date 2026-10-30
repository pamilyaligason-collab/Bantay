import { db } from '../../db'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'

export const CONSENT_VERSION = '2026-10'
const PENDING = 'consent.pending'

/** The D-86 behaviour in one sentence (A-15, M2-4): private until shared and accepted, admins can read. Shown on onboarding screen 5 and in the Wizard's Sharing step. */
export const CONSENT_LINE = 'Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing.'

/** Writes people.consent_at / consent_version / consent_by for the signed-in person (the one-line notice on `start-done`, never a question).
 *  Offline or refused: the intent is kept in kv and retried by flushConsent() on the next app start, so the notice is never silently dropped. */
export async function recordConsent(): Promise<boolean> {
  await db.kv.put({ key: PENDING, value: true }).catch(() => undefined)
  return flushConsent()
}

/** Sends a kept consent. No-op when nothing is pending or auth is not configured. Never throws. */
export async function flushConsent(): Promise<boolean> {
  try {
    if (!supabase || (await db.kv.get(PENDING))?.value !== true) return false
    const m = await getMember()
    if (!m?.personId) return false
    const { data, error } = await supabase.from('people').update({ consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION, consent_by: m.userId }).eq('id', m.personId).select('id')
    if (error || !data?.length) return false // an update that matched no row (RLS) is not a success: the intent stays for the next start
    await db.kv.delete(PENDING)
    return true
  } catch { return false }
}
