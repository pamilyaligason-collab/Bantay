// Firebase Cloud Messaging for the Android app (session 12, lane E, D-85). Used by dose-watch (flushPush) and broadcast.
// Auth: the Firebase service account JSON (secret FIREBASE_SERVICE_ACCOUNT_B64, base64 of the file) signs an RS256 JWT with WebCrypto, Google swaps it for
// an access token (cached until 5 minutes before it expires), and the message goes to the HTTP v1 API. No SDK, no dependency.
// B-7: a message is built ONLY from a templates.ts id (fcmMessageFor): title/body = renderTemplate(id, {}) exactly, data = {t}. Never a name, a reading or a place.
import { buildNotification, renderTemplate, TEMPLATES } from './templates.ts'

export interface ServiceAccount { client_email: string; private_key: string; project_id: string; token_uri?: string }
export type FcmChannel = 'carer_alerts' | 'carer_quiet'
export interface FcmMessage {
  notification: { title: string; body: string }
  data: { t: string }
  android: { priority: 'high'; notification: { channel_id: FcmChannel; tag: string } }
}
/** Optional seams for tests. */
export interface FcmDeps { fetch?: typeof fetch; now?: () => number }

export const FCM_TIMEOUT_MS = 8000
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'

/** FIREBASE_SERVICE_ACCOUNT_B64 to a ServiceAccount, or null when it is missing or not a service account file (push then runs web-only). */
export function parseServiceAccount(b64: string | undefined | null): ServiceAccount | null {
  if (!b64) return null
  try {
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)))) as Partial<ServiceAccount>
    if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string' || typeof o.project_id !== 'string') return null
    return { client_email: o.client_email, private_key: o.private_key, project_id: o.project_id, token_uri: typeof o.token_uri === 'string' ? o.token_uri : undefined }
  } catch { return null }
}

const b64url = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const c of u) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s))

/** The signed assertion Google exchanges for an access token (RS256, 1 hour). Exported for the test, which verifies the signature with the public key. */
export async function buildAssertion(sa: ServiceAccount, nowMs: number): Promise<string> {
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const iat = Math.floor(nowMs / 1000)
  const head = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64urlText(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? DEFAULT_TOKEN_URI, iat, exp: iat + 3600 }))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`))
  return `${head}.${claims}.${b64url(sig)}`
}

// access token per service account, kept for the life of the function instance (one run, or a few warm ones)
const cache = new Map<string, { token: string; until: number }>()
export const resetFcmCache = () => cache.clear()

async function accessToken(sa: ServiceAccount, d: FcmDeps): Promise<string | null> {
  const now = (d.now ?? Date.now)()
  const hit = cache.get(sa.client_email)
  if (hit && hit.until > now) return hit.token
  try {
    const res = await (d.fetch ?? fetch)(sa.token_uri ?? DEFAULT_TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await buildAssertion(sa, now) }),
      signal: AbortSignal.timeout(FCM_TIMEOUT_MS)
    })
    if (!res.ok) return null
    const j = (await res.json()) as { access_token?: unknown; expires_in?: unknown }
    if (typeof j.access_token !== 'string') return null
    const secs = typeof j.expires_in === 'number' ? j.expires_in : 3600
    cache.set(sa.client_email, { token: j.access_token, until: now + Math.max(0, secs - 300) * 1000 })
    return j.access_token
  } catch { return null }
}

/** One send. Returns the HTTP status Google answered (200 sent; 404 or 410 = the token is unregistered, the CALLER deletes the row; 400/403 = this token is wrong),
 *  or null when nothing could be sent (no access token, network error, timeout). Never throws and never logs the message. */
export async function sendFcm(sa: ServiceAccount, token: string, msg: FcmMessage, d: FcmDeps = {}): Promise<number | null> {
  const at = await accessToken(sa, d)
  if (!at) return null
  try {
    const res = await (d.fetch ?? fetch)(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
      body: JSON.stringify({ message: { token, ...msg } }),
      signal: AbortSignal.timeout(FCM_TIMEOUT_MS)
    })
    if (res.status === 401) cache.delete(sa.client_email) // the cached token went bad: the next send asks for a new one
    return res.status
  } catch { return null }
}

/** Is it 10 PM to 6 AM in Manila (the hours the Me screen promises quiet)? */
export const inQuietHours = (d: Date) => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(d)) % 24; return h >= 22 || h < 6 }

/** Alerts that must always ring loud, whatever the hour (decision 2.1.13). */
const ALWAYS_LOUD_KINDS = new Set(['sos', 'mood_unwell', 'dose_missed'])
const ALWAYS_LOUD_TEMPLATES = new Set(['rollcall_help'])
/** carer_alerts (importance 5) or carer_quiet (importance 2): only a tone-normal alert between 22:00 and 06:00 Manila is quiet. */
export function channelFor(o: { kind?: string | null; template: string; tone: 'urgent' | 'normal' }, now: Date): FcmChannel {
  if ((o.kind && ALWAYS_LOUD_KINDS.has(o.kind)) || ALWAYS_LOUD_TEMPLATES.has(o.template)) return 'carer_alerts'
  return o.tone === 'normal' && inQuietHours(now) ? 'carer_quiet' : 'carer_alerts'
}

/** The FCM message for a carer_alerts row, or null for a template this build does not know (not pushed, like web push).
 *  A carer's missed dose is the carer-class 'dose_watch' text (the same one the web push and the phone render), never the user's own dose_missed nudge. */
export function fcmMessageFor(row: { kind?: string | null; template: string }, now: Date): FcmMessage | null {
  if (row.kind === 'dose_missed') {
    const n = buildNotification({ t: 'dose_watch' })!
    return { notification: { title: n.title, body: n.body }, data: { t: 'dose_watch' }, android: { priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'dose_watch' } } }
  }
  if (!Object.hasOwn(TEMPLATES, row.template)) return null
  const r = renderTemplate(row.template, {})
  return { notification: { title: r.title, body: r.body }, data: { t: row.template }, android: { priority: 'high', notification: { channel_id: channelFor({ kind: row.kind, template: row.template, tone: r.tone }, now), tag: row.template } } }
}

/** What the caller does with a send status: 'ok' (count it, stamp last_ok_at), 'gone' (delete the row), 'bad' (this token was refused: count a failure),
 *  'retry' (nothing proven: leave the alert unmarked so the next run offers it again). */
export function fcmOutcome(status: number | null): 'ok' | 'gone' | 'bad' | 'retry' {
  if (status != null && status >= 200 && status < 300) return 'ok'
  if (status === 404 || status === 410) return 'gone'
  if (status === 400 || status === 403) return 'bad'
  return 'retry'
}
