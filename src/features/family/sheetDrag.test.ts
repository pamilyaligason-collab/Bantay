import { describe, expect, it } from 'vitest'
import { dragOffset, projectRelease, rubberband, shouldDismiss, velocityOf } from './sheetDrag'

describe('sheet drag maths', () => {
  it('projectRelease is v*d/(1-d)', () => {
    expect(projectRelease(1)).toBeCloseTo(99, 6)
    expect(projectRelease(0.5, 0.9)).toBeCloseTo(4.5, 6)
    expect(projectRelease(0)).toBe(0)
    expect(projectRelease(-0.2)).toBeCloseTo(-19.8, 6)
  })
  it('rubberband: zero at the edge, below the pull, never past the height', () => {
    expect(rubberband(0, 400)).toBe(0)
    expect(rubberband(-5, 400)).toBe(0)
    expect(rubberband(100, 0)).toBe(0)
    expect(rubberband(100, 400)).toBeCloseTo(48.35, 1) // (1 - 1/1.1375) * 400
    expect(rubberband(100000, 400)).toBeLessThan(400)
  })
  it('dragOffset follows the finger down and resists up', () => {
    expect(dragOffset(120, 400)).toBe(120)
    expect(dragOffset(0, 400)).toBe(0)
    expect(dragOffset(-100, 400)).toBeCloseTo(-48.35, 1)
  })
  it('velocityOf uses the last 100 ms only', () => {
    expect(velocityOf([])).toBe(0)
    expect(velocityOf([{ y: 0, t: 0 }])).toBe(0)
    // at t=250 the first sample within 100 ms is t=200 (y 530): (560 - 530) / 50
    expect(velocityOf([{ y: 0, t: 0 }, { y: 500, t: 50 }, { y: 530, t: 200 }, { y: 560, t: 250 }])).toBeCloseTo(0.6, 6)
    expect(velocityOf([{ y: 100, t: 10 }, { y: 50, t: 60 }])).toBeCloseTo(-1, 6) // moving up
  })
  it('shouldDismiss by projection past 40% or a fast flick down', () => {
    expect(shouldDismiss(100, 0, 400)).toBe(false) // 100 < 160
    expect(shouldDismiss(161, 0, 400)).toBe(true)
    expect(shouldDismiss(100, 0.4, 400)).toBe(false) // 100 + 39.6 = 139.6 < 160
    expect(shouldDismiss(130, 0.4, 400)).toBe(true) // 130 + 39.6 = 169.6 > 160
    expect(shouldDismiss(10, 0.6, 400)).toBe(true) // fast flick alone
    expect(shouldDismiss(190, -0.4, 400)).toBe(false) // thrown back up: 190 - 39.6 = 150.4 < 160
  })
})
