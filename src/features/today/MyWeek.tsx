import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { Reading } from '../health/ranges'
import { bpDoctorOf, type BpArg } from '../health/verdict'
import { ldb, type MedTaken } from '../log/store'
import { hdb } from '../records/store'
import { DAYS } from './myWeekLogic'

const NO_READINGS: Reading[] = [] // the state before the first query answers; every answer is a new array
const NO_TAKES: MedTaken[] = []

/** This person's readings and dose takes from the last 7 days (plus a day of slack for time zones), live. */
export function useWeekData(personId: string) {
  const [readings, setReadings] = useState(NO_READINGS)
  const [takes, setTakes] = useState(NO_TAKES)
  const [doctor, setDoctor] = useState<BpArg['doctor']>()
  useEffect(() => {
    if (!personId) { setReadings(NO_READINGS); setTakes(NO_TAKES); setDoctor(undefined); return }
    const since = new Date(Date.now() - (DAYS + 1) * 86_400_000).toISOString()
    const a = liveQuery(() => hdb.readings.where('personId').equals(personId).filter((r) => r.takenAt >= since).toArray()).subscribe({ next: setReadings, error: () => undefined })
    const b = liveQuery(() => ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray()).subscribe({ next: setTakes, error: () => undefined })
    const c = liveQuery(() => hdb.thresholds.toArray()).subscribe({ next: (ts) => setDoctor(bpDoctorOf(ts, personId)), error: () => undefined }) // the doctor's BP targets, so the chip matches Health
    return () => { a.unsubscribe(); b.unsubscribe(); c.unsubscribe() }
  }, [personId])
  return { readings, takes, doctor, loaded: readings !== NO_READINGS }
}
