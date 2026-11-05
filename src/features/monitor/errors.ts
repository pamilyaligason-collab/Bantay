import { supabase } from '../auth/client'
import { getAccessToken } from '../auth/session'
import { version } from '../admin/events'
import { shellVersionNow } from '../phonecheck/appInfo'

// Client error counter (session 10 S8, D-78: no third-party SDK). window.onerror and unhandledrejection upsert ONE hashed row per error per
// day through the log_client_error RPC (0033). PRIVACY (B-7): no stack, no URL, no message text, no values. Only a place name
// ('window.onerror' / 'unhandledrejection', plus the error's class name and the file:line:col of the top frame inside OUR OWN bundle), a hash of the normalised message and the app version leave the phone. Digits are removed
// before hashing, so a reading in an error text cannot be recovered from the hash, and the same error with a different number groups together.

const KEY = 'bantay.errlog.v1'
const DAILY_CAP = 50 // same cap as the server (rows per user per day)
const MAX_LEN = 200
const IGNORE = /^(script error\.?|resizeobserver loop|non-error promise rejection)/i // browser noise, no action possible

const manilaDay = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) // Manila is UTC+8 with no DST; kept here so the member bundle never imports the admin desk

/** Lower-case, digits to '#', spaces squeezed, cut to 200 characters. */
export const normalizeMessage = (m: string) => m.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN)

/** FNV-1a, 2 x 32 bit with different seeds = 16 hex characters. Groups equal messages; it is not a secret and does not need to be. */
export function hashMessage(m: string): string {
  let a = 0x811c9dc5, b = (0x01000193 ^ 0xdeadbeef) >>> 0 // unsigned, or an empty message would print a minus sign
  for (let i = 0; i < m.length; i++) {
    const c = m.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

type Seen = { day: string; keys: string[] }
function readSeen(): Seen {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Seen | null
    if (r && r.day === manilaDay() && Array.isArray(r.keys)) return r
  } catch { /* private window or cleared: start empty */ }
  return { day: manilaDay(), keys: [] }
}
function writeSeen(s: Seen) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* not remembered: at worst one extra report */ } }

const inFlight = new Set<string>()

const MAX_WHERE = 64 // the server rejects a longer `where` and the whole report would be lost (0033)
/** The first stack frame that lies in our own bundle, as "file.js:line:col" (lower case, no path, no query). Frames from other origins, extensions or the browser are skipped. null when none. */
export function ownFrame(stack: string | undefined, origin = typeof location === 'undefined' ? '' : location.origin): string | null {
  for (const line of (stack ?? '').split(/\r?\n/)) {
    if (!/^\s*at\s/.test(line)) continue // frames only: the message line (which may hold anything, even our own origin) is never scanned
    const m = /((?:https?|capacitor):\/\/[^\s()]+?):(\d+):(\d+)/.exec(line)
    if (!m) continue
    try {
      const u = new URL(m[1]!)
      if (u.origin !== origin) continue
      const file = u.pathname.split('/').pop() ?? ''
      if (/^[A-Za-z0-9._-]{1,40}\.js$/.test(file)) return `${file}:${m[2]}:${m[3]}`.toLowerCase()
    } catch { /* not a URL: next line */ }
  }
  return null
}
/** "unhandledrejection:typeerror:index-abc123.js:1:2345": the place, the error class and where in our bundle. Never the message, a URL or a value (B-7). Lower case, [a-z0-9_.:/-] only, 64 characters at most (the 0033 check). */
export function whereOf(base: string, reason: unknown): string {
  if (!(reason instanceof Error)) return base
  let w = base
  w += /^[A-Za-z]{0,20}(Error|Exception)$/.test(reason.name) ? `:${reason.name.toLowerCase()}` : ':other' // a custom name could carry anything: only plain class names go out
  const f = ownFrame(reason.message ? reason.stack?.replace(reason.message, '') : reason.stack) // the message is cut out of the stack first
  return f && `${w}:${f}`.length <= MAX_WHERE ? `${w}:${f}` : w
}

/** Report one error. Returns true when a row was sent; false when skipped (noise, already sent today, cap, signed out) or the call failed. */
export async function reportError(base: 'window.onerror' | 'unhandledrejection', message: string, reason?: unknown): Promise<boolean> {
  try {
    const where = whereOf(base, reason)
    const norm = normalizeMessage(String(message ?? ''))
    if (!norm || IGNORE.test(norm)) return false
    const hash = hashMessage(norm)
    const key = `${where}:${hash}`
    const seen = readSeen()
    if (seen.keys.includes(key) || inFlight.has(key) || seen.keys.length >= DAILY_CAP) return false
    inFlight.add(key) // before the first await, so two simultaneous reports of one error send one row
    try {
      if (!supabase || !(await getAccessToken())) return false // nobody to log for; try again on the next occurrence
      const { error } = await supabase.rpc('log_client_error', { p_where: where, p_hash: hash, p_app_version: (await shellVersionNow()) ?? version() })
      if (error) return false // not marked: a later occurrence retries (offline, or 0033 not applied yet)
      const now = readSeen()
      writeSeen({ day: now.day, keys: [...now.keys, key] })
      return true
    } finally { inFlight.delete(key) }
  } catch {
    return false // logging must never break the app, and must never raise an error of its own
  }
}

/** Start listening. Returns the function that stops it. */
export function installErrorLogging(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onError = (e: ErrorEvent) => { void reportError('window.onerror', e.error instanceof Error ? `${e.error.name}: ${e.error.message}` : e.message, e.error) }
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason
    void reportError('unhandledrejection', r instanceof Error ? `${r.name}: ${r.message}` : typeof r === 'string' ? r : '', r)
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection) }
}
