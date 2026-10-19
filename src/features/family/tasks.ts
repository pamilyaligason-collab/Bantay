// STUB for lane W6 only. Lane W5 owns this file: on merge, take W5's version (same exported signature).
export interface NewTask { title: string; due?: string; assigneePersonId?: string }

export async function addTask(_t: NewTask): Promise<void> {
  throw new Error('family tasks are not available yet')
}
