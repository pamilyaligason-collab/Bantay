import { blank, fdb, newClientId, removeRow, saveRow, type FamilyTask } from './store'

/** A reminder time as "HH:MM", or null for anything else (the server CHECK, migration 0061). */
export const cleanClock = (s: string | null | undefined): string | null => (s && /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null)

/** Add a family task. Local first, synced later. Returns null when the title is empty (nothing is saved). Exported for the assistant (W6). A reminder time only counts with a due day. */
export async function addTask(t: { title: string; due?: string | null; assigneePersonId?: string | null; remindAt?: string | null }): Promise<FamilyTask | null> {
  const title = blank(t.title)?.slice(0, 200) // the server CHECK allows 1..200
  if (!title) return null
  const due = blank(t.due)
  return saveRow<FamilyTask>('family_tasks', { clientId: newClientId(), title, due, assigneePersonId: t.assigneePersonId || null, done: false, remindAt: due ? cleanClock(t.remindAt) : null })
}

export const saveTask = (t: FamilyTask) => {
  const due = blank(t.due)
  return saveRow<FamilyTask>('family_tasks', { ...t, title: blank(t.title) ?? t.title, due, assigneePersonId: t.assigneePersonId || null, remindAt: due ? cleanClock(t.remindAt) : null })
}
export const toggleTask = (t: FamilyTask) => saveTask({ ...t, done: !t.done })
export const removeTask = (t: FamilyTask) => removeRow('family_tasks', t)
export const allTasks = () => fdb.tasks.toArray()

/** Open tasks first (soonest due, undated last), then done ones. */
export const sortTasks = (list: FamilyTask[]) =>
  [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title))
