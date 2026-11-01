export const CPR_BPM = 110
export const beatMs = (bpm: number) => Math.round(60000 / bpm)

/** Calls onBeat every beat until the returned stop() runs. The caller fires the first beat itself on Start. */
export function metronome(onBeat: () => void, bpm: number = CPR_BPM): () => void {
  const id = setInterval(onBeat, beatMs(bpm))
  return () => clearInterval(id)
}

/** What each beat does. Every beat flashes the dot for 150 ms; reduced motion only drops the scale (CSS), so the dot never looks like half the rate. Click and buzz stay. */
export const cueOf = (_o?: { reduced: boolean }) => ({ pulse: true as const, click: true, buzz: true })

/** A 40 ms 880 Hz click. Create it from the Start tap (browsers block audio before a gesture); null where WebAudio is missing. */
export function makeClick(): (() => void) | null {
  const Ctx = typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  try {
    const ctx = new Ctx()
    return () => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880; g.gain.value = 0.2
      o.connect(g); g.connect(ctx.destination)
      o.start(); o.stop(ctx.currentTime + 0.04)
    }
  } catch { return null }
}
