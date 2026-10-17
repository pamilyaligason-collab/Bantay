// Runtime-agnostic (Deno + Node 20+): WebCrypto only. Never log PINs or derived passwords.
export const GENERIC_AUTH_ERROR = 'Handle or PIN is not right'
export const SYNTHETIC_DOMAIN = 'members.bantay.invalid'

/** PIN rules (contract): exactly 6 digits, not all the same digit, not 123456. */
export function validatePin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin) && !/^(\d)\1{5}$/.test(pin) && pin !== '123456'
}

/** Handles are lowercase, start with a letter, 3 to 20 of a-z 0-9 underscore. Returns null when invalid. */
export function normalizeHandle(h: unknown): string | null {
  if (typeof h !== 'string') return null
  const v = h.trim().toLowerCase()
  return /^[a-z][a-z0-9_]{2,19}$/.test(v) ? v : null
}

export function normalizeEmail(e: unknown): string | null {
  if (typeof e !== 'string') return null
  const v = e.trim().toLowerCase()
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !v.endsWith('@' + SYNTHETIC_DOMAIN) ? v : null
}

const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmac(pepper: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}

/** password = base64url(HMAC-SHA256(PIN_PEPPER, userId + ':' + pin)) */
export async function derivePassword(pepper: string, userId: string, pin: string): Promise<string> {
  return b64url(await hmac(pepper, `${userId}:${pin}`))
}

/** Keyed hash shaped as a uuid, for rate-limit rows of unknown handles and IPs (so they look the same as real users). */
export async function limiterKey(pepper: string, scope: 'handle' | 'ip', value: string): Promise<string> {
  const h = Array.from((await hmac(pepper, `limit:${scope}:${value}`)).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function randomSecret(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)))
}

export function syntheticEmail(): string {
  return `m-${crypto.randomUUID()}@${SYNTHETIC_DOMAIN}`
}
