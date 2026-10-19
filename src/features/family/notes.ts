import { blank, fdb, newClientId, removeRow, saveRow, type FamilyNote } from './store'

export async function addNote(n: { body: string; pinned?: boolean }): Promise<FamilyNote | null> {
  const body = blank(n.body)
  if (!body) return null
  return saveRow<FamilyNote>('family_notes', { clientId: newClientId(), body, pinned: !!n.pinned })
}
export const saveNote = (n: FamilyNote) => saveRow<FamilyNote>('family_notes', { ...n, body: blank(n.body) ?? n.body })
export const removeNote = (n: FamilyNote) => removeRow('family_notes', n)
export const allNotes = () => fdb.notes.toArray()
/** Pinned first, then as added. */
export const sortNotes = (list: FamilyNote[]) => [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.id ?? 0) - (b.id ?? 0))
