import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

const alerts = vi.hoisted(() => ({ unseen: 0 }))
vi.mock('../notify/useAlerts', () => ({ useUnseenAlerts: () => alerts.unseen }))

beforeEach(() => { alerts.unseen = 0 })
afterEach(cleanup)

const nav = () => screen.getByRole('navigation', { name: 'Main' })

describe('TabBar: five tabs, no Ask slot', () => {
  it('lists Today, Health, Discover, Family, Safety and nothing else', () => {
    render(<TabBar active="today" />)
    expect(Array.from(nav().querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Today', 'Health', 'Discover', 'Family', 'Safety'])
    expect(screen.queryByRole('button', { name: 'Ask Bantay' })).toBeNull()
  })
  it.each([['today', 0], ['health', 1], ['discover', 2], ['family', 3], ['safety', 4]] as const)('%s: pill slot %i, that tab is the current page', (tab, slot) => {
    render(<TabBar active={tab} />)
    const n = nav()
    expect(n.style.getPropertyValue('--slot')).toBe(String(slot)) // the pill is 1/5 wide, so slot * 100% lands on tab `slot`
    expect(n.style.getPropertyValue('--pill')).toBe('1')
    const current = Array.from(n.querySelectorAll('button')).filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]!.textContent).toBe(tab[0]!.toUpperCase() + tab.slice(1))
  })
  it('a full view (Me, notifications) hides the pill and marks no tab', () => {
    render(<TabBar active={null} />)
    expect(nav().style.getPropertyValue('--pill')).toBe('0')
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(0)
  })
  it('a tab button writes its hash', () => {
    location.hash = ''
    render(<TabBar active="today" />)
    screen.getByRole('button', { name: 'Discover' }).click()
    expect(location.hash).toBe('#discover')
  })
})

describe('TabBar family badge (D-78)', () => {
  it('no badge while every alert is seen', () => {
    render(<TabBar active="today" />)
    expect(screen.queryByRole('img', { name: /new alert/ })).toBeNull()
  })
  it('a badge on the Family tab only, saying how many alerts are new', () => {
    alerts.unseen = 3
    render(<TabBar active="today" />)
    const badge = screen.getByRole('img', { name: '3 new alerts' })
    expect(badge.closest('button')!.textContent).toContain('Family')
    expect(screen.getByRole('button', { name: 'Family, 3 new alerts' })).toBe(badge.closest('button')) // the count is in the button's own name
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /new alert/ })).toHaveLength(1)
    cleanup()
    alerts.unseen = 1
    render(<TabBar active="family" />)
    expect(screen.getByRole('img', { name: '1 new alert' })).toBeTruthy()
  })
})
