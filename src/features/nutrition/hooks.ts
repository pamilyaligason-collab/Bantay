import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type FoodEntry, type NutritionGoal, type WaterEntry } from '../log/store'
import { liveMedicines } from '../health/meds'
import { useMedications } from '../health/useMedications'
import { useTakenToday } from '../health/useActivity'
import { goalOf } from './logic'
import { supplementItems, type SuppItem } from './supplements'

const NO_FOOD: FoodEntry[] = []
const NO_WATER: WaterEntry[] = []

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

/** The person's limits (the defaults until one is saved), live. */
export function useGoal(personId: string): ReturnType<typeof goalOf> {
  const [g, setG] = useState<NutritionGoal | undefined>()
  useEffect(() => {
    if (!personId) return setG(undefined)
    const sub = liveQuery(() => ldb.goals.get(personId)).subscribe({ next: setG, error: () => setG(undefined) })
    return () => sub.unsubscribe()
  }, [personId])
  return useMemo(() => goalOf(g), [g])
}

/** The supplements among this person's live medicines, with today's takes (see supplements.ts). */
export function useSupplements(personId: string): SuppItem[] {
  const meds = useMedications(personId)
  const takes = useTakenToday(personId) as { name: string; medicationId?: string }[]
  return useMemo(() => supplementItems(liveMedicines(meds, personId), takes), [meds, takes, personId])
}
