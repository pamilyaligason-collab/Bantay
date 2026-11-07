import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type FoodEntry, type NutritionGoal, type WaterEntry } from '../log/store'
import { liveMedicines } from '../health/meds'
import { useMedications } from '../health/useMedications'
import { useTakenToday } from '../health/useActivity'
import { goalOf, DEFAULT_GOAL } from './logic'
import { waterGoal, type WaterSource } from './waterGoal'
import { hdb } from '../records/store'
import { useProfile } from '../setup/useProfile'
import { ageFrom } from '../exercise/data'
import { supplementItems, type SuppItem } from './supplements'

const NO_FOOD: FoodEntry[] = []
export const NO_WATER: WaterEntry[] = [] // useWater's state before its first query answers (every answer is a new array)

/** One person's meals from the last `days` days, live. */
export function useFood(personId: string, days = 8): FoodEntry[] {
  const [rows, setRows] = useState(NO_FOOD)
  useEffect(() => {
    if (!personId) return setRows(NO_FOOD)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.food.where('personId').equals(personId).filter((e) => e.eatenAt >= since).toArray()).subscribe({ next: setRows, error: () => setRows(NO_FOOD) })
    return () => sub.unsubscribe()
  }, [personId, days])
  return rows
}

/** One person's glasses of water from the last `days` days, live. */
export function useWater(personId: string, days = 2): WaterEntry[] {
  const [rows, setRows] = useState(NO_WATER)
  useEffect(() => {
    if (!personId) return setRows(NO_WATER)
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.water.where('personId').equals(personId).filter((e) => e.drunkAt >= since).toArray()).subscribe({ next: setRows, error: () => setRows(NO_WATER) })
    return () => sub.unsubscribe()
  }, [personId, days])
  return rows
}

/** The latest weight in kg (a reading with no unit or kg) from the last 12 months, live; null when none. */
function useWeightKg(personId: string): number | null {
  const [kg, setKg] = useState<number | null>(null)
  useEffect(() => {
    if (!personId) return setKg(null)
    const since = new Date(Date.now() - 365 * 86_400_000).toISOString() // a weight over 12 months old is stale: fall back to the sex default
    const sub = liveQuery(() => hdb.readings.where('personId').equals(personId).filter((r) => r.takenAt >= since && r.test === 'weight' && (!r.unit || /^kgs?$/i.test(r.unit.trim()))).toArray())
      .subscribe({ next: (rows) => setKg([...rows].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.value ?? null), error: () => setKg(null) })
    return () => sub.unsubscribe()
  }, [personId])
  return kg
}

/** The person's limits, live. D-144: the water goal fits the person (age, sex, weight; see waterGoal.ts); a saved water goal other than the old 1500 ml default still wins. `waterSource` says where it came from. */
export function useGoal(personId: string): Omit<ReturnType<typeof goalOf>, 'waterMl'> & { waterMl: number | null; waterSource: WaterSource | 'saved' | 'none' } {
  const [g, setG] = useState<NutritionGoal | undefined>()
  useEffect(() => {
    if (!personId) return setG(undefined)
    const sub = liveQuery(() => ldb.goals.get(personId)).subscribe({ next: setG, error: () => setG(undefined) })
    return () => sub.unsubscribe()
  }, [personId])
  const birthdate = useProfile(personId)?.birthdate
  const weightKg = useWeightKg(personId)
  return useMemo(() => {
    const base = goalOf(g)
    const age = ageFrom(birthdate)
    if (age != null && age < 1) return { ...base, waterMl: null, waterSource: 'none' as const } // D-144: no water goal under 1 year, even a saved one
    // 1500 is what every goal row carried before D-144 (the default), so it means "not chosen", not an override
    if (base.waterMl !== DEFAULT_GOAL.waterMl) return { ...base, waterSource: 'saved' as const }
    const w = waterGoal({ ageYears: age, sex: base.sex, weightKg })! // age >= 1 or unknown here, so never null
    return { ...base, waterMl: w.ml, waterSource: w.source }
  }, [g, birthdate, weightKg])
}

/** The supplements among this person's live medicines, with today's takes (see supplements.ts). */
export function useSupplements(personId: string): SuppItem[] {
  const meds = useMedications(personId)
  const takes = useTakenToday(personId) as { name: string; medicationId?: string }[]
  return useMemo(() => supplementItems(liveMedicines(meds, personId), takes), [meds, takes, personId])
}
