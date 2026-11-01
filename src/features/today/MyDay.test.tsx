import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ activity: [] as { kind: string; startedAt: string }[], self: 'me' as string | null, ready: true }))
vi.mock('./useNext', () => ({ useNext: () => ({ item: { kind: 'calm', key: 'calm' }, review: 0 }) }))
vi.mock('./MyWeek', () => ({ useWeekData: () => ({ readings: [] }) }))
vi.mock('../health/useActivity', () => ({ useActivity: () => m.activity }))
vi.mock('../nutrition/hooks', () => ({ useWater: () => [], useGoal: () => ({ waterMl: 1500 }) }))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => ({ id: m.self, ready: m.ready }) }))
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
    expect(screen.getByText('Checked in')).toBeTruthy()
  })
  it("Unwell writes mood-low and check-in: the row says Checked in, never You're OK", () => {
    m.self = 'me'
    const at = new Date().toISOString()
    m.activity = [{ kind: 'mood-low', startedAt: at }, { kind: 'check-in', startedAt: at }]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByText('Checked in')).toBeTruthy()
    expect(screen.queryByText("You're OK")).toBeNull()
  })
  it("crossing midnight brings the I'm OK button back", () => {
    vi.useFakeTimers()
    try {
      m.self = 'me'
      vi.setSystemTime(new Date(2026, 5, 10, 23, 59))
      m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
      const { rerender } = render(<MyDay notify={() => undefined} />)
      expect(screen.getByText('Checked in')).toBeTruthy()
      vi.setSystemTime(new Date(2026, 5, 11, 0, 1))
      rerender(<MyDay notify={() => undefined} />)
      expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
  it('signed out, the row does not promise the family will know, and says nothing while the lookup is still running', () => {
    m.activity = []; m.self = null; m.ready = false
    const { rerender } = render(<MyDay notify={() => undefined} />)
    expect(screen.queryByText('Sign in to let the family know')).toBeNull()
    m.ready = true
    rerender(<MyDay notify={() => undefined} />)
    expect(screen.queryByText('Lets the family know you are fine')).toBeNull()
    expect(screen.getByText('Sign in to let the family know')).toBeTruthy()
  })
})
