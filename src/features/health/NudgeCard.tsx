import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../shell/Icon'
import { ldb, type Activity, type FoodEntry, type MedTaken, type WaterEntry } from '../log/store'
import { computeNudge, type Goal } from './nudgeLogic'
import type { Reading } from './ranges'
import { useMedications } from './useMedications'
import './nudge.css'

const SINCE_DAYS = 45 // enough for a streak worth showing; the card says "30+" beyond that
const R = 20
const C = 2 * Math.PI * R

function Ring({ g }: { g: Goal }) {
  return (
    <svg className="nd-ring" width="64" height="64" viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <circle cx="26" cy="26" r={R} className="nd-track" />
      <circle cx="26" cy="26" r={R} className="nd-arc" strokeDasharray={C} strokeDashoffset={C * (1 - g.pct)} transform="rotate(-90 26 26)" />
      <text x="26" y="26" className="nd-count" textAnchor="middle" dominantBaseline="central">{g.count}</text>
    </svg>
  )
}

/** The Health nudge: a streak, this week's rings and one friendly next step with a one-tap button. Replaces the plain "no new reading" and zero tiles.
 *  Gentle by design: no red, no "you missed", a goal with nothing yet reads "0/3". */
export function NudgeCard({ personId, readings, canLog, onAdd }: { personId: string; readings: Reading[]; canLog: boolean; onAdd: (code: 'bp' | 'fasting_glucose') => void }) {
  const meds = useMedications(personId)
  const [rows, setRows] = useState<{ takes: MedTaken[]; activity: Activity[]; food: FoodEntry[]; water: WaterEntry[] }>({ takes: [], activity: [], food: [], water: [] })
  useEffect(() => {
    if (!personId) return setRows({ takes: [], activity: [], food: [], water: [] })
    const since = new Date(Date.now() - SINCE_DAYS * 86_400_000).toISOString()
    const sub = liveQuery(async () => ({
      takes: await ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray(),
      activity: await ldb.activity.where('personId').equals(personId).filter((a) => a.startedAt >= since).toArray(),
      food: await ldb.food.where('personId').equals(personId).filter((f) => f.eatenAt >= since).toArray(),
      water: await ldb.water.where('personId').equals(personId).filter((w) => w.drunkAt >= since).toArray()
    })).subscribe({ next: setRows, error: () => undefined })
    return () => sub.unsubscribe()
  }, [personId])
  const nudge = useMemo(() => computeNudge({ personId, readings, meds, now: new Date(), ...rows }), [personId, readings, meds, rows])
  const { next, streak, goals, allMet, loggedToday } = nudge
  const button = (g: Goal, primary: boolean) => {
    if (!canLog) return null
    const cls = primary ? 'nd-btn' : 'nd-btn2'
    return g.cta.sheet
      ? <button type="button" className={cls} data-goal={g.id} onClick={() => onAdd(g.cta.sheet!)}>{g.cta.label}</button>
      : <a className={cls} data-goal={g.id} href={g.cta.href}>{g.cta.label}</a>
  }
  const head = allMet ? 'Great week. You are on top of it.' : next ? next.step : 'Nice. Everything for this week is done.'
  const streakLine = streak == null
    ? 'Log anything today to start your streak.'
    : `${streak >= 30 ? '30+' : streak} ${streak === 1 ? 'day' : 'days'} in a row${loggedToday ? '' : '. Log something today to keep it going'}.`
  return (
    <section className="card nd" aria-labelledby="nd-h" data-testid="nudge" data-all-met={allMet ? 'true' : 'false'}>
      <div className="nd-top">
        <span className="nd-flame"><Icon name="flame" size={28} /></span>
        <div className="grow">
          <h2 className="nd-h" id="nd-h">{head}</h2>
          <p className="sub nd-streak" data-testid="nudge-streak">{streakLine}</p>
        </div>
      </div>
      <ul className="nd-rings" aria-label="This week">
        {goals.map((g) => (
          <li key={g.id} className={`nd-goal${g.met ? ' met' : ''}`} data-goal={g.id}>
            <Ring g={g} />
            <b>{g.label}</b>
            <span className="nd-t">{g.met ? 'Done' : g.text}</span>
          </li>
        ))}
      </ul>
      {allMet && <p className="nd-cheer" role="status"><span className="nd-spark" aria-hidden="true" /> Every goal met. Rest well, you earned it.</p>}
      {!allMet && next && button(next, true)}
      {!allMet && next && canLog && goals.some((g) => g.id !== next.id && !g.met && g.cta.sheet) && (
        <div className="nd-more">{goals.filter((g) => g.id !== next.id && !g.met && g.cta.sheet).map((g) => <span key={g.id}>{button(g, false)}</span>)}</div>
      )}
    </section>
  )
}
