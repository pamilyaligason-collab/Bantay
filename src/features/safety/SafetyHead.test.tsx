import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SafetyHead } from './SafetyHead'

afterEach(() => cleanup())

describe('SafetyHead', () => {
  it('shows the title, kicker, actions and the Near me | World switch', () => {
    render(<SafetyHead view="near" kicker="CHECKED 6 MIN AGO" actions={<span>chip</span>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Safety' })).toBeTruthy()
    expect(screen.getByText('CHECKED 6 MIN AGO')).toBeTruthy()
    expect(screen.getByText('chip')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Show' })
    expect(group).toBeTruthy()
    const near = screen.getByRole('link', { name: 'Near me' })
    expect(near.getAttribute('aria-current')).toBe('page')
    expect(near.getAttribute('href')).toBe('#safety')
    const world = screen.getByRole('link', { name: 'World' })
    expect(world.getAttribute('aria-current')).toBeNull()
    expect(world.getAttribute('href')).toBe('#safety/world')
  })
  it('flips the current link for the world view', () => {
    render(<SafetyHead view="world" />)
    expect(screen.getByRole('link', { name: 'World' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Near me' }).getAttribute('aria-current')).toBeNull()
  })
})
