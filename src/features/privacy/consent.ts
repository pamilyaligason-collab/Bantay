import { supabase } from '../auth/client'
import { getMember } from '../auth/session'

export const CONSENT_VERSION = '2026-10'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "26 Oct" (with the year when it is not this year). '' for a missing or unreadable date: never a made-up one. */
export function consentDate(iso: string | null | undefined, now: Date = new Date()): string {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`
}

export interface Consent { at: string | null; backfilled: boolean }

/** Reads people.consent_at for this person. Q37 backfill: a member who joined before consent was recorded gets consent_at = now on first open
 *  (guarded by `is null`, so a recorded date is never overwritten). A failed read (offline, column not there yet) writes nothing and returns at: null. */
export async function ensureConsent(personId: string): Promise<Consent> {
  if (!supabase) return { at: null, backfilled: false }
  try {
    const read = await supabase.from('people').select('consent_at').eq('id', personId).maybeSingle()
    if (read.error || !read.data) return { at: null, backfilled: false }
    if (read.data.consent_at) return { at: read.data.consent_at as string, backfilled: false }
    const uid = (await getMember())?.userId
    const at = new Date().toISOString()
    const w = await supabase.from('people').update({ consent_at: at, consent_version: CONSENT_VERSION, consent_by: uid ?? null }).eq('id', personId).is('consent_at', null)
    return w.error ? { at: null, backfilled: false } : { at, backfilled: true }
  } catch { return { at: null, backfilled: false } }
}
