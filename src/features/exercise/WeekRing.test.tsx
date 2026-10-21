import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeekRing } from './MovePanel'

const base = { minutes: 0, goalMinutes: 150, strengthDays: 0, goalDays: 2, doneIds: [] as string[] }
describe('WeekRing', () => {
  it('at zero hides the percent and invites one move', () => {
    render(<WeekRing {...base} pct={0} />)
    expect(screen.getByText('Start with one move today')).toBeTruthy()
    expect(screen.queryByText('0%')).toBeNull()
  })
  it('shows the percent once there is progress', () => {
    render(<WeekRing {...base} minutes={30} pct={20} />)
    expect(screen.getByText('20%')).toBeTruthy()
  })
})
