export type CelebrationKind = 'streak' | 'goal' | 'allDone'

export const CELEBRATE_GAP_MS = 10 * 60 * 1000

/** At most one allow per key per gap. In-memory only: a reload resets it (ponytail: persist if that proves noisy). */
export function makeLimiter(gapMs: number, now: () => number = Date.now) {
  const last = new Map<string, number>()
  return (key: string): boolean => {
    const t = now()
    const prev = last.get(key)
    if (prev !== undefined && t - prev < gapMs) return false
    last.set(key, t)
    return true
  }
}

const allow = makeLimiter(CELEBRATE_GAP_MS)

/** Gentle confetti, once per 10 minutes per kind. Returns true when it fired. */
export function celebrate(kind: CelebrationKind): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (!allow(kind)) return false
  void import('canvas-confetti').then(({ default: confetti }) =>
    confetti({ particleCount: 40, spread: 60, startVelocity: 25, scalar: 0.8, origin: { y: 0.7 }, disableForReducedMotion: true })
  )
  return true
}
