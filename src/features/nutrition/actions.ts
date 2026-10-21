import { enqueue } from '../../db'
import { track } from '../admin/events'
import { ldb, type FoodEntry, type Meal, type WaterEntry } from '../log/store'
import { selfIdOrCached } from '../sync/profile'
import type { LogResult } from '../today/actions'
import { copyMeal, dayKey, ML_PER_TAP, snapshot, type Food } from './logic'

// Writes behind the Plate sheet and the water button. Local first, then one outbox upsert per row (migration 0024).
// PRIVACY (B-7): the only usage events are the fixed names meal_logged, water_logged and salt_goal_set. A food name is never sent as an event.

const newId = () => crypto.randomUUID()

/** The local Dexie id must not travel (sync would take it for a local row to stamp); client_id is the key. */
const send = (table: 'food_entries' | 'water_entries', row: { id?: number; clientId: string }, deletedAt: string | null) => {
  const { id: _local, ...rest } = row
  return enqueue(table, 'upsert', { ...rest, client_id: row.clientId, deletedAt })
}

async function asSelf(fn: (personId: string) => Promise<unknown>): Promise<LogResult> {
  try {
    const id = await selfIdOrCached()
    if (!id) return 'signedout'
    await fn(id)
    return 'ok'
  } catch {
    return 'failed'
  }
}

async function addFood(e: FoodEntry) {
  const id = await ldb.food.add(e)
  await send('food_entries', e, null)
  return id
}

/** Log one or more foods (each with a portion) for the signed-in person. One meal_logged event per plate. */
export const logPlate = (items: { food: Food; portion: number }[], meal: Meal, now = new Date()) =>
  asSelf(async (personId) => {
    for (const { food, portion } of items) await addFood(snapshot(food, portion, meal, personId, now, newId()))
    void track('action', 'meal_logged')
  })

/** "Same as yesterday": copy what this person ate at `meal` yesterday. Returns how many rows were added (0 when yesterday had none). */
export async function logSameAsYesterday(meal: Meal, now = new Date()): Promise<{ result: LogResult; added: number }> {
  let added = 0
  const result = await asSelf(async (personId) => {
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString()
    const rows = await ldb.food.where('personId').equals(personId).filter((e) => e.eatenAt >= since).toArray()
    const copies = copyMeal(rows, meal, now, newId)
    for (const c of copies) await addFood(c)
    added = copies.length
    if (added) void track('action', 'meal_logged')
  })
  return { result, added }
}

/** Remove a logged food (a soft delete on the server so other phones drop it too). */
export async function removeFood(e: FoodEntry): Promise<void> {
  if (e.id != null) await ldb.food.delete(e.id)
  else await ldb.food.where('clientId').equals(e.clientId).delete()
  await send('food_entries', e, new Date().toISOString())
}

/** One tap of water: 250 ml by default. */
export const logWater = (ml = ML_PER_TAP, now = new Date()) =>
  asSelf(async (personId) => {
    const row: WaterEntry = { clientId: newId(), personId, drunkAt: now.toISOString(), ml }
    await ldb.water.add(row)
    await send('water_entries', row, null)
    void track('action', 'water_logged')
  })

/** Undo the latest glass logged today by this person. */
export const undoWater = (now = new Date()) =>
  asSelf(async (personId) => {
    const today = dayKey(now)
    const last = (await ldb.water.where('personId').equals(personId).filter((w) => dayKey(w.drunkAt) === today).toArray()).sort((a, b) => b.drunkAt.localeCompare(a.drunkAt))[0]
    if (!last) return
    await ldb.water.delete(last.id!)
    await send('water_entries', last, new Date().toISOString())
  })

/** Save a person's salt and water limits. Anyone who may write for the person (self, writer carer) can call this; the server decides. */
export async function saveGoal(personId: string, patch: { sodiumMg?: number; waterMl?: number }): Promise<LogResult> {
  try {
    const cur = await ldb.goals.get(personId)
    const goal = { personId, sodiumMg: patch.sodiumMg ?? cur?.sodiumMg ?? 2000, waterMl: patch.waterMl ?? cur?.waterMl ?? 1500 }
    await ldb.goals.put(goal)
    await enqueue('nutrition_goals', 'upsert', goal)
    void track('action', 'salt_goal_set')
    return 'ok'
  } catch {
    return 'failed'
  }
}
