import { lastDays } from '../today/myWeekLogic'
import { countDoses } from './doseCount'
import type { Activity, FoodEntry, MedTaken, Medication, WaterEntry } from '../log/store'
import { dayOf } from './meds'
import type { Reading } from './ranges'

/** The Health nudge card: this week's habit goals and the streak of days with any log. Pure.
 *  The goals are friendly habit targets, NOT clinical thresholds (see CLINICAL-REVIEW.md, session 9). Unknown is never 0:
 *  a goal with nothing done yet says "Not yet this week", and a streak that is not running is not shown as a number. */
export type GoalId = 'bp' | 'sugar' | 'meds' | 'meals' | 'move'
export interface Goal {
  id: GoalId
  label: string
  /** Done so far, null when nothing yet (never 0). */
  done: number | null
  target: number
  /** Words under the ring: "2 of 3 days", "Not yet this week". */
  text: string
  met: boolean
  /** 0..1 for the ring. */
  pct: number
  /** The button: a sheet that adds a reading, or a link to the screen where it is logged. */
  cta: { label: string; sheet?: 'bp' | 'fasting_glucose'; href?: string }
  /** The friendly next step shown when this goal is the one to do next. */
  step: string
}
export interface Nudge { streak: number | null; loggedToday: boolean; goals: Goal[]; next: Goal | null; allMet: boolean }

/** Public basis for the targets (all app-set habit goals, none a diagnostic rule):
 *  BP and sugar: 3 days a week is a starter habit; AHA "Monitoring Your Blood Pressure at Home" asks for daily readings only in the week before a visit.
 *  Move: 150 minutes a week, WHO Guidelines on physical activity and sedentary behaviour (2020), adults and older adults. */
export const BP_DAYS = 3
export const SUGAR_DAYS = 3
export const MEAL_DAYS = 4
export const MOVE_MINUTES = 150

const BP = ['bp_systolic', 'bp_diastolic']
const SUGAR = ['fasting_glucose', 'glucose']
const valid = (iso: string) => Number.isFinite(Date.parse(iso))

export function computeNudge(i: { personId: string; readings: Reading[]; takes: MedTaken[]; activity: Activity[]; food: FoodEntry[]; water: WaterEntry[]; meds: Medication[]; now: Date }): Nudge {
  const days = lastDays(i.now)
  const today = dayOf(i.now)
  const mine = i.readings.filter((r) => r.personId === i.personId && valid(r.takenAt))
  const daysOf = (rows: Reading[], tests: string[]) => new Set(rows.filter((r) => tests.includes(r.test) && days.includes(dayOf(r.takenAt))).map((r) => dayOf(r.takenAt))).size

  // streak: consecutive days with any log, ending today (or yesterday while today is still open)
  const logged = new Set<string>()
  for (const r of mine) logged.add(dayOf(r.takenAt))
  for (const t of i.takes) if (t.personId === i.personId && !t.skipped && valid(t.takenAt)) logged.add(dayOf(t.takenAt))
  for (const a of i.activity) if (a.personId === i.personId && valid(a.startedAt)) logged.add(dayOf(a.startedAt))
  for (const f of i.food) if (f.personId === i.personId && valid(f.eatenAt)) logged.add(dayOf(f.eatenAt))
  for (const w of i.water) if (w.personId === i.personId && valid(w.drunkAt)) logged.add(dayOf(w.drunkAt))
  const loggedToday = logged.has(today)
  let streak = 0
  for (let k = loggedToday ? 0 : 1; k < 400; k++) {
    if (!logged.has(dayOf(new Date(i.now.getFullYear(), i.now.getMonth(), i.now.getDate() - k, 12)))) break
    streak++
  }

  const goal = (g: { id: GoalId; label: string; n: number; target: number; unitWord: string; cta: Goal['cta']; step: string }): Goal => {
    const done = g.n > 0 ? g.n : null
    return { id: g.id, label: g.label, target: g.target, cta: g.cta, step: g.step, done, met: g.n >= g.target, pct: Math.min(1, g.n / g.target), text: done == null ? 'Not yet this week' : `${done} of ${g.target} ${g.unitWord}` }
  }
  const goals: Goal[] = [goal({ id: 'bp', label: 'Blood pressure', n: daysOf(mine, BP), target: BP_DAYS, unitWord: 'days', cta: { label: 'Add BP', sheet: 'bp' }, step: 'Take your BP now - it takes about 1 minute' })]
  if (mine.some((r) => SUGAR.includes(r.test))) goals.push(goal({ id: 'sugar', label: 'Sugar', n: daysOf(mine, SUGAR), target: SUGAR_DAYS, unitWord: 'days', cta: { label: 'Add sugar', sheet: 'fasting_glucose' }, step: 'Check your sugar - about 2 minutes' }))
  const doses = countDoses({ meds: i.meds, takes: i.takes, personId: i.personId, now: i.now, days })
  if (doses.want > 0) goals.push(goal({ id: 'meds', label: 'Medicines', n: doses.done, target: doses.want, unitWord: 'doses', cta: { label: 'Open medicines', href: '#health/meds' }, step: "Mark today's medicines - 30 seconds" }))
  const mealDays = new Set(i.food.filter((f) => f.personId === i.personId && valid(f.eatenAt) && days.includes(dayOf(f.eatenAt))).map((f) => dayOf(f.eatenAt))).size
  goals.push(goal({ id: 'meals', label: 'Meals', n: mealDays, target: MEAL_DAYS, unitWord: 'days', cta: { label: 'Log a meal', href: '#health/nutrition' }, step: 'Log what you ate - 1 minute' }))
  const mins = i.activity.filter((a) => a.personId === i.personId && valid(a.startedAt) && days.includes(dayOf(a.startedAt)) && typeof a.minutes === 'number' && Number.isFinite(a.minutes) && a.minutes > 0).reduce((s, a) => s + (a.minutes ?? 0), 0)
  goals.push(goal({ id: 'move', label: 'Move', n: Math.round(mins), target: MOVE_MINUTES, unitWord: 'minutes', cta: { label: 'Pick a gentle move', href: '#health/move' }, step: 'Move gently for 10 minutes' }))

  // the next step is the first goal still open; medicines come right after BP so the day's doses are not forgotten
  const order: GoalId[] = ['bp', 'meds', 'sugar', 'meals', 'move']
  const next = order.map((id) => goals.find((g) => g.id === id)).find((g) => g && !g.met) ?? null
  return { streak: streak > 0 ? streak : null, loggedToday, goals, next, allMet: goals.every((g) => g.met) }
}
