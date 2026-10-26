import { supabase, supabaseUrl, supabasePublishableKey } from './client'

// Self-service PIN reset (D-76: no admin). Server side is pin-login reset_start / reset_complete and the approve_pin_reset RPC (contracts.md, S6b 0034).
// Flow on the requester's phone: choose the new PIN (held in memory only), reset_start -> {id, secret, code}, show the code, poll reset_complete
// until a family member approves, then sign in with the new PIN. Nothing secret is stored: id, secret and PIN live in this state only.

export type ResetMethod = 'family'
export interface ResetStart { id: string; secret: string; code: string }
export type ResetFail = 'no_signal' | 'rate_limited' | 'expired' | 'used' | 'bad_secret' | 'bad_pin' | 'server'

export type ResetState =
  | { s: 'idle' }
  | { s: 'starting'; pin: string }
  | { s: 'waiting'; start: ResetStart; pin: string }
  | { s: 'done' }
  | { s: 'failed'; why: ResetFail }
export type ResetEvent =
  | { t: 'begin'; pin: string }
  | { t: 'started'; start: ResetStart }
  | { t: 'start_failed'; why: ResetFail }
  | { t: 'poll'; result: CompleteResult }
  | { t: 'cancel' }
export type CompleteResult = { ok: true } | { ok: false; why: ResetFail | 'not_approved' }

/** The reset client state machine. Only `not_approved` and `no_signal` keep waiting; every other answer ends the request, so a dead request never polls forever. */
export function resetStep(st: ResetState, ev: ResetEvent): ResetState {
  if (ev.t === 'cancel') return { s: 'idle' }
  if (ev.t === 'begin') return st.s === 'idle' || st.s === 'failed' ? { s: 'starting', pin: ev.pin } : st
  if (ev.t === 'started') return st.s === 'starting' ? { s: 'waiting', start: ev.start, pin: st.pin } : st
  if (ev.t === 'start_failed') return st.s === 'starting' ? { s: 'failed', why: ev.why } : st
  if (st.s !== 'waiting') return st // a late poll after cancel or done changes nothing
  if (ev.result.ok) return { s: 'done' }
  if (ev.result.why === 'not_approved' || ev.result.why === 'no_signal') return st
  return { s: 'failed', why: ev.result.why }
}

export const RESET_COPY: Record<ResetFail, string> = {
  no_signal: 'No signal. Try again when you have data.',
  rate_limited: 'Too many requests. Try again in an hour, or ask a family member to help in person.',
  expired: 'That request ran out of time. Start again.',
  used: 'That request was already used. Start again.',
  bad_secret: 'Something went wrong with that request. Start again.',
  bad_pin: 'That PIN is not allowed. Choose 6 different numbers.',
  server: 'Could not reach sign-in. Check your connection and try again.'
}

type Reply = { status: number; body: Record<string, unknown> | null } | null

async function post(payload: Record<string, unknown>): Promise<Reply> {
  if (!supabaseUrl || !supabasePublishableKey) return { status: 0, body: null }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}` },
      body: JSON.stringify(payload)
    })
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null }
  } catch { return null } // fetch throws a TypeError with no network
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** Maps the server's distinct error codes (expired, used, not approved, bad secret) to ours. Unknown codes are `server`, never a silent success. */
export function failOf(r: NonNullable<Reply>): ResetFail | 'not_approved' {
  const code = `${text(r.body?.error)} ${text(r.body?.code)}`.toLowerCase()
  if (r.status === 429 || /rate|limit|too_many/.test(code)) return 'rate_limited'
  if (/not[_ ]?approved|pending|await/.test(code)) return 'not_approved'
  if (/expire/.test(code)) return 'expired'
  if (/used/.test(code)) return 'used'
  if (/secret/.test(code)) return 'bad_secret'
  if (/pin/.test(code)) return 'bad_pin'
  return 'server'
}

/** Ask the family to approve a new PIN. The server answers the same shape for any handle, so an unknown handle looks like success; the code then never gets approved. */
export async function startReset(handle: string, method: ResetMethod = 'family'): Promise<{ ok: true; start: ResetStart } | { ok: false; why: ResetFail }> {
  const r = await post({ action: 'reset_start', handle: handle.trim().toLowerCase(), method })
  if (!r) return { ok: false, why: 'no_signal' }
  const b = r.body
  if (r.status === 200 && b?.ok !== false && text(b?.id) && text(b?.secret) && /^\d{4}$/.test(text(b?.code))) {
    return { ok: true, start: { id: text(b?.id), secret: text(b?.secret), code: text(b?.code) } }
  }
  const why = failOf(r)
  return { ok: false, why: why === 'not_approved' ? 'server' : why }
}

/** One poll: sends the new PIN with the secret. `not_approved` until a family member approves; then ok. */
export async function completeReset(start: ResetStart, newPin: string): Promise<CompleteResult> {
  const r = await post({ action: 'reset_complete', id: start.id, secret: start.secret, new_pin: newPin })
  if (!r) return { ok: false, why: 'no_signal' }
  if (r.status === 200 && r.body?.ok === true) return { ok: true }
  return { ok: false, why: failOf(r) }
}

/** The approver's side (start-approve-req): the 4-digit number the requester reads out. true = approved. The server gives false for a wrong code
 *  (5 wrong codes burn the request), an expired or used request, the requester, a non-family caller or an already approved request. */
export async function approveReset(id: string, code: string): Promise<'approved' | 'refused' | 'no_signal'> {
  if (!supabase || !/^\d{4}$/.test(code)) return 'refused'
  try {
    const { data, error } = await supabase.rpc('approve_pin_reset', { p_id: id, p_code: code })
    // postgrest-js reports a network failure as an error with no code.
    if (error) return error.code ? 'refused' : 'no_signal'
    return data === true ? 'approved' : 'refused'
  } catch { return 'no_signal' }
}
