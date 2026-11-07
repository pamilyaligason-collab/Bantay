import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { useGoal } from './hooks'

const profile = (birthdate: string | null) => ({ id: 'p1', birthdate, photoPath: null, phone: null, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null })
const reading = (value: number, takenAt: string, unit = 'kg') => ({ personId: 'p1', test: 'weight', value, unit, takenAt, clientId: `w${takenAt}` })

beforeEach(async () => { await Promise.all([db.profiles.clear(), ldb.goals.clear(), hdb.readings.clear()]) })
afterEach(() => Promise.resolve())

describe('useGoal water goal (D-144)', () => {
  it('nothing known: 1800 ml, and the add-weight source', async () => {
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterSource).toBe('default'))
    expect(result.current.waterMl).toBe(1800)
  })
  it('sex from the goal row picks 1600 for women', async () => {
    await ldb.goals.put({ personId: 'p1', sodiumMg: 2000, waterMl: 1500, sex: 'female' })
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterMl).toBe(1600))
    expect(result.current.waterSource).toBe('sex')
  })
  it('the latest weight in kg wins: 80 kg is 2400 ml; a pound reading is ignored', async () => {
    await hdb.readings.bulkAdd([reading(50, '2026-10-01T08:00:00Z'), reading(80, '2026-11-01T08:00:00Z'), reading(300, '2026-11-05T08:00:00Z', 'lb')])
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterMl).toBe(2400))
    expect(result.current.waterSource).toBe('weight')
  })
  it('a child from the profile birthdate uses the child value', async () => {
    const y = new Date().getFullYear() - 6
    await db.profiles.put(profile(`${y}-01-01`))
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterSource).toBe('child'))
    expect(result.current.waterMl).toBe(1280)
  })
  it('a saved water goal other than the old 1500 default stays as chosen', async () => {
    await ldb.goals.put({ personId: 'p1', sodiumMg: 2000, waterMl: 2200, sex: 'male' })
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterSource).toBe('saved'))
    expect(result.current.waterMl).toBe(2200)
  })
  it('a baby under 1 year has no water goal, even with a saved one', async () => {
    const y = new Date().getFullYear()
    await db.profiles.put(profile(`${y}-01-01`))
    await ldb.goals.put({ personId: 'p1', sodiumMg: 2000, waterMl: 2200, sex: 'male' })
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterSource).toBe('none'))
    expect(result.current.waterMl).toBeNull()
  })
  it('a weight older than 12 months is ignored: the sex default stands', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
    await ldb.goals.put({ personId: 'p1', sodiumMg: 2000, waterMl: 1500, sex: 'female' })
    await hdb.readings.add(reading(95, old))
    const { result } = renderHook(() => useGoal('p1'))
    await waitFor(() => expect(result.current.waterSource).toBe('sex'))
    expect(result.current.waterMl).toBe(1600)
  })
})
