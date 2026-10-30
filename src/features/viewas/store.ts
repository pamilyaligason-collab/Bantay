// S16 C-9: the in-memory acting id and its subscribers. No imports on purpose (sync/profile.ts reads it; a cycle through viewAs.ts is not allowed). L6 adds the setter.
const acting: string | null = null // L0 stub: never acting
const subs = new Set<() => void>()
export const getActingPersonId = (): string | null => acting
export const subscribeActing = (cb: () => void): (() => void) => { subs.add(cb); return () => { subs.delete(cb) } }
