import { GUIDE, position, rangeText, type Position, type Range, type Reading } from './ranges'

/** Pure Health logic (v6, D-38): headline, previous value, body-map nodes, monthly averages, medicine times. No React, no storage. */

const DAY = 86_400_000
/** Local calendar day (YYYY-MM-DD) of an ISO instant: Manila is UTC+8, so a 00:30 reading belongs to that local day, not the UTC one. */
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

// ---- plain names --------------------------------------------------------------------------------
const PLAIN: Record<string, string> = {
  bp_systolic: 'blood pressure', bp_diastolic: 'blood pressure', fasting_glucose: 'blood sugar', glucose: 'blood sugar',
  hba1c: 'HbA1c', total_cholesterol: 'cholesterol', ldl: 'LDL cholesterol', triglycerides: 'triglycerides', egfr: 'kidney score', weight: 'weight', heart_rate: 'pulse'
}
/** Heading for a test key: the guide's label, else a plain name (never the raw key). */
const LABELS: Record<string, string> = { bp: 'Blood pressure', blood_pressure: 'Blood pressure', sugar: 'Blood sugar', pulse: 'Pulse', heart_rate: 'Pulse', weight: 'Weight', glucose: 'Blood sugar (after eating)', steps: 'Steps', sleep: 'Sleep', mood: 'Mood' }
export const metricLabel = (test: string) => GUIDE[test]?.label ?? LABELS[test] ?? `${test.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
export const plainName = (test: string) => PLAIN[test] ?? GUIDE[test]?.label.toLowerCase() ?? test.replace(/_/g, ' ')

// ---- the range a reading is judged against: family limit, then the lab's own, then the general guide ----------
export function effectiveRange(r: Reading, family?: Range | null): { range: Range | null; from: 'family' | 'lab' | 'guide' | 'none' } {
  const has = (x?: Range | null) => !!x && (x.low != null || x.high != null)
  if (has(family)) return { range: family!, from: 'family' }
  const lab = { low: r.labLow ?? null, high: r.labHigh ?? null }
  if (has(lab)) return { range: lab, from: 'lab' }
  const g = GUIDE[r.test]
  if (g && has(g)) return { range: { low: g.low, high: g.high }, from: 'guide' }
  return { range: null, from: 'none' }
}
export const readingPosition = (r: Reading, family?: Range | null): Position => position(r.value, effectiveRange(r, family).range ?? undefined)

// ---- headline -------------------------------------------------------------------------------------------
export interface Headline { title: string; sub: string; tone: 'ok' | 'watch' | 'none' }

/** One plain sentence from the newest readings of the last 7 days against their ranges. Unknown is never "in range". */
export function insightHeadline(latest: Reading[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): Headline {
  if (latest.length === 0) return { title: 'No results yet', sub: 'Add one to see it on the body map.', tone: 'none' }
  const week = latest.filter((r) => { const t = Date.parse(r.takenAt); return Number.isFinite(t) && now.getTime() - t <= 7 * DAY })
  if (week.length === 0) return { title: 'No new readings this week', sub: 'Your last results are below.', tone: 'none' }
  const judged = week.map((r) => ({ name: plainName(r.test), pos: readingPosition(r, familyOf(r)) })).filter((j) => j.pos !== 'none')
  if (judged.length === 0) return { title: 'New results are in', sub: 'No range to compare with yet.', tone: 'none' }
  const out = [...new Set(judged.filter((j) => j.pos !== 'within').map((j) => j.name))]
  if (out.length === 0) {
    const names = [...new Set(judged.map((j) => j.name))]
    return { title: names.length === 1 ? `${cap(names[0]!)} is in range this week` : 'All in range this week', sub: 'Keep going.', tone: 'ok' }
  }
  if (out.length === 1) return { title: `${cap(out[0]!)} needs a look this week`, sub: 'Outside the usual range. Ask your doctor.', tone: 'watch' }
  return { title: 'A few numbers need a look this week', sub: `${cap(out.slice(0, 2).join(' and '))}${out.length > 2 ? ' and more' : ''} are outside the usual range. Ask your doctor.`, tone: 'watch' }
}

// ---- previous value ---------------------------------------------------------------------------------------
/** The reading just before the latest one for a test (an older takenAt). null when there is none. */
export function previousReading(readings: Reading[], test: string): Reading | null {
  const s = readings.filter((r) => r.test === test && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))
  const latest = s[0]
  return (latest && s.find((r) => Date.parse(r.takenAt) < Date.parse(latest.takenAt))) || null
}

const distance = (v: number, r: Range | null) => (!r ? null : r.low != null && v < r.low ? r.low - v : r.high != null && v > r.high ? v - r.high : 0)

/** "Before" line facts: change and whether the latest is closer to or further from the range than the previous. */
export function compareToPrevious(latest: Reading, prev: Reading, family?: Range | null) {
  const delta = Math.round((latest.value - prev.value) * 100) / 100
  const { range } = effectiveRange(latest, family)
  const a = distance(latest.value, range)
  const b = distance(prev.value, range)
  const trend: 'closer' | 'further' | 'same' | null = a == null || b == null ? null : a === b ? 'same' : a < b ? 'closer' : 'further'
  return { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', trend } as const
}

export const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })
}

export function beforeLine(latest: Reading, prev: Reading, family?: Range | null): string {
  const c = compareToPrevious(latest, prev, family)
  const unit = prev.unit ? ` ${prev.unit}` : ''
  const move = c.direction === 'same' ? 'no change' : `${c.direction} ${Math.abs(c.delta)}`
  const near = c.trend === 'closer' ? ', closer to normal' : c.trend === 'further' ? ', further from normal' : ''
  return `Before: ${prev.value}${unit} on ${shortDate(prev.takenAt)}, ${move}${near}`
}

/** Positions (0..100) of the band and the two markers on a mini range bar. A missing range draws no band. */
export function barLayout(latest: number, prev: number | null, range: Range | null) {
  const vals = [latest, ...(prev != null ? [prev] : []), ...(range?.low != null ? [range.low] : []), ...(range?.high != null ? [range.high] : [])]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.25
  const a = lo - pad
  const span = hi + pad - a
  const pct = (v: number) => Math.round(((v - a) / span) * 1000) / 10
  return {
    band: range && (range.low != null || range.high != null) ? { from: range.low != null ? pct(range.low) : 0, to: range.high != null ? pct(range.high) : 100 } : null,
    now: pct(latest),
    prev: prev != null ? pct(prev) : null
  }
}

/** SVG path for a tiny trend line (oldest to newest, last 12 readings) in a 60x22 box. Fewer than 2 readings: ''. */
export function sparkPath(rs: Reading[], w = 60, h = 22): string {
  const v = [...rs].filter((r) => Number.isFinite(Date.parse(r.takenAt)) && isNum(r.value)).sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt)).slice(-12).map((r) => r.value)
  if (v.length < 2) return ''
  const lo = Math.min(...v)
  const span = Math.max(...v) - lo || 1
  return v.map((n, i) => `${i ? 'L' : 'M'}${Math.round((i / (v.length - 1)) * (w - 4) * 10) / 10 + 2} ${Math.round((h - 3 - ((n - lo) / span) * (h - 6)) * 10) / 10}`).join('')
}

// ---- body map -----------------------------------------------------------------------------------------------
export type NodeId = 'sleep' | 'mood' | 'bp' | 'pulse' | 'sugar' | 'weight' | 'steps'
export interface Activity { kind: string; minutes: number | null; steps: number | null; startedAt: string }
export interface NodeView { id: NodeId; label: string; value: string; note: string; state: Position; code: string; empty: boolean }
export const MOOD_WORD: Record<string, string> = { 'mood-good': 'Good', 'mood-ok': 'OK', 'mood-low': 'Low' }
const STATE_NOTE: Record<Position, string> = { within: 'In range', below: 'A bit low', above: 'A bit high', none: '' }

export const hoursMinutes = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}`
const sameDay = (a: string, b: Date) => new Date(a).toDateString() === b.toDateString()

/** Sum of a day's activity numbers, or null when there was nothing that day (never 0 for no data). */
function dayTotal(acts: Activity[], kind: string, field: 'minutes' | 'steps', day: Date): number | null {
  const v = acts.filter((a) => a.kind === kind && sameDay(a.startedAt, day)).map((a) => a[field]).filter(isNum)
  return v.length ? v.reduce((s, n) => s + n, 0) : null
}

export function bodyNodes(readings: Reading[], acts: Activity[], now: Date, familyOf: (r: Reading) => Range | undefined = () => undefined): NodeView[] {
  const last = (test: string) => readings.filter((r) => r.test === test).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const worst = (ps: Position[]): Position => (ps.find((p) => p === 'above' || p === 'below') ?? ps.find((p) => p === 'within') ?? 'none')
  const yesterday = new Date(now.getTime() - DAY)
  const nodes: NodeView[] = []

  const sleepMin = dayTotal(acts, 'sleep', 'minutes', now) ?? dayTotal(acts, 'sleep', 'minutes', yesterday)
  nodes.push({ id: 'sleep', label: 'Sleep', value: sleepMin == null ? '--' : hoursMinutes(sleepMin), note: sleepMin == null ? 'No data yet' : 'last night', state: 'none', code: 'sleep', empty: sleepMin == null })

  const mood = acts.filter((a) => a.kind in MOOD_WORD).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]
  nodes.push({ id: 'mood', label: 'Mood', value: mood ? MOOD_WORD[mood.kind]! : '--', note: mood ? (sameDay(mood.startedAt, now) ? 'today' : shortDate(mood.startedAt)) : 'No data yet', state: 'none', code: 'mood', empty: !mood })

  const sys = last('bp_systolic')
  const dia = last('bp_diastolic')
  const bpPos = worst([sys ? readingPosition(sys, familyOf(sys)) : 'none', dia ? readingPosition(dia, familyOf(dia)) : 'none'])
  nodes.push({ id: 'bp', label: 'BP', value: sys && dia ? `${sys.value}/${dia.value}` : sys ? String(sys.value) : '--', note: sys ? STATE_NOTE[bpPos] || shortDate(sys.takenAt) : 'No data yet', state: bpPos, code: 'bp_systolic', empty: !sys })

  const hr = last('heart_rate')
  nodes.push({ id: 'pulse', label: 'Pulse', value: hr ? String(hr.value) : '--', note: hr ? shortDate(hr.takenAt) : 'No data yet', state: 'none', code: 'heart_rate', empty: !hr })

  const sug = last('fasting_glucose') ?? last('glucose')
  const sugPos = sug ? readingPosition(sug, familyOf(sug)) : 'none'
  nodes.push({ id: 'sugar', label: 'Sugar', value: sug ? String(sug.value) : '--', note: sug ? STATE_NOTE[sugPos] || shortDate(sug.takenAt) : 'No data yet', state: sugPos, code: sug?.test ?? 'fasting_glucose', empty: !sug })

  const w = last('weight')
  nodes.push({ id: 'weight', label: 'Weight', value: w ? `${w.value} kg` : '--', note: w ? shortDate(w.takenAt) : 'No data yet', state: 'none', code: 'weight', empty: !w })

  const steps = dayTotal(acts, 'steps', 'steps', now)
  nodes.push({ id: 'steps', label: 'Steps', value: steps == null ? '--' : steps.toLocaleString('en-PH'), note: steps == null ? 'No data yet' : 'today', state: 'none', code: 'steps', empty: steps == null })
  return nodes
}

// ---- metric detail ------------------------------------------------------------------------------------------
export interface Point { takenAt: string; value: number }
export type Period = 'week' | 'month'

export const ACTIVITY_CODES = ['steps', 'sleep', 'mood'] as const
export const isActivityCode = (c: string): c is (typeof ACTIVITY_CODES)[number] => (ACTIVITY_CODES as readonly string[]).includes(c)

/** One point per day: steps summed, sleep summed (hours), mood 1..3. Days with no data have no point. */
export function activitySeries(acts: Activity[], code: 'steps' | 'sleep' | 'mood'): Point[] {
  const byDay = new Map<string, number[]>()
  for (const a of acts) {
    if (!a.startedAt || Number.isNaN(Date.parse(a.startedAt))) continue
    const day = localDay(a.startedAt)
    const v = code === 'steps' ? (a.kind === 'steps' ? a.steps : null) : code === 'sleep' ? (a.kind === 'sleep' && isNum(a.minutes) ? Math.round((a.minutes / 60) * 10) / 10 : null) : a.kind === 'mood-good' ? 3 : a.kind === 'mood-ok' ? 2 : a.kind === 'mood-low' ? 1 : null
    if (isNum(v) && a.startedAt) byDay.set(day, [...(byDay.get(day) ?? []), v])
  }
  return [...byDay.entries()]
    .map(([day, v]) => ({ takenAt: `${day}T12:00:00.000Z`, value: code === 'mood' ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : v.reduce((s, n) => s + n, 0) }))
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
}

export const inPeriod = (pts: Point[], period: Period, now: Date) =>
  pts.filter((p) => { const t = Date.parse(p.takenAt); return Number.isFinite(t) && now.getTime() - t <= (period === 'week' ? 7 : 30) * DAY && t <= now.getTime() + DAY })

/** Average per calendar month for the last `months` months, newest last. Months with no points are left out. */
export function monthlyAverages(pts: Point[], now: Date, months = 5): { month: string; label: string; avg: number; n: number }[] {
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys.flatMap((k) => {
    const v = pts.filter((p) => Number.isFinite(Date.parse(p.takenAt)) && localDay(p.takenAt).slice(0, 7) === k && isNum(p.value)).map((p) => p.value)
    if (!v.length) return []
    const [y, m] = k.split('-').map(Number)
    return [{ month: k, label: new Date(y!, m! - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }), avg: Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10, n: v.length }]
  })
}

/** General-guide wording per metric. Never a diagnosis or a target. */
export const ADVICE: Record<string, string> = {
  bp_systolic: 'Measure at the same time each day, seated, after 5 minutes of rest. Bring your numbers to your next visit.',
  bp_diastolic: 'Measure at the same time each day, seated, after 5 minutes of rest. Bring your numbers to your next visit.',
  fasting_glucose: 'Fasting means no food or sugary drinks for 8 hours before the test. Note any change to your meals or medicines.',
  glucose: 'A reading after a meal is normally higher than a fasting one. Note when you ate.',
  hba1c: 'HbA1c reflects about 3 months, so it moves slowly. Your doctor tells you how often to repeat it.',
  weight: 'Weigh yourself at the same time of day, in similar clothes. Look at the weeks, not a single day.',
  heart_rate: 'Pulse changes with activity, stress and caffeine. Rest for 5 minutes before you check it.',
  steps: 'Small walks add up. Build up slowly and rest when you need to.',
  sleep: 'A steady bedtime and wake time helps sleep. Tell your doctor if tired days keep coming back.',
  mood: 'Notice patterns, such as bad days after bad nights. Talk to someone you trust if low days keep coming.'
}
export const ADVICE_FALLBACK = 'Keep checking at the same time and in the same way, so the numbers can be compared.'
export const MORE_INFO = { text: 'Read more on MedlinePlus', url: 'https://medlineplus.gov/healthtopics.html' } as const

export const rangeLine = (r: Reading, family?: Range | null) => {
  const { range, from } = effectiveRange(r, family)
  return from === 'none' ? '' : `${from === 'family' ? 'Family limit' : from === 'lab' ? 'Lab range' : 'General guide'}: ${from === 'guide' ? GUIDE[r.test]!.text : rangeText(range!)}`
}

// ---- medicines ----------------------------------------------------------------------------------------------
export interface Slot { name: string; at: number | null } // at = minutes after local midnight; null = no time given

const TIME = /(\d{1,2}):(\d{2})\s*(am|pm)?/gi

/** 'Losartan', 'Losartan 8:00', 'Metformin 8:00,20:00', 'Metformin 8:30 PM' -> name and its times. Bad times are dropped, never guessed. */
export function parseMedicine(s: string): { name: string; times: number[] } {
  const text = s.trim()
  const times: number[] = []
  let first = -1
  for (const m of text.matchAll(TIME)) {
    let h = Number(m[1])
    const min = Number(m[2])
    const ap = m[3]?.toLowerCase()
    if (first < 0) first = m.index ?? 0
    if (ap) { if (h < 1 || h > 12) continue; h = (h % 12) + (ap === 'pm' ? 12 : 0) }
    if (h > 23 || min > 59) continue
    times.push(h * 60 + min)
  }
  const name = (first < 0 ? text : text.slice(0, first)).replace(/[\s,@-]+$/, '').trim()
  return { name: name || text, times: [...new Set(times)].sort((a, b) => a - b) }
}

export const medSlots = (entries: string[]): Slot[] =>
  entries.flatMap((e): Slot[] => {
    if (typeof e !== 'string' || !e.trim()) return []
    const p = parseMedicine(e)
    return p.times.length ? p.times.map((at) => ({ name: p.name, at })) : [{ name: p.name, at: null }]
  })

export const clock = (at: number) => `${Math.floor(at / 60) % 12 || 12}:${String(at % 60).padStart(2, '0')} ${at < 720 ? 'AM' : 'PM'}`
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Marks the earliest slots of a medicine taken, one per take logged today. A medicine with no times is taken after one take. */
export function doseStates(slots: Slot[], takes: { name: string; takenAt: string }[], now: Date): (Slot & { taken: boolean })[] {
  const today = takes.filter((t) => sameDay(t.takenAt, now))
  const used = new Map<string, number>()
  return [...slots]
    .sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9))
    .map((s) => {
      const key = s.name.trim().toLowerCase()
      const n = today.filter((t) => sameName(t.name, s.name)).length
      const seen = used.get(key) ?? 0
      used.set(key, seen + 1)
      return { ...s, taken: seen < n }
    })
}
