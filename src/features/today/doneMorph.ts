/** Dose card done-morph (session 13): the button shows "Taken h:mm" for MORPH_MS, then the card collapses (COLLAPSE_MS, or a FADE_MS cross-fade under reduced motion). */
export const MORPH_MS = 600
export const COLLAPSE_MS = 240
export const FADE_MS = 150

export const takenLabel = (d: Date) => `Taken ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
export const leaveMs = (reduced: boolean) => (reduced ? FADE_MS : COLLAPSE_MS)

/** S22 My day rows: the tick and burst play for TICK_MS, then the row slides out and collapses (ROW_OUT_MS), or cross-fades for FADE_MS under reduced motion. */
export const TICK_MS = MORPH_MS
export const ROW_OUT_MS = 440
export const rowLeaveMs = (reduced: boolean) => (reduced ? FADE_MS : ROW_OUT_MS)
