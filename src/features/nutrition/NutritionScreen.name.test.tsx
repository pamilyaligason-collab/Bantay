import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const who = vi.hoisted(() => ({ personId: 'p1' }))
vi.mock('../health/useHealthPerson', () => ({ useHealthPerson: () => ({ ready: true, personId: who.personId, ownId: 'p1', canMark: true, readings: [], people: [{ id: 'p1', name: 'Me Self' }, { id: 'p2', name: 'rey dela Cruz' }] }) }))
vi.mock('../health/WhoLine', () => ({ WhoLine: () => null }))
vi.mock('../health/MetricChart', () => ({ MetricChart: () => null }))
vi.mock('./hooks', () => ({ useFood: () => [], useWater: () => [], useGoal: () => ({ sodiumMg: 2000, waterMl: 1500, waterSource: 'default', potassiumMg: null, sex: null }) }))
vi.mock('./actions', () => ({ logWater: async () => 'ok', undoWater: async () => 'ok', removeFood: async () => undefined, saveGoal: async () => 'ok' }))
vi.mock('./PlateSheet', () => ({ default: () => null }))
vi.mock('./NutrientsToday', () => ({ default: () => null }))
vi.mock('./SaltSummary', () => ({ SaltSummary: () => null }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: false, personId: null, name: '' }) }))

import NutritionScreen from './NutritionScreen'

afterEach(() => { cleanup(); who.personId = 'p1' })

describe('NutritionScreen names the shown person in the water hint', () => {
  it('another person: the hint uses their first name', () => {
    who.personId = 'p2'
    render(<NutritionScreen />)
    expect(screen.getByRole('link', { name: /Add Rey's weight for a goal that fits Rey/ })).toBeTruthy()
  })
  it('self: the hint says your', () => {
    render(<NutritionScreen />)
    expect(screen.getByRole('link', { name: /Add your weight for a goal that fits you/ })).toBeTruthy()
  })
})
