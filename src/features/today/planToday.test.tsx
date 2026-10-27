import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayKey } from '../family/events'

const m = vi.hoisted(() => ({ tasks: [] as unknown[], events: [] as unknown[] }))
vi.mock('../family/usePlan', () => ({ usePlan: () => ({ tasks: m.tasks, events: m.events }) }))
vi.mock('../family/tasks', () => ({ toggleTask: vi.fn(async () => undefined) }))

import PlanToday from './PlanToday'
afterEach(cleanup)

describe('PlanToday (S5)', () => {
  it('draws no card and no filler when nothing is planned today', () => {
    m.tasks = []; m.events = []
    const { container } = render(<PlanToday />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText(/Nothing planned/)).toBeNull()
  })
  it('a task for another day is not planned today either', () => {
    m.tasks = [{ clientId: 't1', title: 'Next week', due: '2999-01-01', done: false, assigneePersonId: null }]; m.events = []
    const { container } = render(<PlanToday />)
    expect(container.firstChild).toBeNull()
  })
  it('a task due today draws the card with "0 of 1 tasks done"', () => {
    m.tasks = [{ clientId: 't1', title: 'Pay the water bill', due: dayKey(new Date()), done: false, assigneePersonId: null }]; m.events = []
    render(<PlanToday />)
    expect(screen.getByRole('heading', { name: "Today's plan" })).toBeTruthy()
    expect(screen.getByText('0 of 1')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Pay the water bill' })).toBeTruthy()
  })
})
