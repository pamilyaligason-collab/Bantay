import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type Activity, type FoodEntry, type MedTaken, type WaterEntry } from '../log/store'
import { Ring } from '../look/Ring'
import { lastDays } from '../today/myWeekLogic'
import { labDate, groupLabs, labRow } from './labsLogic'
import { tzMidnight, zoneOf } from '../time/zone'
import { dayOf, manilaDay, matchDoses, slotsFor, type DoseState } from './meds'
import { localDay, readingPosition } from './model'
import { cadenceWord, computeNudge, type Goal } from './nudgeLogic'
import { latestByTest, type Range, type Reading } from './ranges'
import { isVital } from './vitals'
import { useMedicationRows } from './useMedicationRows'
import { useMedications } from './useMedications'
import './health.css'

type Thresholds = (Range & { key: string })[]
const SINCE_DAYS = 45 // enough for a streak worth showing

/** Days of the last 7 on which every top-number BP reading was inside the person's guide, and the days with any BP at all. Unknown stays unknown: no BP gives logged 0, never a "0 near". */
export function bpNearGuide(readings: Reading[], now: Date, family?: Range | null): { near: number; logged: number } {
  const days = lastDays(now)
  const by = new Map<string, boolean>()
  for (const r of readings) {
    if (r.test !== 'bp_systolic' || !Number.isFinite(Date.parse(r.takenAt))) continue
    const d = localDay(r.takenAt)
    if (!days.includes(d)) continue
    by.set(d, (by.get(d) ?? true) && readingPosition(r, family) === 'within')
  }
  return { near: [...by.values()].filter(Boolean).length, logged: by.size }
}

/** "4 to ask" labs and the date of the newest paper, or the empty line. */
export function labsLine(readings: Reading[], thresholds: Thresholds): string {
  const labs = readings.filter((r) => !isVital(r.test) && Number.isFinite(Date.parse(r.takenAt)))
  if (!labs.length) return 'No papers yet'
  const rows = latestByTest(labs).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`)))
  const g = groupLabs(rows)
  const last = [...labs].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]!
  // a result with no printed range is neither in nor out of range: never counted as "in range" (ML-12)
  const head = g.ask.length ? `${g.ask.length} to ask` : g.noRange.length === rows.length ? 'No range printed' : g.noRange.length ? 'None to ask' : 'All in range'
  return `${head} · ${labDate(last.takenAt, true)}`
}

/** Today's dose slots (taken, skipped, pending) and whether this person has any medicine, live. Null until the medicines are read. */
export function useTodayDoses(personId: string): { doses: DoseState[]; hasMeds: boolean } | null {
  const meds = useMedicationRows(personId)
  const [takes, setTakes] = useState<MedTaken[]>([])
  useEffect(() => {
    if (!personId) return setTakes([])
    const since = tzMidnight(manilaDay(new Date(), zoneOf(personId)), zoneOf(personId)) // midnight of the person's day
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(since.toISOString()).filter((m) => m.personId === personId).toArray()).subscribe({ next: setTakes, error: () => setTakes([]) })
    return () => sub.unsubscribe()
  }, [personId])
  return useMemo(() => {
    if (meds === undefined) return null
    const day = manilaDay(new Date())
    return { doses: matchDoses(slotsFor(meds, personId, day), takes, day, manilaDay), hasMeds: meds.length > 0 }
  }, [meds, takes, personId])
}

/** The week's goals and streak (nudgeLogic), live. Same data the old NudgeCard read. */
export function useNudge(personId: string, readings: Reading[]) {
  const meds = useMedications(personId)
  const [rows, setRows] = useState<{ takes: MedTaken[]; activity: Activity[]; food: FoodEntry[]; water: WaterEntry[] }>({ takes: [], activity: [], food: [], water: [] })
  useEffect(() => {
    if (!personId) return setRows({ takes: [], activity: [], food: [], water: [] })
    const since = new Date(Date.now() - SINCE_DAYS * 86_400_000).toISOString()
    const sub = liveQuery(async () => ({
      takes: await ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray(),
      activity: await ldb.activity.where('personId').equals(personId).filter((a) => Date.parse(a.startedAt) >= Date.parse(since)).toArray(), // by instant: pulled rows say +00:00
      food: await ldb.food.where('personId').equals(personId).filter((f) => f.eatenAt >= since).toArray(),
      water: await ldb.water.where('personId').equals(personId).filter((w) => w.drunkAt >= since).toArray()
    })).subscribe({ next: setRows, error: () => undefined })
    return () => sub.unsubscribe()
  }, [personId])
  return useMemo(() => computeNudge({ personId, readings, meds, now: new Date(), ...rows }), [personId, readings, meds, rows])
}

/** The row's headline. The BP goal stays open until 3 days, so with a reading already in today it must not claim none was logged. */
export function nudgeTitle(next: Goal | null, allMet: boolean, bpToday: boolean): string {
  if (allMet) return 'Great week'
  if (!next) return 'Nice. Everything for this week is done.'
  if (next.id !== 'bp') return next.step
  return bpToday ? `${cadenceWord(next)} logged today · ${next.say}` : `${cadenceWord(next)} · ${next.say}`
}

const RING_HUE: Record<string, Goal['id']> = { BP: 'bp', Meals: 'meals', Move: 'move' }

/** Nudge row (88 px): three rings (BP, Meals, Move) with their count as visible text, what to log next, the logging streak, and "Log". The row opens the guided check (#health/nudge). */
export function NudgeRow({ personId, readings, canLog, onAdd }: { personId: string; readings: Reading[]; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const { next, streak, goals, allMet } = useNudge(personId, readings)
  const title = nudgeTitle(next, allMet, readings.some((r) => r.personId === personId && (r.test === 'bp_systolic' || r.test === 'bp_diastolic') && dayOf(r.takenAt) === dayOf(new Date())))
  // nudgeLogic's streak is days with any log for this one person, so it is not called a family streak
  const streakLine = streak == null ? 'Start your streak' : `Logging streak ${streak >= 30 ? '30+' : streak} ${streak === 1 ? 'day' : 'days'}`
  const log = next && canLog ? (next.cta.sheet
    ? <button type="button" className="btn2 gl-log" data-goal={next.id} onClick={() => onAdd(next.cta.sheet!)}>Log</button>
    : <a className="btn2 gl-log" data-goal={next.id} href={next.cta.href}>Log</a>) : null
  return (
    <section className="card nr" data-hue="blue" data-testid="nudge">
      <div className="nr-top">
        <a className="nr-t hc-link" href="#health/nudge"><b>{title}</b></a>
        {log}
      </div>
      <div className="nr-rings">
        {Object.entries(RING_HUE).map(([label, id]) => {
          const g = goals.find((x) => x.id === id)
          return g ? (
            <span className="nr-ring" key={id} data-goal={id}>
              <Ring value={g.pct} size={28} hue="blue" />
              <small>{label} <b>{g.count}</b><span className="hv-sr"> {g.say}</span></small>
            </span>
          ) : null
        })}
        <span className="sub nr-sub" data-testid="nudge-streak">This week · {streakLine}</span>
      </div>
    </section>
  )
}
