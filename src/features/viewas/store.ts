// S16 C-9: the in-memory acting state and its subscribers. No imports on purpose (sync/profile.ts reads it; a cycle through viewAs.ts is not allowed).
// Memory only, never Dexie or localStorage: a cold start, sign-out and Exit all leave it null (D-99).
export type ActingCan = { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null }
export type ActingState = { personId: string; name: string; can: ActingCan }

let state: ActingState | null = null
const subs = new Set<() => void>()
let epoch = 0 // bumped on every change so an enter that was awaiting the audit RPC can tell it was cancelled

export const getActingPersonId = (): string | null => state?.personId ?? null
export const getActingState = (): ActingState | null => state
export const actingEpoch = (): number => epoch
export function setActing(next: ActingState | null): void {
  state = next
  epoch++
  for (const cb of [...subs]) cb()
}
export const subscribeActing = (cb: () => void): (() => void) => { subs.add(cb); return () => { subs.delete(cb) } }
