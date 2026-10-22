import movesJson from './moves.json'
import { readingPosition } from '../health/model'
import type { Range } from '../health/ranges'

/** Bantay-original senior exercise picks. Rules are listed in docs/session-8/CLINICAL-REVIEW.md and wait for a clinician's review.
 *  Sources: WHO 2020 physical activity guidelines, CDC older adults (docs/SOURCES.md). */
export type Group = 'mobility' | 'balance' | 'strength' | 'stretch' | 'walk' | 'breathe'
export type Posture = 'seated' | 'standing-with-support' | 'floor'
export interface Move {
  id: string; name: string
  /** A short line in Tagalog. */
  tl: string
  group: Group; posture: Posture
  durationSec?: number; reps?: number
  steps: string[]; stopIf: string[]
  /** Tags: hold (isometric hold), deep-knee, forward-bend, twist, impact, floor. */
  avoidIf: string[]
  level: 1 | 2 | 3
  /** Later: the id of an AnimatedDemo clip. No demo asset ships yet. */
  demo?: string
  /** An official demo video (checked with YouTube oEmbed, listed in docs/SOURCES.md). Loads only when tapped. */
  video?: { id: string; channel: string; title: string }
}
export const MOVES = movesJson as Move[]
export const moveById = (id: string) => MOVES.find((m) => m.id === id)

export const GATE_KEY = 'exercise.gateOk'
export const DOCTOR_OK_KEY = 'exercise.doctorOk'
export const GATE_TEXT = 'Check with your doctor before starting new exercise.'

export type Condition = 'hypertension' | 'arthritis' | 'diabetes' | 'heart' | 'osteoporosis' | 'asthma'
const WORDS: Record<Condition, RegExp> = {
  hypertension: /hypertension|high\s*blood|altapresyon|alta\s*presyon|highblood/i,
  arthritis: /arthritis|rayuma/i,
  diabetes: /diabet|asukal/i,
  heart: /heart|puso/i,
  osteoporosis: /osteopor/i,
  asthma: /asthma|hika/i
}
/** Free-text conditions (English or Tagalog) to the known ones. */
export function matchConditions(list: string[]): Condition[] {
  return (Object.keys(WORDS) as Condition[]).filter((c) => list.some((t) => WORDS[c].test(t)))
}

export interface RecommendInput {
  /** Unknown is null/undefined, never 0. */
  age?: number | null
  conditions: string[]
  latestBp?: { sys: number; dia: number } | null
  latestSugar?: number | null
  /** The person's own doctor-set limits (Health thresholds). They win over the general guide, as everywhere else in the app. */
  family?: { sys?: Range | null; dia?: Range | null; sugar?: Range | null }
  /** Move ids done in the last 7 days (repeats allowed). */
  doneThisWeek?: string[]
  gateOk?: boolean
  doctorOk?: boolean
}
export interface Recommendation {
  /** True until the person acknowledges the one-time doctor check. Nothing else is shown then. */
  gate: boolean
  /** A reason to rest today instead of exercising. */
  rest: { why: 'bp' | 'sugar'; text: string } | null
  picks: Move[]
  /** Every move this person may do today (same safety rules as the picks), best first. The Move screen filters it by group and posture. */
  available: Move[]
  /** Short reminders to show above the picks. */
  notes: string[]
  /** Heart or bone condition and no "my doctor said OK" yet: only walking and seated moves. */
  restricted: boolean
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Above the person's own limit on either BP number, else the app's guide (AHA). Same judge as the Health screens. */
export const bpHigh = (bp?: { sys: number; dia: number } | null, fam?: RecommendInput['family']) => {
  if (!bp || !num(bp.sys) || !num(bp.dia)) return false
  const at = (test: string, value: number, f?: Range | null) => readingPosition({ personId: '', takenAt: '', test, value }, f) === 'above'
  return at('bp_systolic', bp.sys, fam?.sys) || at('bp_diastolic', bp.dia, fam?.dia)
}
/** latestSugar is already mg/dL (data.ts converts). */
export const sugarLow = (v?: number | null, fam?: RecommendInput['family']) =>
  num(v) && readingPosition({ personId: '', takenAt: '', test: 'fasting_glucose', value: v }, fam?.sugar) === 'below'

const ORDER_OLDER: Group[] = ['balance', 'strength', 'mobility', 'walk', 'stretch', 'breathe']
const ORDER_YOUNGER: Group[] = ['strength', 'walk', 'balance', 'mobility', 'stretch', 'breathe']
const POSTURE_RANK: Record<Posture, number> = { seated: 0, 'standing-with-support': 1, floor: 2 }

export function recommend(i: RecommendInput): Recommendation {
  const conds = matchConditions(i.conditions ?? [])
  const has = (c: Condition) => conds.includes(c)
  const restricted = (has('heart') || has('osteoporosis')) && !i.doctorOk
  const base: Recommendation = { gate: !i.gateOk, rest: null, picks: [], available: [], notes: [], restricted }
  if (base.gate) return base

  if (has('hypertension') && bpHigh(i.latestBp, i.family)) return { ...base, rest: { why: 'bp', text: 'Rest today. Check your blood pressure first and tell your doctor if it stays high.' } }
  if (has('diabetes') && sugarLow(i.latestSugar, i.family)) return { ...base, rest: { why: 'sugar', text: 'Your sugar was low. Rest today, eat something and check it again before you move.' } }

  const age = num(i.age) && i.age > 0 ? i.age : null
  const older = age == null || age >= 65 // unknown age is treated as 65+
  const supportedOnly = age != null && age >= 80
  const maxLevel = older ? 1 : 2
  const avoid = new Set<string>()
  if (has('hypertension')) avoid.add('hold')
  if (has('arthritis')) { avoid.add('deep-knee'); avoid.add('impact') }
  if (has('osteoporosis')) { avoid.add('forward-bend'); avoid.add('twist'); avoid.add('floor'); avoid.add('impact') }

  const notes: string[] = []
  if (has('hypertension')) notes.push('Keep breathing. Do not hold your breath or clench.')
  if (has('diabetes')) notes.push('Have a small snack nearby in case you feel shaky.')
  if (has('asthma')) notes.push('Keep your inhaler within reach.')
  if (has('arthritis')) notes.push('Move gently. A little stiffness is fine, sharp joint pain is not.')
  if (restricted) notes.push('Only walking and seated moves for now. Tap "My doctor said OK" when your doctor agrees to more.')

  const done = new Map<string, number>()
  for (const id of i.doneThisWeek ?? []) done.set(id, (done.get(id) ?? 0) + 1)

  const ok = (m: Move) =>
    m.level <= maxLevel &&
    !m.avoidIf.some((t) => avoid.has(t)) &&
    !(supportedOnly && m.posture === 'floor') &&
    !(restricted && !(m.group === 'walk' || m.posture === 'seated'))
  const pool = MOVES.filter(ok)
  const rank = (a: Move, b: Move) =>
    (done.get(a.id) ?? 0) - (done.get(b.id) ?? 0) ||
    (older ? POSTURE_RANK[a.posture] - POSTURE_RANK[b.posture] : 0) ||
    a.level - b.level ||
    a.id.localeCompare(b.id)

  const picks: Move[] = []
  for (const g of older ? ORDER_OLDER : ORDER_YOUNGER) {
    if (picks.length === 3) break
    const m = pool.filter((x) => x.group === g && !picks.includes(x)).sort(rank)[0]
    if (m) picks.push(m)
  }
  for (const m of pool.filter((x) => !picks.includes(x)).sort(rank)) { // a restricted pool can lack a group: top up from the rest
    if (picks.length === 3) break
    picks.push(m)
  }
  return { ...base, picks, available: [...pool].sort(rank), notes }
}
