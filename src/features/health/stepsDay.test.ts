import { describe, expect, it } from 'vitest'
import { latestSteps } from './stepsDay'

const at = (ago: number, steps: number) => ({ kind: 'steps', minutes: null, steps, startedAt: new Date(Date.now() - ago * 86_400_000).toISOString() })
describe('latestSteps', () => {
  it('today, 2 days ago (weekday) and 20 days ago (date); none is null, never 0', () => {
    expect(latestSteps([at(0, 3000), at(0, 1000)])).toMatchObject({ total: 4000, today: true, day: 'Today' })
    const two = latestSteps([at(2, 4200)])!
    expect(two.today).toBe(false)
    expect(two.day).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
    expect(latestSteps([at(20, 4200)])!.day).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
    expect(latestSteps([])).toBeNull()
  })
})
