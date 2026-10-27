import { GENERIC_AUTH_ERROR, SYNTHETIC_DOMAIN, derivePassword, hashResetSecret, limiterKey, normalizeHandle, randomSecret, resetCode, resetSecret, safeEqual, syntheticEmail, validatePin } from './pin.ts'

export const HANDLE_LIMIT = 5 // wrong PINs per handle before a 15 minute lock (window length is set in pin_try's caller)
export const IP_LIMIT = 30 // attempts per IP per window, across handles

export interface Session { access_token: string; refresh_token: string; expires_in: number; token_type: string }
export interface LoginPort {
  pepper: string
  /** Atomic counter (public.pin_try). Returns the attempt count inside the current window. */
  tryKey(key: string, limit: number): Promise<number>
  clearKey(key: string): Promise<void>
  findUser(handle: string): Promise<{ userId: string; email: string; disabled: boolean } | null>
  signIn(email: string, password: string): Promise<Session | null>
}
export type LoginReply = { status: number; body: { ok: true; session: Session } | { ok: false; error: 'bad_credentials'; message: string } }

const fail = (status = 401): LoginReply => ({ status, body: { ok: false, error: 'bad_credentials', message: GENERIC_AUTH_ERROR } })

/**
 * Every failure (bad shape, unknown handle, wrong PIN, disabled, locked, IP limit) returns the same body, so handles cannot be enumerated.
 * Attempts are counted BEFORE the PIN is checked, so parallel guesses cannot beat the limit.
 * Unknown handles are counted and locked the same way (keyed hash), and still pay for one sign-in call, so timing matches.
 */
export async function attemptLogin(body: unknown, ip: string, port: LoginPort): Promise<LoginReply> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const handle = normalizeHandle(b.handle)
  const pin = typeof b.pin === 'string' && /^\d{6}$/.test(b.pin) ? b.pin : null
  if (!handle || !pin) return fail()

  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', ip), IP_LIMIT)) > IP_LIMIT) return fail(429)

  const user = await port.findUser(handle)
  const key = user ? user.userId : await limiterKey(port.pepper, 'handle', handle)
  if ((await port.tryKey(key, HANDLE_LIMIT)) > HANDLE_LIMIT) return fail()

  let session: Session | null
  if (user && !user.disabled) session = await port.signIn(user.email, await derivePassword(port.pepper, user.userId, pin))
  else { await port.signIn(syntheticEmail(), randomSecret()); session = null }
  if (!session) return fail()

  await port.clearKey(key)
  return { status: 200, body: { ok: true, session } }
}

// ---------- PIN reset by family approval (C5, D-76) ----------
export const RESET_HANDLE_LIMIT = 3 // reset_start per handle per hour
export const RESET_IP_LIMIT = 10 // reset_start per IP per hour
export const RESET_COMPLETE_IP_LIMIT = 120 // reset_complete per IP per hour, its own bucket (one household NAT can finish many resets; reset_start no longer starves it)
export const RESET_ID_LIMIT = 10 // reset_complete tries per request per hour
const HOUR = '1 hour'

export interface ResetRow { id: string; userId: string; secretHash: string; approvedAt: string | null; usedAt: string | null; expiresAt: string }
export interface ResetPort {
  pepper: string
  tryKey(key: string, limit: number, window: string): Promise<number>
  findUser(handle: string): Promise<{ userId: string; email: string; disabled: boolean } | null>
  /** Burns the user's older open requests (one open per user), then inserts. */
  createRequest(r: { id: string; userId: string; method: 'google' | 'family'; code: string; secretHash: string; approved: boolean }): Promise<void>
  /** method family: one pin_approve carer_alerts row per active member except the requester. Best-effort web push flush follows in the caller. */
  notifyApprovers(requestId: string, userId: string): Promise<void>
  /** method google: the access token's user id when it carries a Google identity, else null. */
  verifyGoogle(token: string): Promise<string | null>
  getRequest(id: string): Promise<ResetRow | null>
  /** Atomic: sets used_at only if unused, approved and not expired. False when another call won. */
  claim(id: string): Promise<boolean>
  release(id: string): Promise<void>
  setPin(userId: string, password: string): Promise<boolean>
  afterReset(userId: string, requestId: string): Promise<void>
}
export type ResetReply = { status: number; body: Record<string, unknown> }

const bad = (): ResetReply => ({ status: 400, body: { ok: false, error: 'bad_request' } })
const limited = (): ResetReply => ({ status: 429, body: { ok: false, error: 'rate_limited' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Same reply shape for a known, unknown, malformed, disabled or Google-only handle: {ok, id, secret, code}. The limiter keys hash the handle, so
 * an unknown handle is counted and locked exactly like a real one and a 429 reveals nothing.
 */
export async function resetStart(body: unknown, ip: string, port: ResetPort): Promise<ResetReply> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (b.method !== 'google' && b.method !== 'family') return bad()
  const method = b.method
  const handle = normalizeHandle(b.handle)
  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', `reset:${ip}`), RESET_IP_LIMIT, HOUR)) > RESET_IP_LIMIT) return limited()
  if ((await port.tryKey(await limiterKey(port.pepper, 'handle', `reset:${handle ?? String(b.handle).slice(0, 40)}`), RESET_HANDLE_LIMIT, HOUR)) > RESET_HANDLE_LIMIT) return limited()

  const id = crypto.randomUUID(), secret = resetSecret(), code = resetCode()
  const reply: ResetReply = { status: 200, body: { ok: true, id, secret, code } }
  const user = handle ? await port.findUser(handle) : null
  if (!user || user.disabled || !user.email.endsWith('@' + SYNTHETIC_DOMAIN)) return reply // decoy: nothing is stored
  let approved = false
  if (method === 'google') {
    const g = typeof b.google_token === 'string' && b.google_token.length <= 4096 ? await port.verifyGoogle(b.google_token) : null
    approved = g === user.userId // the OAuth identity must be this very user; otherwise the request stays unapproved
  }
  await port.createRequest({ id, userId: user.userId, method, code, secretHash: await hashResetSecret(port.pepper, id, secret), approved })
  if (method === 'family') await port.notifyApprovers(id, user.userId)
  return reply
}

/** Verifies secret, approval, single use and expiry; error codes are distinct (bad_secret, used, expired, not_approved). */
export async function resetComplete(body: unknown, ip: string, port: ResetPort): Promise<ResetReply> {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : null
  const secret = typeof b.secret === 'string' && b.secret.length >= 16 && b.secret.length <= 64 ? b.secret : null
  if (!id || !secret) return bad()
  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', `reset-complete:${ip}`), RESET_COMPLETE_IP_LIMIT, HOUR)) > RESET_COMPLETE_IP_LIMIT) return limited()
  if ((await port.tryKey(await limiterKey(port.pepper, 'handle', `reset-id:${id}`), RESET_ID_LIMIT, HOUR)) > RESET_ID_LIMIT) return limited()
  if (!validatePin(b.new_pin)) return { status: 400, body: { ok: false, error: 'weak_pin' } }

  const row = await port.getRequest(id)
  if (!row || !safeEqual(row.secretHash, await hashResetSecret(port.pepper, id, secret))) return { status: 403, body: { ok: false, error: 'bad_secret' } }
  if (row.usedAt) return { status: 409, body: { ok: false, error: 'used' } }
  if (Date.parse(row.expiresAt) <= Date.now()) return { status: 410, body: { ok: false, error: 'expired' } }
  if (!row.approvedAt) return { status: 403, body: { ok: false, error: 'not_approved' } }

  if (!(await port.claim(id))) return { status: 409, body: { ok: false, error: 'used' } }
  if (!(await port.setPin(row.userId, await derivePassword(port.pepper, row.userId, b.new_pin)))) {
    await port.release(id)
    return { status: 500, body: { ok: false, error: 'server_error' } }
  }
  await port.afterReset(row.userId, id)
  return { status: 200, body: { ok: true } }
}
