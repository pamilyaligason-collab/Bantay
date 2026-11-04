import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const day = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(12, 0, 0, 0); return d.toISOString() }
const entry = (back: number, sodiumMg: number | null) => ({ eatenAt: day(back), sodiumMg, personId: 'p1', name: 'x', key: `${back}${sodiumMg}` })
const food = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('./hooks', () => ({ useFood: () => food.rows, useWater: () => [], useGoal: () => ({ sodiumMg: 2000, waterMl: 1500 }) }))
vi.mock('./PlateSheet', () => ({ default: () => <p>plate</p> }))
vi.mock('./WaterPanel', () => ({ default: ({ canAdd }: { canAdd?: boolean }) => <p data-testid="water-stub" data-can-add={String(canAdd)}>water</p> }))
vi.mock('./SaltSummary', () => ({ SaltSummary: () => <p>salt today</p> }))

import { FoodBlock } from './MoveFoodRows'

afterEach(cleanup)

describe('FoodBlock (Move and food, board Food block)', () => {
  it('Log a meal and Add water exist only when the viewer may log for this person', () => {
    food.rows = []
    const { unmount } = render(<FoodBlock personId="p1" canMark />)
    expect(screen.getByRole('button', { name: 'Log a meal' })).toBeTruthy()
    expect(screen.getByTestId('water-stub').getAttribute('data-can-add')).toBe('true')
    unmount()
    render(<FoodBlock personId="p1" canMark={false} />)
    expect(screen.queryByRole('button', { name: 'Log a meal' })).toBeNull()
    expect(screen.getByTestId('water-stub').getAttribute('data-can-add')).toBe('false')
  })

  it('Salt, last 7 days keeps three states apart: no meals, meals with no salt number, measured (partial flagged)', () => {
    food.rows = [entry(0, 1200), entry(2, null), entry(3, 800), entry(3, null)]
    render(<FoodBlock personId="p1" canMark />)
    const bars = Array.from(screen.getByTestId('salt-week').querySelectorAll('.mf-bars > span > i:not(.mf-limit)'))
    expect(bars).toHaveLength(7)
    // index 6 = today ... index 0 = 6 days ago
    expect(bars.map((b) => b.getAttribute('data-state'))).toEqual(['none', 'none', 'none', 'partial', 'nonum', 'none', 'measured'])
    // measured today 1200 of a 2300 top (limit 2000 x 1.15): 1200 / 2300 * 84 = 43.8 -> 44 px
    expect((bars[6] as HTMLElement).style.height).toBe('44px')
    // a day with no meals is a 4 px outline stub, never a zero-height measured bar
    const label = screen.getByTestId('salt-week').querySelector('[role=img]')!.getAttribute('aria-label')!
    expect(label).toContain('meals logged, no salt numbers')
    expect(label).toContain('800 mg, some foods have no salt number')
    expect(label).toContain('nothing logged')
  })

  it('no card at all when no meal was logged in the last 7 days', () => {
    food.rows = []
    render(<FoodBlock personId="p1" canMark />)
    expect(screen.queryByTestId('salt-week')).toBeNull()
  })
})
