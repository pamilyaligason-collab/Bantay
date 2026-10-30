import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

let acting = false
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting, personId: acting ? 'm' : null, name: 'Mama' }) }))
vi.mock('./MovePanel', () => ({ default: ({ lockLog }: { lockLog?: string }) => <p data-testid="panel">{lockLog ?? 'free'}</p> }))

import MoveScreen, { MOVE_LOCK } from './MoveScreen'

afterEach(cleanup)

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
