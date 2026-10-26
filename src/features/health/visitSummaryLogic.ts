import { formatNumber } from '../../lib/labFormat'
import type { MedTaken, Medication } from '../log/store'
import { countDoses, ON_TIME_MIN } from './doseCount'
import { isLive, parseSchedule } from './meds'
import { lastDays } from '../today/myWeekLogic'
import { readingPosition } from './model'
import { toCanonicalReading, type Reading } from './ranges'
import { clock12 } from './medActions'

/** One page for the doctor, built on this phone from what it already holds: 30 days of blood pressure and sugar, the medicines being taken, and how many doses were on time.
 *  Pure. The image and the share live in summaryImage.ts. Not a medical record and not advice. */
export const SUMMARY_DAYS = 30
export { ON_TIME_MIN }
const DAY = 86_400_000
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const avg = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length

export interface SummaryPerson { name: string; birthdate?: string | null; bloodType?: string | null; allergies?: string[]; conditions?: string[] }
export interface Summary {
  title: string
  who: string
  madeOn: string
  bp: { text: string; n: number; high: number } | null
  sugar: { text: string; n: number; high: number } | null
  medicines: string[]
  adherence: { done: number; want: number; pct: number } | null
  facts: string[]
  lines: string[]
}

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (d: Date) => `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`

function ageOf(birthdate: string | null | undefined, now: Date): string | null {
  if (!birthdate) return null
  const b = new Date(`${birthdate.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(b.getTime())) return null
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a >= 0 && a < 130 ? `${a} years` : null
}

/** Doses taken within 2 hours of their time over the last 30 days, from the one shared counter (doseCount.ts). */
export function adherence(meds: Medication[], takes: MedTaken[], personId: string, now: Date): { done: number; want: number; pct: number } | null {
  const n = countDoses({ meds, takes, personId, now, days: lastDays(now, SUMMARY_DAYS) })
  return n.want ? { done: n.done, want: n.want, pct: n.pct! } : null
}

const doseLine = (m: Medication) => {
  const s = parseSchedule(m.schedule)
  const when = m.asNeeded ? 'as needed' : s.times.length ? s.times.map(clock12).join(' and ') : 'time not set'
  return [[m.name, m.strength].filter(Boolean).join(' '), m.dose ? `${m.dose}, ${when}` : when].join(': ')
}

export function buildSummary(i: { person: SummaryPerson; readings: Reading[]; meds: Medication[]; takes: MedTaken[]; personId: string; now: Date }): Summary {
  const since = i.now.getTime() - SUMMARY_DAYS * DAY
  const inWin = (r: Reading) => isNum(r.value) && Date.parse(r.takenAt) >= since && Date.parse(r.takenAt) <= i.now.getTime() + DAY
  const mine = i.readings.filter((r) => r.personId === i.personId && inWin(r)).map(toCanonicalReading).filter((r): r is Reading => !!r) // glucose mmol/L is converted to mg/dL; an unknown unit is left out
  const of = (t: string) => mine.filter((r) => r.test === t)

  const sys = of('bp_systolic')
  const dia = of('bp_diastolic')
  const bp = sys.length ? {
    text: `${Math.round(avg(sys.map((r) => r.value)))}${dia.length ? `/${Math.round(avg(dia.map((r) => r.value)))}` : ''} ${sys[0]!.unit || 'mmHg'}`,
    n: sys.length,
    high: sys.filter((r) => readingPosition(r) === 'above').length
  } : null
  const sg = of('fasting_glucose')
  const sugar = sg.length ? { text: `${formatNumber(Math.round(avg(sg.map((r) => r.value)) * 10) / 10)} ${sg[0]!.unit || 'mg/dL'}`, n: sg.length, high: sg.filter((r) => readingPosition(r) === 'above').length } : null

  const live = i.meds.filter((m) => m.personId === i.personId && isLive(m))
  const medicines = live.map(doseLine)
  const ad = adherence(i.meds, i.takes, i.personId, i.now)
  const age = ageOf(i.person.birthdate, i.now)
  const facts = [
    [age, i.person.bloodType ? `blood type ${i.person.bloodType}` : null].filter(Boolean).join(' · '),
    i.person.allergies?.length ? `Allergies: ${i.person.allergies.join(', ')}` : '',
    i.person.conditions?.length ? `Conditions: ${i.person.conditions.join(', ')}` : ''
  ].filter(Boolean)
  const title = `Summary for the doctor`
  const madeOn = `Made ${dmy(i.now)} from this phone's records`
  const lines = [
    title, madeOn, '', i.person.name, ...facts, '',
    'Home readings, last 30 days',
    bp ? `Blood pressure average ${bp.text} (${bp.n} ${bp.n === 1 ? 'reading' : 'readings'}${bp.high ? `, ${bp.high} above the general guide` : ''})` : 'Blood pressure: no readings',
    sugar ? `Fasting sugar average ${sugar.text} (${sugar.n} ${sugar.n === 1 ? 'reading' : 'readings'}${sugar.high ? `, ${sugar.high} above the general guide` : ''})` : 'Fasting sugar: no readings',
    '', 'Medicines now', ...(medicines.length ? medicines : ['None listed']), '',
    ad ? `Doses on time: ${ad.pct}% (${ad.done} of ${ad.want})` : 'Doses on time: not enough data yet',
    '', 'Compiled by the family from this phone. Not a medical device and not medical advice.'
  ]
  return { title, who: i.person.name, madeOn, bp, sugar, medicines, adherence: ad, facts, lines }
}
