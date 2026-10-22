// Context for Ask: the person's own confirmed records (read with THEIR JWT, so RLS decides what is visible) and MedlinePlus Connect.
// Only a drug name or a LOINC code ever leaves for MedlinePlus, never the person, the question or a value (B-7, RA 10173).
// MedlinePlus Connect: free, no key, 100 requests a minute per IP, caching for 12 to 24 h is asked for
// (https://medlineplus.gov/medlineplus-connect/web-service/). Cache here is in memory, per isolate.
import { normalize } from './gate.ts'
import { tokensOf, type Lookup, type OwnData, type Topic } from './logic.ts'

export const CONNECT = 'https://connect.medlineplus.gov/service'
const CS_RXNORM = '2.16.840.1.113883.6.88'
const CS_LOINC = '2.16.840.1.113883.6.1'
export const TTL_MS = 12 * 3_600_000
const MAX_CACHE = 200

export interface MedRow { name: string | null; generic_name: string | null; strength: string | null; dose: string | null }
export interface LabRow { test_code: string | null; name_raw: string | null; value_num: number | null; value_text: string | null; unit_raw: string | null; flag: string | null; ref_low: number | null; ref_high: number | null; collected_at: string | null }
export interface CatalogRow { code: string; name: string; loinc: string | null; aliases: string[] | null }
export interface Reader {
  /** The caller's own person row id (people.auth_user_id = the JWT user), or null. */
  person(): Promise<string | null>
  meds(personId: string): Promise<MedRow[]>
  labs(personId: string): Promise<LabRow[]>
  catalog(): Promise<CatalogRow[]>
  allergies(personId: string): Promise<string[]>
}

const clean = (s: unknown, max = 60) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')
const has = (q: string, term: string) => { const t = normalize(term); return t.length >= 3 && (' ' + q + ' ').includes(' ' + t + ' ') }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null) // unknown stays null, never 0 (B-5)

/** Meds, newest labs and allergies as short lines, plus the lookups the question touches. Any read that fails just leaves its part empty. */
export async function assembleOwn(r: Reader, question: string): Promise<OwnData> {
  const empty: OwnData = { meds: [], labs: [], allergies: [], tokens: [], lookups: [] }
  const safe = async <T>(p: Promise<T>, d: T): Promise<T> => { try { return await p } catch { return d } }
  const pid = await safe(r.person(), null)
  if (!pid) return empty
  const [meds, labs, cat, allergies] = await Promise.all([safe(r.meds(pid), [] as MedRow[]), safe(r.labs(pid), [] as LabRow[]), safe(r.catalog(), [] as CatalogRow[]), safe(r.allergies(pid), [] as string[])])
  const q = normalize(question)
  const lookups: Lookup[] = []
  const tokens: string[] = []

  const medLines = meds.slice(0, 20).flatMap((m) => {
    const name = clean(m.name)
    if (!name) return []
    const extra = [clean(m.strength, 30), clean(m.dose, 40)].filter(Boolean)
    tokens.push(...tokensOf(extra.join(' ')))
    if (has(q, name) || (m.generic_name && has(q, m.generic_name))) lookups.push({ kind: 'rxnorm', code: clean(m.generic_name || name, 60) })
    return [extra.length ? `${name} (${extra.join(', ')})` : name]
  })

  const byCode = new Map(cat.map((c) => [c.code, c]))
  const seen = new Set<string>()
  const labLines: string[] = []
  for (const l of labs) {
    const code = l.test_code ?? ''
    const label = clean(byCode.get(code)?.name || l.name_raw)
    const v = num(l.value_num) ?? (clean(l.value_text, 30) || null)
    if (!label || v === null || seen.has(label) || labLines.length >= 5) continue
    seen.add(label)
    const range = num(l.ref_low) !== null && num(l.ref_high) !== null ? `, lab range ${l.ref_low} to ${l.ref_high}` : ''
    const flag = l.flag === 'H' ? ', marked high by the lab' : l.flag === 'L' ? ', marked low by the lab' : ''
    const when = clean(l.collected_at, 10)
    const unit = clean(l.unit_raw, 20)
    tokens.push(...tokensOf(`${v} ${unit}`))
    labLines.push(`${label} ${v}${unit ? ' ' + unit : ''}${flag}${range}${when ? ' on ' + when : ''}`)
    const c = byCode.get(code)
    if (c?.loinc && (has(q, c.name) || (c.aliases ?? []).some((a) => has(q, a)))) lookups.push({ kind: 'loinc', code: c.loinc })
  }

  const seenL = new Set<string>()
  return {
    meds: medLines, labs: labLines, allergies: allergies.map((a) => clean(a, 40)).filter(Boolean).slice(0, 10), tokens,
    lookups: lookups.filter((l) => { const k = l.kind + l.code; if (seenL.has(k)) return false; seenL.add(k); return true }).slice(0, 2)
  }
}

// ---------- MedlinePlus Connect ----------
const plain = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
const val = (x: unknown): string => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { _value?: unknown })._value === 'string' ? (x as { _value: string })._value : '')

export function connectUrl(l: Lookup): string {
  const q = new URLSearchParams(l.kind === 'loinc'
    ? { 'mainSearchCriteria.v.cs': CS_LOINC, 'mainSearchCriteria.v.c': l.code }
    : { 'mainSearchCriteria.v.cs': CS_RXNORM, 'mainSearchCriteria.v.dn': l.code })
  q.set('knowledgeResponseType', 'application/json')
  q.set('informationRecipient.languageCode.c', 'en')
  return `${CONNECT}?${q.toString()}`
}

export function parseTopic(body: unknown): Topic | null {
  const e = (body as { feed?: { entry?: unknown[] } } | null)?.feed?.entry?.[0] as { title?: unknown; summary?: unknown; link?: { href?: string }[] } | undefined
  if (!e) return null
  const title = plain(val(e.title))
  let summary = plain(val(e.summary))
  if (summary.length > 600) { const cut = summary.slice(0, 600); const end = cut.lastIndexOf('. '); summary = end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '...' }
  const url = e.link?.find((x) => typeof x.href === 'string' && /^https:\/\/(medlineplus\.gov|vsearch\.nlm\.nih\.gov|www\.nlm\.nih\.gov)\//.test(x.href))?.href ?? ''
  return title && summary && url ? { title, summary, url } : null
}

/** A cached fetcher. Nothing found is cached too, so a missing topic is not asked again for 12 h. Failures are not cached. */
export function makeMedline(f: typeof fetch, now: () => number = Date.now, timeoutMs = 3000) {
  const cache = new Map<string, { at: number; topic: Topic | null }>()
  return async (l: Lookup): Promise<Topic | null> => {
    const k = l.kind + ':' + normalize(l.code)
    const hit = cache.get(k)
    if (hit && now() - hit.at < TTL_MS) return hit.topic
    try {
      const res = await f(connectUrl(l), { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) return null
      const topic = parseTopic(await res.json())
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
      cache.set(k, { at: now(), topic })
      return topic
    } catch { return null }
  }
}
