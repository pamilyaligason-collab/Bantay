import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let acting = false
const who = vi.hoisted(() => ({ personId: 'p1' }))
const act = vi.hoisted(() => ({ rows: [] as unknown[], asked: [] as unknown[] }))
vi.mock('../health/useHealthPerson', () => ({ useHealthPerson: () => ({ personId: who.personId, ownId: 'p1', ready: true, people: [{ id: 'p1', name: 'Me Self' }, { id: 'other', name: 'Ana Reyes' }] }) }))
vi.mock('../health/useActivity', () => ({ useActivity: (id: unknown) => (act.asked.push(id), act.rows) }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting, personId: acting ? 'm' : null, name: 'Mama' }) }))
vi.mock('../nutrition/MoveFoodRows', () => ({ FoodBlock: () => <p data-testid="saltwater">rows</p> }))
vi.mock('./MovePanel', () => ({ default: ({ lockLog, hideRing }: { lockLog?: string; hideRing?: boolean }) => <p data-testid="panel" data-ring={hideRing ? 'off' : 'on'}>{lockLog ?? 'free'}</p> }))

import MoveScreen from './MoveScreen'
import { MOVE_LOCK } from './recommend'

afterEach(() => { cleanup(); who.personId = 'p1' })

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

describe('MoveScreen steps from an earlier day', () => {
  it('steps from 2 days ago read "4,200 on <day>", never 0 today', () => {
    acting = false
    act.rows = [{ kind: 'steps', steps: 4200, startedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }]
    render(<MoveScreen />)
    expect(screen.getByTestId('steps-door').textContent).toMatch(/4,200 on (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)
    expect(screen.getByTestId('saltwater')).toBeTruthy()
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
  it('Steps reads your own steps, not the shared person choice (1.H15)', () => {
    acting = false
    act.asked = []
    render(<MoveScreen />)
    expect(act.asked.length).toBeGreaterThan(0)
    expect(new Set(act.asked)).toEqual(new Set(['p1']))
  })
})

describe('MoveScreen Steps follow the person (own only)', () => {
  it('on your own page Steps shows, with the Me label', () => {
    act.rows = []
    render(<MoveScreen />)
    expect(screen.getByTestId('steps-door')).toBeTruthy()
    expect(screen.getByTestId('who-line').textContent).toBe('Me')
  })
  it('on another person Steps is hidden and the label names them', () => {
    who.personId = 'other'
    act.rows = [{ kind: 'steps', steps: 4200, startedAt: new Date().toISOString() }]
    render(<MoveScreen />)
    expect(screen.queryByTestId('steps-door')).toBeNull()
    expect(screen.getByTestId('who-line').textContent).toBe('Ana Reyes')
    expect(screen.getByTestId('saltwater')).toBeTruthy()
  })
  it('R4 the name comes before the hero; the ring (the viewer own minutes) is hidden on another person', () => {
    who.personId = 'other'
    const { container, unmount } = render(<MoveScreen />)
    const hero = container.querySelector('[data-hero]')!
    expect(screen.getByTestId('who-line').compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('panel').getAttribute('data-ring')).toBe('off')
    expect(screen.getByTestId('panel').textContent).toBe(MOVE_LOCK) // nothing logs to the wrong person
    unmount()
    who.personId = 'p1'
    render(<MoveScreen />)
    expect(screen.getByTestId('panel').getAttribute('data-ring')).toBe('on')
  })
})
