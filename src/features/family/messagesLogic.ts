/** Family messages (migration 0027), pure helpers. No storage, no network, no logging of content (B-7). */
export const MAX_BYTES = 10 * 1024 * 1024
export const VOICE_MAX_S = 60
export const BODY_MAX = 2000

export type Bubble = { key: 'ok' | 'look' | 'quiet'; emoji: string; word: string }
/** The status beside a bubble, from data the phone already has. A flag ("N to check") beats a check-in; "All up to date" and no flag at all are not flags.
 *  Without a check-in today, and nothing flagged, it is "No news": we do not know, so we do not say they are fine or not. */
export function bubbleStatus(i: { checkedIn: boolean; flag: string | null }): Bubble {
  if (i.flag && i.flag !== 'All up to date') return { key: 'look', emoji: '⚠️', word: 'Needs a look' }
  if (i.checkedIn) return { key: 'ok', emoji: '✅', word: 'OK today' }
  return { key: 'quiet', emoji: '💤', word: 'No news' }
}

/** Voice note formats the bucket accepts, best first. `supported` is MediaRecorder.isTypeSupported; null when this phone can record none of them. */
export function pickRecorderMime(supported: (m: string) => boolean): { mime: string; ext: 'webm' | 'm4a' | 'ogg' } | null {
  const c: { mime: string; ext: 'webm' | 'm4a' | 'ogg' }[] = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' }, { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/mp4', ext: 'm4a' }, { mime: 'audio/ogg;codecs=opus', ext: 'ogg' }
  ]
  return c.find((x) => { try { return supported(x.mime) } catch { return false } }) ?? null
}

const FILE_TYPES: Record<string, { ext: string; mime: string }> = {
  'application/pdf': { ext: 'pdf', mime: 'application/pdf' }, 'text/plain': { ext: 'txt', mime: 'text/plain' },
  'application/msword': { ext: 'doc', mime: 'application/msword' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
}
const BY_EXT: Record<string, string> = { pdf: 'application/pdf', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

/** What to do with a picked file: photos are re-encoded (EXIF stripped) by the caller; documents go as they are. 'big' over 10 MB, 'type' for anything the bucket refuses. */
export function classifyFile(f: { type: string; name: string; size: number }): { kind: 'photo' } | { kind: 'file'; ext: string; mime: string } | { error: 'big' | 'type' } {
  if (f.size > MAX_BYTES) return { error: 'big' }
  if (f.type.startsWith('image/')) return { kind: 'photo' }
  const ext = /\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1]?.toLowerCase() ?? ''
  const t = FILE_TYPES[f.type] ?? (BY_EXT[ext] ? FILE_TYPES[BY_EXT[ext]!] : undefined)
  return t ? { kind: 'file', ...t } : { error: 'type' }
}

/** A Messenger name from what a person types: "@name", "m.me/name" or a pasted m.me link become the handle. Null for empty or anything the database check would refuse (letters, digits and dots, 5 to 50). */
export function cleanMessenger(input?: string | null): string | null {
  const h = (input ?? '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?m\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '')
  return /^[A-Za-z0-9.]{5,50}$/.test(h) ? h : null
}

/** The Messenger link for one person. No saved handle (or an unsafe one) = null = no button; it never falls back to messenger.com. */
export function messengerHref(handle?: string | null): { href: string; label: string } | null {
  const h = (handle ?? '').trim()
  return /^[A-Za-z0-9.]{5,50}$/.test(h) ? { href: `https://m.me/${h}`, label: 'Messenger' } : null
}

/** The WhatsApp chat link from a saved number written with its country code (+63...). A local 09... number has no country code, so it gets no button. */
export function whatsappHref(phone?: string | null): { href: string; label: string } | null {
  const raw = (phone ?? '').trim()
  const d = raw.replace(/\D/g, '')
  return raw.startsWith('+') && d.length >= 8 && d.length <= 15 ? { href: `https://wa.me/${d}`, label: 'WhatsApp' } : null
}

/** The ways to reach one person from the People card and the face sheet (S28, D-168): their Messenger and WhatsApp when saved; with neither, a phone call if a number is saved,
 *  else a link to add a Messenger name (their page; your own name on the Messages page). Never an in-app chat. `dial` is the saved number reduced to digits (roster.dial). */
export type Reach = { href: string; label: string; external: boolean }
export function reachOptions(p: { id: string; isMe: boolean; messenger?: string | null; phone?: string | null }, dial: string | null): Reach[] {
  const out: Reach[] = []
  const m = p.isMe ? null : messengerHref(p.messenger)
  const w = p.isMe ? null : whatsappHref(p.phone)
  if (m) out.push({ ...m, external: true })
  if (w) out.push({ ...w, external: true })
  if (out.length) return out
  if (!p.isMe && dial) return [{ href: `tel:${dial}`, label: 'Call', external: false }]
  return [{ href: p.isMe ? '#family/messages' : `#family/people/${p.id}`, label: 'Add Messenger name', external: false }]
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, '0')}`

/** "7:40 AM" today, else "Mon 19 Oct, 7:40 AM". Null for a bad date. */
export function stamp(iso: string, now = new Date()): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === now.toDateString() ? t : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${t}`
}

/** Safe name for display: letters and digits kept, 40 characters at most. Never used in a path or a log. */
export const shortName = (n: string | null) => (n ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) || 'File'
