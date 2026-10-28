import { describe, expect, it } from 'vitest'
import type { FoodEntry } from '../log/store'
import { saltLineText } from './SaltSummary'

const food = (o: Partial<FoodEntry> = {}): FoodEntry => ({
  clientId: 'c', personId: 'me', eatenAt: '2026-10-28T08:00:00+08:00', meal: 'breakfast', foodKey: null, name: 'Rice', portion: 1,
  servingLabel: null, kcal: null, sodiumMg: null, potassiumMg: null, proteinG: null, ...o
})

describe('Today salt line text', () => {
  it('adds the known sodium of today (hand-computed 800 + 500 = 1,300) against the goal', () => {
    expect(saltLineText([food({ sodiumMg: 800 }), food({ clientId: 'd', sodiumMg: 500 }), food({ clientId: 'e', sodiumMg: null })], 2000)).toBe('Salt 1,300 of 2,000 mg today')
  })
  it('nothing logged says so', () => {
    expect(saltLineText([], 2000)).toBe('Salt: nothing logged yet today')
  })
  it('meals logged but every sodium unknown does not claim nothing was logged, and is never a 0', () => {
    const t = saltLineText([food(), food({ clientId: 'd' })], 2000)
    expect(t).toBe("Salt: not known for today's meals")
    expect(t).not.toMatch(/\b0\b/)
  })
})
