import { blank, fdb, newClientId, removeRow, saveRow, type FamilyTask } from './store'

/** Add a family task. Local first, synced later. Returns null when the title is empty (nothing is saved). Exported for the assistant (W6). */
export async function addTask(t: { title: string; due?: string | null; assigneePersonId?: string | null }): Promise<FamilyTask | null> {
  const title = blank(t.title)?.slice(0, 200) // the server CHECK allows 1..200
  if (!title) return null
  return saveRow<FamilyTask>('family_tasks', { clientId: newClientId(), title, due: blank(t.due), assigneePersonId: t.assigneePersonId || null, done: false })
}

export const saveTask = (t: FamilyTask) => saveRow<FamilyTask>('family_tasks', { ...t, title: blank(t.title) ?? t.title, due: blank(t.due), assigneePersonId: t.assigneePersonId || null })
export const toggleTask = (t: FamilyTask) => saveTask({ ...t, done: !t.done })
export const removeTask = (t: FamilyTask) => removeRow('family_tasks', t)
export const allTasks = () => fdb.tasks.toArray()

/** Open tasks first (soonest due, undated last), then done ones. */
export const sortTasks = (list: FamilyTask[]) =>
  [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title))
