import { formatNumber } from '../../lib/labFormat'
import { groupLabs, labInfo, labRow, labVerdict, type LabRow } from '../health/labsLogic'
import { matchDoses, slotsFor, type DoseState } from '../health/meds'
import { metricLabel, plainName, readingPosition, shortDate } from '../health/model'
import { latestByTest, type Position, type Range, type Reading } from '../health/ranges'
import { byVitalOrder, isVital } from '../health/vitals'
import type { Medication, MedTaken } from '../log/store'

/** Pure logic for the member report (#family/people/<id>/report). No React, no storage. Unknown is null, never 0. */

const DAY = 86_400_000
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
type FamilyOf = (r: Reading) => Range | undefined

// ---- who may open the report ----------------------------------------------------------------------------------
/** Mirrors the read RLS on readings (0001 + 0008): the person, any carer of the person, or an admin. Signed out (no member) is a local-only phone, whose data is its owner's. */
export function canViewReport(i: { signedIn: boolean; personId: string; ownId: string; carerIds: readonly string[]; isAdmin: boolean }): boolean {
  if (!i.personId) return false
  if (!i.signedIn) return true
  return i.isAdmin || (!!i.ownId && i.personId === i.ownId) || i.carerIds.includes(i.personId)
}

// ---- vitals with plain verdicts ---------------------------------------------------------------------------------
export interface VitalCard { key: string; label: string; value: string; unit: string; word: string; pos: Position; icon: 'check' | 'up' | 'down' | 'info'; on: string }
const VERDICT: Record<Position, { word: string; icon: VitalCard['icon'] }> = {
  above: { word: 'A bit high', icon: 'up' }, below: { word: 'A bit low', icon: 'down' }, within: { word: 'Usual', icon: 'check' }, none: { word: 'No range to compare', icon: 'info' }
}
const worst = (a: Position, b: Position): Position => (a === 'above' || a === 'below' ? a : b === 'above' || b === 'below' ? b : a === 'none' || b === 'none' ? 'none' : 'within')

/** Newest reading per vital in the last 30 days; blood pressure joins top and bottom into one card judged by the worse of the two. */
export function vitalCards(readings: Reading[], now: Date, familyOf: FamilyOf = () => undefined): VitalCard[] {
  const recent = readings.filter((r) => isVital(r.test) && isNum(r.value) && now.getTime() - Date.parse(r.takenAt) <= 30 * DAY && Date.parse(r.takenAt) <= now.getTime() + DAY)
  const latest = byVitalOrder(latestByTest(recent))
  const out: VitalCard[] = []
  const sys = latest.find((r) => r.test === 'bp_systolic')
  const dia = latest.find((r) => r.test === 'bp_diastolic')
  const card = (r: Reading, value: string, pos: Position, key = r.test, label = metricLabel(r.test)): VitalCard => ({ key, label, value, unit: r.unit ?? '', ...VERDICT[pos], pos, on: shortDate(r.takenAt) })
  if (sys && dia) out.push(card(sys, `${formatNumber(sys.value)}/${formatNumber(dia.value)}`, worst(readingPosition(sys, familyOf(sys)), readingPosition(dia, familyOf(dia))), 'bp', 'Blood pressure'))
  for (const r of latest) {
    if (sys && dia && (r.test === 'bp_systolic' || r.test === 'bp_diastolic')) continue
    out.push(card(r, formatNumber(r.value), readingPosition(r, familyOf(r))))
  }
  return out
}

// ---- medicine doses as 7 day cells ----------------------------------------------------------------------------
export type CellState = 'none' | 'taken' | 'missed' | 'pending'
export interface DayCell { day: string; label: string; state: CellState; taken: number; due: number }
export interface Adherence { cells: DayCell[]; taken: number; due: number; missed: { day: string; label: string; names: string[] }[] }

/** Seven local days ending today. A day with no scheduled doses is "none". A past day with a dose not taken (or skipped) is "missed". Today's open doses are "pending", not missed. */
export function adherence(meds: Medication[], takes: Pick<MedTaken, 'name' | 'takenAt' | 'medicationId' | 'slot' | 'skipped'>[], personId: string, now: Date): Adherence {
  const today = dayKey(now)
  const cells: DayCell[] = []
  const missed: Adherence['missed'] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const day = dayKey(d)
    const doses: DoseState[] = matchDoses(slotsFor(meds, personId, day), takes, day)
    const taken = doses.filter((x) => x.state === 'taken').length
    const open = doses.filter((x) => x.state !== 'taken')
    const state: CellState = doses.length === 0 ? 'none' : open.length === 0 ? 'taken' : day === today && open.every((x) => x.state === 'pending') ? 'pending' : 'missed'
    cells.push({ day, label: WD[d.getDay()]!, state, taken, due: doses.length })
    if (state === 'missed') missed.push({ day, label: WD[d.getDay()]!, names: [...new Set(open.map((x) => x.name))] })
  }
  const counted = cells.filter((c) => c.state !== 'pending') // today's open doses are not due yet
  return { cells, taken: counted.reduce((s, c) => s + c.taken, 0), due: counted.reduce((s, c) => s + c.due, 0), missed }
}

// ---- flagged labs ---------------------------------------------------------------------------------------------
export interface FlaggedLab { test: string; name: string; value: string; unit: string; word: string; icon: 'up' | 'down'; on: string }
export function flaggedLabs(readings: Reading[], familyOf: FamilyOf = () => undefined): { flagged: FlaggedLab[]; total: number } {
  const labs = latestByTest(readings.filter((r) => !isVital(r.test) && isNum(r.value)))
  const rows: LabRow[] = labs.map((r) => labRow(r, familyOf(r)))
  const flagged = groupLabs(rows).ask.map((x): FlaggedLab => {
    const v = labVerdict(x.pos)!
    return { test: x.reading.test, name: metricLabel(x.reading.test), value: formatNumber(x.reading.value), unit: x.reading.unit ?? '', word: v.word, icon: v.icon as 'up' | 'down', on: shortDate(x.reading.takenAt) }
  })
  return { flagged, total: rows.length }
}

// ---- things to bring up ---------------------------------------------------------------------------------------
export const BRING_MAX = 8
/** Numbered, in this order: flagged vitals, flagged labs, missed doses, then the person's own saved questions. Suggestions are questions, never advice. FOR CLINICIAN REVIEW. */
export function bringUp(i: { vitals: VitalCard[]; labs: FlaggedLab[]; missed: Adherence['missed']; questions: string[] }): string[] {
  const out: string[] = []
  for (const v of i.vitals) if (v.pos === 'above' || v.pos === 'below') out.push(`My ${plainName(v.key === 'bp' ? 'bp_systolic' : v.key)} was ${v.word.toLowerCase()} on ${v.on}. What should I do about it?`)
  for (const l of i.labs) out.push(`${l.name} was ${l.word.toLowerCase()} on ${l.on}. ${labInfo(l.test).questions[0]!}`)
  if (i.missed.length) {
    const names = [...new Set(i.missed.flatMap((m) => m.names))].slice(0, 3).join(', ')
    out.push(`Some doses were missed this week (${names}). Can the times, or the way I take them, be made easier?`)
  }
  for (const q of i.questions) if (typeof q === 'string' && q.trim()) out.push(q.trim())
  return [...new Set(out)].slice(0, BRING_MAX)
}

// ---- one call for the screen --------------------------------------------------------------------------------
export interface Report { vitals: VitalCard[]; adherence: Adherence; hasMeds: boolean; labs: { flagged: FlaggedLab[]; total: number }; bring: string[]; empty: boolean }
export function buildReport(i: { readings: Reading[]; meds: Medication[]; takes: MedTaken[]; questions: string[]; personId: string; now: Date; familyOf?: FamilyOf }): Report {
  const fam = i.familyOf ?? (() => undefined)
  const vitals = vitalCards(i.readings, i.now, fam)
  const ad = adherence(i.meds, i.takes, i.personId, i.now)
  const labs = flaggedLabs(i.readings, fam)
  const hasMeds = ad.cells.some((c) => c.due > 0)
  return { vitals, adherence: ad, hasMeds, labs, bring: bringUp({ vitals, labs: labs.flagged, missed: ad.missed, questions: i.questions }), empty: !vitals.length && !hasMeds && !labs.total }
}

// ---- the neutral line on the People list: no numbers ------------------------------------------------------------
/** "2 to check" / "All up to date" / null when this phone has nothing for them (unknown is never "up to date"). */
export function flagLine(i: { readings: Reading[]; meds: Medication[]; takes: MedTaken[]; personId: string; now: Date; familyOf?: FamilyOf }): string | null {
  const r = buildReport({ ...i, questions: [] })
  if (r.empty) return null
  const n = r.vitals.filter((v) => v.pos === 'above' || v.pos === 'below').length + r.labs.flagged.length + (r.adherence.missed.length ? 1 : 0)
  return n === 0 ? 'All up to date' : `${n} to check`
}
