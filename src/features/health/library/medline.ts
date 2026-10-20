import { db } from '../../../db'

/** Health library source: MedlinePlus Connect (U.S. National Library of Medicine). One request per article open (the service allows 100 a minute per IP);
 *  the answer is kept in kv for 30 days, and an old copy is used when the network is down. Nothing about the person is sent but the topic text. */
export const CONNECT = 'https://connect.medlineplus.gov/service'
export const CS_ICD10 = '2.16.840.1.113883.6.90' // problems (ICD-10-CM)
export const CS_RXNORM = '2.16.840.1.113883.6.88' // medicines (RxNorm)
export const CS_NDC = '2.16.840.1.113883.6.69' // medicines by NDC code
export const TTL_MS = 30 * 86_400_000
export const SOURCE_LINE = 'From MedlinePlus (U.S. National Library of Medicine), summarised; not medical advice'

export type TopicKind = 'condition' | 'medicine'
export interface Topic { title: string; summary: string; url: string }
export interface Cached { at: number; topic: Topic | null }
export type Fetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

export const normKey = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The Connect request for a topic by text. Conditions are searched as problems, medicines as RxNorm names. */
export function connectUrl(kind: TopicKind, text: string): string {
  const q = new URLSearchParams({ 'mainSearchCriteria.v.cs': kind === 'medicine' ? CS_RXNORM : CS_ICD10, 'mainSearchCriteria.v.dn': text.trim(), knowledgeResponseType: 'application/json', 'informationRecipient.languageCode.c': 'en' })
  return `${CONNECT}?${q.toString()}`
}

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
/** First sentences, about 600 characters: a summary, never the whole page. */
export function summarise(html: string, max = 600): string {
  const t = plain(html)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '))
  return end > 200 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}...`
}
const val = (x: unknown): string => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { _value?: unknown })._value === 'string' ? (x as { _value: string })._value : '')

/** The first topic in a Connect JSON answer, or null when there is none. */
export function parseTopic(body: unknown): Topic | null {
  const entry = (body as { feed?: { entry?: unknown[] } } | null)?.feed?.entry?.[0] as { title?: unknown; summary?: unknown; link?: { href?: string }[] } | undefined
  if (!entry) return null
  const title = plain(val(entry.title))
  const summary = summarise(val(entry.summary))
  const url = entry.link?.find((l) => typeof l.href === 'string' && /^https:\/\/(medlineplus\.gov|vsearch\.nlm\.nih\.gov|www\.nlm\.nih\.gov)\//.test(l.href))?.href ?? ''
  return title && summary && url ? { title, summary, url } : null
}

const key = (kind: TopicKind, text: string) => `lib.v1.${kind}.${normKey(text)}`
async function readCache(k: string): Promise<Cached | null> { try { return ((await db.kv.get(k))?.value as Cached | undefined) ?? null } catch { return null } }

export type TopicResult = { state: 'ok'; topic: Topic; from: 'cache' | 'network' | 'old-cache' } | { state: 'none' } | { state: 'offline' }

/** A topic: a fresh cached copy, else one request, else an old copy, else offline. A topic MedlinePlus has nothing on is remembered too (as `none`). */
export async function loadTopic(kind: TopicKind, text: string, opts: { fetch?: Fetch; now?: number } = {}): Promise<TopicResult> {
  const k = key(kind, text)
  const now = opts.now ?? Date.now()
  const hit = await readCache(k)
  if (hit && now - hit.at < TTL_MS) return hit.topic ? { state: 'ok', topic: hit.topic, from: 'cache' } : { state: 'none' }
  try {
    const res = await (opts.fetch ?? ((u: string) => fetch(u)))(connectUrl(kind, text))
    if (!res.ok) throw new Error('http')
    const topic = parseTopic(await res.json())
    try { await db.kv.put({ key: k, value: { at: now, topic } satisfies Cached }) } catch { /* storage blocked: still show it */ }
    return topic ? { state: 'ok', topic, from: 'network' } : { state: 'none' }
  } catch {
    return hit?.topic ? { state: 'ok', topic: hit.topic, from: 'old-cache' } : { state: 'offline' }
  }
}

/** An article key in the address: c:<text> condition, m:<text> medicine, s:<text> typed search (condition first, then medicine). */
export function parseKey(raw: string): { kinds: TopicKind[]; text: string } | null {
  const m = /^([cms]):(.+)$/.exec(raw)
  if (!m || !m[2]!.trim()) return null
  return { kinds: m[1] === 'c' ? ['condition'] : m[1] === 'm' ? ['medicine'] : ['condition', 'medicine'], text: m[2]!.trim() }
}
export const articleHref = (prefix: 'c' | 'm' | 's', text: string) => `#health/library/${encodeURIComponent(`${prefix}:${text}`)}`
