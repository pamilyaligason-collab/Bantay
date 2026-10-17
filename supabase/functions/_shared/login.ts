import { GENERIC_AUTH_ERROR, derivePassword, limiterKey, normalizeHandle, randomSecret, syntheticEmail } from './pin.ts'

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
