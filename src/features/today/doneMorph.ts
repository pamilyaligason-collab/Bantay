/** Dose card done-morph (session 13): the button shows "Taken h:mm" for MORPH_MS, then the card collapses (COLLAPSE_MS, or a FADE_MS cross-fade under reduced motion). */
export const MORPH_MS = 600
export const COLLAPSE_MS = 240
export const FADE_MS = 150

export const takenLabel = (d: Date) => `Taken ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
export const leaveMs = (reduced: boolean) => (reduced ? FADE_MS : COLLAPSE_MS)
