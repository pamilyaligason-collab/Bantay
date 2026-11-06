import type { FeedRow } from '../../db'
import { bpDoctorOf, bpPairLevel, BP_WORDS, type BpLevel } from '../health/verdict'
import type { Reading } from '../health/ranges'
import type { Tint } from '../look'
import type { Photo } from './memoriesApi'
import type { Msg } from './messagesApi'

export type FeedKind = 'checkin' | 'reading' | 'lab' | 'photo' | 'message'
export type FeedFilter = 'all' | 'health' | 'photos' | 'checkins'
/** personId null = a photo, which carries no author id (`mine` says whether it is yours). */
export interface FeedItem { id: string; personId: string | null; mine: boolean; kind: FeedKind; at: string; title: string; body: string | null; chip?: { word: string; tint: Tint }; url?: string | null }
type ActRow = { personId: string; kind: string; startedAt: string }
type Thresholds = Parameters<typeof bpDoctorOf>[0]

const TINT: Record<BpLevel, Tint> = { in: 'green', raised: 'amber', above: 'amber', high: 'red', low: 'blue' }
const DAY_MS = 86_400_000
const MAX_AGE_DAYS = 30

/** Newest-first posts built from data this phone already holds: check-ins, BP pairs, family photos and text messages. A lone systolic or diastolic makes no post (it would read half a pressure). */
export function buildFeed(i: { checkins: ActRow[]; readings: Reading[]; photos: Photo[]; msgs: Msg[]; selfId: string | null; now: Date; thresholds: Thresholds }): FeedItem[] {
  const out: FeedItem[] = []
  const mineOf = (id: string | null) => !!id && id === i.selfId
  for (const a of i.checkins) if (a.kind === 'check-in') out.push({ id: `c|${a.personId}|${a.startedAt}`, personId: a.personId, mine: mineOf(a.personId), kind: 'checkin', at: a.startedAt, title: "I'm OK", body: null })
  const sys = i.readings.filter((r) => r.test === 'bp_systolic' && Number.isFinite(r.value))
  for (const s of sys) {
    const d = i.readings.find((r) => r.test === 'bp_diastolic' && r.personId === s.personId && r.takenAt === s.takenAt && Number.isFinite(r.value))
    if (!d) continue
    const lv = bpPairLevel(s.value, d.value, bpDoctorOf(i.thresholds, s.personId))
    out.push({ id: `r|${s.personId}|${s.takenAt}`, personId: s.personId, mine: mineOf(s.personId), kind: 'reading', at: s.takenAt, title: 'Shared a blood pressure reading', body: `${s.value}/${d.value} mmHg`, chip: lv ? { word: BP_WORDS[lv].word, tint: TINT[lv] } : undefined })
  }
  for (const p of i.photos) out.push({ id: `p|${p.id}`, personId: null, mine: p.mine, kind: 'photo', at: p.createdAt, title: p.caption?.trim() || 'Shared a photo', body: null, url: p.url })
  for (const m of i.msgs) if (m.kind === 'text' && m.body) out.push({ id: `m|${m.id}`, personId: m.senderPersonId, mine: m.mine, kind: 'message', at: m.createdAt, title: 'Wrote in the family chat', body: m.body })
  const cutoff = i.now.getTime() - MAX_AGE_DAYS * DAY_MS
  return out.filter((x) => Date.parse(x.at) >= cutoff).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

const KINDS: Record<Exclude<FeedFilter, 'all'>, FeedKind[]> = { health: ['reading', 'lab'], photos: ['photo'], checkins: ['checkin'] }
export const feedFilter = (items: FeedItem[], f: FeedFilter): FeedItem[] => f === 'all' ? items : items.filter((x) => KINDS[f].includes(x.kind))

const LAB_CHIP: Record<string, { word: string; tint: Tint }> = { H: { word: 'High', tint: 'amber' }, L: { word: 'Low', tint: 'blue' }, A: { word: 'Abnormal', tint: 'amber' } }

/** Posts from the server list (`family_feed`, already limited to what each person switched on). Photo links come from `urls`, keyed by stored path. A BP post whose text is not a pair makes none; a lab chip other than H, L or A (0008: N is normal) shows no chip. */
export function feedFromRows(rows: FeedRow[], i: { selfId: string | null; now: Date; thresholds: Thresholds; urls?: ReadonlyMap<string, string> }): FeedItem[] {
  const out: FeedItem[] = []
  for (const r of rows) {
    const base = { id: r.id, personId: r.personId, mine: !!i.selfId && r.personId === i.selfId, at: r.at }
    if (r.kind === 'status') out.push({ ...base, kind: 'checkin', title: "I'm OK", body: null })
    else if (r.kind === 'photo') out.push({ ...base, kind: 'photo', title: r.valueText?.trim() || 'Shared a photo', body: null, url: (r.photoPath && i.urls?.get(r.photoPath)) || null })
    else if (r.kind === 'lab') { if (r.valueText?.trim()) out.push({ ...base, kind: 'lab', title: 'Shared a lab result', body: r.valueText.trim(), chip: LAB_CHIP[r.chip?.trim().toUpperCase() ?? ''] }) }
    else {
      const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})/.exec(r.valueText ?? '')
      if (!m) continue
      const lv = bpPairLevel(+m[1], +m[2], bpDoctorOf(i.thresholds, r.personId))
      out.push({ ...base, kind: 'reading', title: 'Shared a blood pressure reading', body: `${m[1]}/${m[2]} mmHg`, chip: lv ? { word: BP_WORDS[lv].word, tint: TINT[lv] } : undefined })
    }
  }
  return out
}

/** The 30-day cut and newest-first order, with your own just-saved check-ins and BP pairs added at once (when your switch is on) unless the server list already has that post (same kind, person and instant). */
export function mergeFeed(server: FeedItem[], own: FeedItem[], now: Date): FeedItem[] {
  const has = new Set(server.map((x) => `${x.kind}|${x.personId}|${Date.parse(x.at)}`))
  const cutoff = now.getTime() - MAX_AGE_DAYS * DAY_MS
  return [...server, ...own.filter((x) => !has.has(`${x.kind}|${x.personId}|${Date.parse(x.at)}`))].filter((x) => Date.parse(x.at) >= cutoff).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
