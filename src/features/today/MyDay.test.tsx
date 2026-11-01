import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ activity: [] as { kind: string; startedAt: string }[], self: 'me' as string | null }))
vi.mock('./useNext', () => ({ useNext: () => ({ item: { kind: 'calm', key: 'calm' }, review: 0 }) }))
vi.mock('./MyWeek', () => ({ useWeekData: () => ({ readings: [] }) }))
vi.mock('../health/useActivity', () => ({ useActivity: () => m.activity }))
vi.mock('../nutrition/hooks', () => ({ useWater: () => [], useGoal: () => ({ waterMl: 1500 }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => m.self, useActingCan: () => null }))
vi.mock('./NextUp', () => ({ default: () => null, MedsCheck: () => null }))
vi.mock('./PlanToday', () => ({ default: () => null }))
vi.mock('./SelfCare', () => ({ default: () => null }))
import MyDay from './MyDay'
afterEach(cleanup)

describe('MyDay I am OK row', () => {
  it('shows the button until a check-in is logged today, then a done label', () => {
    m.activity = []
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    unmount()
    m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByRole('button', { name: "I'm OK" })).toBeNull()
    expect(screen.getByText("You're OK")).toBeTruthy()
  })
  it('signed out, the row does not promise the family will know', () => {
    m.activity = []; m.self = null
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByText('Lets the family know you are fine')).toBeNull()
    expect(screen.getByText('Sign in to let the family know')).toBeTruthy()
  })
})
