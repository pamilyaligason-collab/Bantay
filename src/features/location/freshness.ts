/** S22 lane G: how old a fix may be before each part of the app acts on it. All ages are milliseconds. */
export const REFRESH_MS = 5 * 60_000 // a return to the foreground asks again at most this often
export const PRECISE_AFTER_MS = 30 * 60_000 // Weather asks for a high-accuracy fix when the stored one is older
export const OLD_NOTE_MS = 60 * 60_000 // Weather says "from N h ago" past this
export const DROP_MS = 6 * 3_600_000 // Weather treats a fix this old as no fix
export const ROUGH_M = 1000 // a fix worse than this is "around <place>"

export const shouldRefresh = (lastRun: number, now: number) => now - lastRun >= REFRESH_MS
/** Unknown age (no time stored) is never old: unknown is not a reason to drop a fix. */
export const needsPrecise = (at: number | undefined, now: number) => at != null && now - at > PRECISE_AFTER_MS
export const weatherFixState = (at: number | undefined, now: number): 'ok' | 'old' | 'drop' =>
  at == null ? 'ok' : now - at > DROP_MS ? 'drop' : now - at > OLD_NOTE_MS ? 'old' : 'ok'
export const oldFixNote = (at: number, now: number) => `Using your location from ${Math.max(1, Math.round((now - at) / 3_600_000))} h ago`
export const isRough = (accuracy: number | undefined) => accuracy != null && accuracy > ROUGH_M
