// Per-member invite link (D-81): pin-login action join_claim {token, pin}, and the family-names ?invite=<token> peek.
// Runtime-agnostic (WebCrypto only), so vitest runs it. index.ts of each function adapts the service-role client to the ports. Never log tokens, PINs or hashes.
import { toEntry, type NameEntry } from '../_shared/names.ts'
import { derivePassword, limiterKey, validatePin } from '../_shared/pin.ts'

export const JOIN_IP_LIMIT = 10 // join_claim calls per IP per hour
export const INVITE_PEEK_LIMIT = 20 // ?invite= reads per IP per 15 minutes (same as the name list)
export const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/ // the SQL token is 43 base64url characters
const HOUR = '1 hour'

/** hex(SHA-256(token)): the same value join_claim_* and admin_create_invite store (0038). */
export async function tokenHash(token: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (b) => b.toString(16).padStart(2, '0')).join('')
}

export interface JoinPort {
  pepper: string
  tryKey(key: string, limit: number, window: string): Promise<number>
  /** public.join_claim_check: counts one try; null once the link is burned, ended, tried 5 times or the member is disabled. */
  check(hash: string): Promise<{ userId: string; handle: string } | null>
  /** True when the member has signed in before, so a PIN already exists. */
  hasSignedIn(userId: string): Promise<boolean>
  /** public.join_claim_use: atomic single use. False when another call won. */
  use(hash: string): Promise<boolean>
  /** Gives the link back after a failed PIN write, so the person can try again. */
  release(hash: string): Promise<void>
  setPin(userId: string, password: string): Promise<boolean>
  /** Audit 'join' and a cleared lock. Best effort: the PIN is already set. */
  afterJoin(userId: string): Promise<void>
}
export type JoinReply = { status: number; body: { ok: true } | { ok: false; why: 'bad_invite' | 'taken' | 'bad_pin' | 'no_signal'; error?: string } }

const badInvite = (): JoinReply => ({ status: 400, body: { ok: false, why: 'bad_invite' } })

/**
 * Every link failure (unknown, ended, used, burned, 5 tries, disabled member, bad shape) is the same body, so a link cannot be probed.
 * Only 'taken' (the member already has a PIN) and 'bad_pin' (a weak PIN, checked before the link is counted) differ.
 */
export async function joinClaim(body: unknown, ip: string, port: JoinPort): Promise<JoinReply> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', `join:${ip}`), JOIN_IP_LIMIT, HOUR)) > JOIN_IP_LIMIT) return { status: 429, body: { ok: false, why: 'bad_invite', error: 'rate_limited' } }
  const token = typeof b.token === 'string' && TOKEN_RE.test(b.token) ? b.token : null
  if (!token) return badInvite()
  if (!validatePin(b.pin)) return { status: 400, body: { ok: false, why: 'bad_pin' } }

  const hash = await tokenHash(token)
  const m = await port.check(hash)
  if (!m) return badInvite()
  if (await port.hasSignedIn(m.userId)) return { status: 409, body: { ok: false, why: 'taken' } }
  if (!(await port.use(hash))) return badInvite() // another call burned it first
  if (!(await port.setPin(m.userId, await derivePassword(port.pepper, m.userId, b.pin)))) {
    await port.release(hash)
    return { status: 500, body: { ok: false, why: 'no_signal', error: 'server_error' } }
  }
  await port.afterJoin(m.userId)
  return { status: 200, body: { ok: true } }
}

// ---------- family-names ?invite=<token> ----------
export type InviteState = 'open' | 'used' | 'ended' | 'tries'
export interface PeekPort {
  pepper: string
  tryKey(key: string, limit: number): Promise<number>
  /** public.join_claim_peek: no counting. null for an unknown hash. */
  peek(hash: string): Promise<{ state: InviteState; handle: string | null; displayName: string | null } | null>
}
export type PeekReply = { status: 200; body: NameEntry[] } | { status: 404 | 429; body: { ok: false; why?: 'used' | 'ended' | 'tries' | 'bad' } }

/**
 * The one name on a link, as the same [{first_name, initial, handle}] array the name list returns (no family list to a token holder).
 * 404 otherwise; the body says used, ended, tries or bad so the app can say why. The token is 256 random bits, so naming the state helps nobody guess a link.
 */
export async function inviteNames(token: string, ip: string, port: PeekPort): Promise<PeekReply> {
  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', `invite:${ip}`), INVITE_PEEK_LIMIT)) > INVITE_PEEK_LIMIT) return { status: 429, body: { ok: false } }
  if (!TOKEN_RE.test(token)) return { status: 404, body: { ok: false, why: 'bad' } }
  const p = await port.peek(await tokenHash(token))
  if (!p) return { status: 404, body: { ok: false, why: 'bad' } }
  if (p.state !== 'open') return { status: 404, body: { ok: false, why: p.state } }
  const e = p.handle && p.displayName ? toEntry({ displayName: p.displayName, handle: p.handle }) : null
  return e ? { status: 200, body: [e] } : { status: 404, body: { ok: false, why: 'bad' } }
}
