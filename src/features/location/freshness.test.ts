import { describe, expect, it } from 'vitest'
import { isRough, needsPrecise, oldFixNote, shouldRefresh, weatherFixState } from './freshness'

const MIN = 60_000
const H = 60 * MIN
describe('freshness thresholds', () => {
  it('foreground refresh is throttled to once per 5 min', () => {
    expect(shouldRefresh(0, 4 * MIN + 59_000)).toBe(false)
    expect(shouldRefresh(0, 5 * MIN)).toBe(true)
  })
  it('Weather asks precisely only when the fix is older than 30 min; unknown age is not old', () => {
    expect(needsPrecise(100 * H - 30 * MIN, 100 * H)).toBe(false)
    expect(needsPrecise(100 * H - 31 * MIN, 100 * H)).toBe(true)
    expect(needsPrecise(undefined, 100 * H)).toBe(false)
  })
  it('age states: ok to 60 min, old to 6 h, drop after', () => {
    const now = 100 * H
    expect(weatherFixState(now - 60 * MIN, now)).toBe('ok')
    expect(weatherFixState(now - 61 * MIN, now)).toBe('old')
    expect(weatherFixState(now - 6 * H, now)).toBe('old')
    expect(weatherFixState(now - 6 * H - MIN, now)).toBe('drop')
    expect(weatherFixState(undefined, now)).toBe('ok')
  })
  it('the old-fix line names whole hours, at least 1', () => {
    expect(oldFixNote(100 * H - 61 * MIN, 100 * H)).toBe('Using your location from 1 h ago')
    expect(oldFixNote(100 * H - 3 * H, 100 * H)).toBe('Using your location from 3 h ago')
  })
  it('rough means worse than 1000 m; missing accuracy is not rough', () => {
    expect(isRough(1000)).toBe(false)
    expect(isRough(1001)).toBe(true)
    expect(isRough(undefined)).toBe(false)
  })
})
