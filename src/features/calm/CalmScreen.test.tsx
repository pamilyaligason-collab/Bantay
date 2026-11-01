// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const kv: Record<string, unknown> = {}
vi.mock('../shell/useKv', () => ({ useKv: (key: string, init: unknown) => [key in kv ? kv[key] : init, vi.fn(), true] }))
vi.mock('../today/BreathSheet', () => ({ default: () => <div role="dialog">sheet</div> }))
afterEach(() => { cleanup(); for (const k of Object.keys(kv)) delete kv[k] })

import CalmScreen from './CalmScreen'

describe('hero', () => {
  it('renders the hero first with the orb and Start', () => {
    render(<CalmScreen />)
    const hero = screen.getByTestId('calm-hero')
    expect(hero.hasAttribute('data-hero')).toBe(true)
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(hero.textContent).toMatch(/In 4, out 6/)
    expect(hero.querySelector('.bo')).not.toBeNull()
  })
  it('Start opens the breath sheet', () => {
    render(<CalmScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
  it('Gentle buzz is a switch on selfcare.buzz, on by default', () => {
    render(<CalmScreen />)
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('true')
    cleanup(); kv['selfcare.buzz'] = false; render(<CalmScreen />)
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('false')
  })
  it('says Done once today only when the log has today', () => {
    kv['selfcare.log'] = [{ at: new Date().toISOString(), pattern: 'relax', minutes: 1, mood: 3 }]
    render(<CalmScreen />)
    expect(screen.getByText('Done once today')).toBeTruthy()
    cleanup(); kv['selfcare.log'] = []; render(<CalmScreen />)
    expect(screen.getByText('Not done yet today')).toBeTruthy()
  })
})
