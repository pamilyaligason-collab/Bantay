import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let acting = false
const act = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../health/useHealthPerson', () => ({ useHealthPerson: () => ({ personId: 'p1' }) }))
vi.mock('../health/useActivity', () => ({ useActivity: () => act.rows }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting, personId: acting ? 'm' : null, name: 'Mama' }) }))
vi.mock('./MovePanel', () => ({ default: ({ lockLog }: { lockLog?: string }) => <p data-testid="panel">{lockLog ?? 'free'}</p> }))

import MoveScreen, { MOVE_LOCK } from './MoveScreen'

afterEach(cleanup)

describe('MoveScreen header and Steps (v13)', () => {
  it('titles Move and food with a Health back link and wraps the panel as the one hero', () => {
    acting = false
    act.rows = []
    const { container } = render(<MoveScreen />)
    expect(screen.getByRole('heading', { level: 1, name: 'Move and food' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
    expect(container.querySelectorAll('[data-hero]')).toHaveLength(1)
    expect(container.querySelector('[data-hero]')!.contains(screen.getByTestId('panel'))).toBe(true)
  })
  it('Steps row: Not connected with no step data, else the steps today', () => {
    acting = false
    act.rows = []
    const { unmount } = render(<MoveScreen />)
    const row = () => screen.getByTestId('steps-door')
    expect(row().querySelector('a')!.getAttribute('href')).toBe('#health/metric/steps')
    expect(row().textContent).toContain('Not connected')
    unmount()
    act.rows = [{ kind: 'steps', steps: 4200, startedAt: new Date().toISOString() }]
    render(<MoveScreen />)
    expect(row().textContent).toContain('4,200 steps today')
  })
})

describe('MoveScreen (move logs are yours only, M2-2)', () => {
  it('not acting: the panel is free to log, and Food and salt is one row below', () => {
    acting = false
    render(<MoveScreen />)
    expect(screen.getByTestId('panel').textContent).toBe('free')
    expect(screen.getByTestId('food-door').querySelector('a')?.getAttribute('href')).toBe('#health/nutrition')
  })
  it('acting: the panel is told to lock its log button with the plain reason', () => {
    acting = true
    render(<MoveScreen />)
    expect(screen.getByTestId('panel').textContent).toBe('Move logs are yours only. Exit to log.')
    expect(MOVE_LOCK).toBe('Move logs are yours only. Exit to log.')
  })
})
