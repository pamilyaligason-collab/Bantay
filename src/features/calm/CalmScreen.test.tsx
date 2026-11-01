// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const kv: Record<string, unknown> = {}
vi.mock('../shell/useKv', () => ({ useKv: (key: string, init: unknown) => [key in kv ? kv[key] : init, vi.fn(), true] }))
vi.mock('../today/BreathSheet', () => ({ default: () => <div role="dialog">sheet</div> }))
afterEach(() => { cleanup(); for (const k of Object.keys(kv)) delete kv[k] })

import { CALM_JACK_EVENT } from './CalmJack'
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

describe('Ask Jack', () => {
  it('only dispatches the Calm Jack event (CalmJack, mounted at App level, owns the sheet and SOS)', () => {
    const on = vi.fn()
    window.addEventListener(CALM_JACK_EVENT, on)
    render(<CalmScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Jack' }))
    window.removeEventListener(CALM_JACK_EVENT, on)
    expect(on).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('jack-sheet')).toBeNull()
  })
})

describe('arrival', () => {
  it('scrolls the page scroller to the top on mount', () => {
    const sc = document.createElement('main'); sc.className = 'scroll'
    const bt = document.createElement('div'); bt.className = 'bt'; bt.appendChild(sc); document.body.appendChild(bt)
    const to = vi.fn(); sc.scrollTo = to as never
    render(<CalmScreen />)
    expect(to).toHaveBeenCalledWith(0, 0)
    bt.remove()
  })
})

describe('Listen and watch and crisis', () => {
  it('Listen and watch is absent with the flag off', () => {
    render(<CalmScreen />)
    expect(screen.queryByTestId('calm-media')).toBeNull()
  })
  it('shows three outside links and the checked video with flag.calm.radio on', () => {
    kv['flag.calm.radio'] = true
    render(<CalmScreen />)
    const media = screen.getByTestId('calm-media')
    const links = within(within(media).getByRole('group', { name: 'Listen and watch' })).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://somafm.com/groovesalad/', 'https://somafm.com/dronezone/', 'https://www.tarabrach.com/podcasts/'])
    for (const a of links) { expect(a.getAttribute('target')).toBe('_blank'); expect(a.getAttribute('rel')).toBe('noopener noreferrer') }
    expect(within(media).getByRole('button', { name: /Play Steps for Stress/ })).toBeTruthy()
  })
  it('the crisis card calls 1553 first and names its source', () => {
    render(<CalmScreen />)
    expect(screen.getByRole('link', { name: 'Call 1553' }).getAttribute('href')).toBe('tel:1553')
    expect(screen.getByTestId('calm-crisis').textContent).toMatch(/ncmh\.gov\.ph/)
    expect(screen.getByRole('link', { name: /Call 0919-057-1553/ }).getAttribute('href')).toBe('tel:09190571553')
  })
})
