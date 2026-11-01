import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beatMs, CPR_BPM, cueOf, metronome } from './cprBeat'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('cpr beat', () => {
  it('is 110 per minute', () => {
    expect(CPR_BPM).toBe(110)
    expect(beatMs(110)).toBe(545)
  })
  it('fires 11 beats in 6 s and stop() stops it', () => {
    const f = vi.fn()
    const stop = metronome(f, 110)
    vi.advanceTimersByTime(6000)
    expect(f).toHaveBeenCalledTimes(11)
    stop()
    vi.advanceTimersByTime(3000)
    expect(f).toHaveBeenCalledTimes(11)
  })
  it('every beat flashes the dot, reduced motion or not, and click and buzz stay', () => {
    expect(cueOf({ reduced: false })).toEqual({ pulse: true, click: true, buzz: true })
    expect(cueOf({ reduced: true })).toEqual({ pulse: true, click: true, buzz: true })
  })
})
