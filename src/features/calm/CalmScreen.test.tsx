// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const kv: Record<string, unknown> = {}
vi.mock('../shell/useKv', () => ({ useKv: (key: string, init: unknown) => [key in kv ? kv[key] : init, vi.fn(), true] }))
const sheet = vi.hoisted(() => ({ props: null as null | { initial?: { pattern: string; minutes: number } } }))
vi.mock('../today/BreathSheet', () => ({ default: (p: { initial?: { pattern: string; minutes: number } }) => { sheet.props = p; return <div role="dialog">sheet</div> } }))
afterEach(() => { cleanup(); for (const k of Object.keys(kv)) delete kv[k] })

import { CALM_JACK_EVENT } from './CalmJack'
import CalmScreen from './CalmScreen'

describe('S24 order', () => {
  it('After a scare sits directly after the breathing card (before the Exercises list), before the mood check, media and the crisis card (which is unchanged)', () => {
    render(<CalmScreen />)
    const root = screen.getByTestId('calm')
    const kids = Array.from(root.children)
    const at = (el: Element) => kids.findIndex((k) => k === el || k.contains(el))
    const hero = at(screen.getByTestId('calm-hero'))
    expect(at(screen.getByTestId('calm-scare-card'))).toBe(hero + 1) // just under the breathing card, as the board
    expect(at(screen.getByTestId('calm-exercises'))).toBe(hero + 2) // the Exercises list follows it
    expect(at(screen.getByTestId('calm-scare-card'))).toBeLessThan(at(screen.getByTestId('calm-media')))
    expect(at(screen.getByTestId('calm-crisis'))).toBe(kids.length - 1) // last
    expect(at(screen.getByTestId('calm-crisis'))).toBeGreaterThan(at(screen.getByTestId('calm-media')))
  })
})

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
    expect(screen.getByTestId('calm-safety').textContent).toMatch(/Chest pain is an emergency/) // the sheet no longer shows it: Start goes straight to the run
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(sheet.props?.initial).toEqual({ pattern: 'relax', minutes: 3 })
  })
  it('the pattern and length rows pick what Start opens: Calm box + 5 min -> the sheet gets calm and 5', () => {
    render(<CalmScreen />)
    const hero = screen.getByTestId('calm-hero')
    expect(within(within(hero).getByRole('group', { name: 'Kind of breathing' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Relax · in 4, out 6', 'Calm box · 4-4-4-4', 'Sleep 4-7-8 · coming']) // Sleep (4-7-8) is a disabled, dashed "coming" pill: not offered, per the clinician gate
    fireEvent.click(within(hero).getByRole('button', { name: /Calm box/ }))
    fireEvent.click(within(hero).getByRole('button', { name: '5 min' }))
    expect(hero.textContent).toMatch(/Box: 4-4-4-4/)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(sheet.props?.initial).toEqual({ pattern: 'calm', minutes: 5 })
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
  it('radio by section, then four checked videos, no flag needed, and loads nothing before a tap', () => {
    render(<CalmScreen />)
    const media = screen.getByTestId('calm-media')
    const row = screen.getByTestId('calm-row')
    expect(media.querySelectorAll('.carousel')).toHaveLength(0)
    expect(row.querySelectorAll('.md-list > *')).toHaveLength(4)
    expect(row.querySelectorAll('[data-hero]')).toHaveLength(0) // Calm's own breathing card is the one hero; the videos are rows
    expect(row.querySelector('.more-grid')).toBeNull()
    expect(within(media).getAllByRole('button', { name: /^Play (Love Radio|Easy Rock|DZRH|Home Radio|Magic 89\.9)/ })).toHaveLength(5)
    expect(['music', 'pop', 'news'].map((s) => within(media).getByTestId(`radio-sec-${s}`).querySelectorAll('li').length)).toEqual([2, 2, 1])
    expect(within(row).getAllByRole('button', { name: /^Video, / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Video, Steps for Stress: a breathing exercise, NHS inform', 'Video, Heavy Rain and Thunder Soundscape, The Ambient Warrior', 'Video, Forest stream with birdsong, Wildflow Nature', 'Video, Ocean waves on a pebble beach, Alesia in Wonderland'])
    expect(within(media).getByRole('button', { name: /^Video, Steps for Stress/ })).toBeTruthy()
    expect(media.textContent).toMatch(/NHS inform/)
    expect(media.textContent).not.toMatch(/Radio Paradise|Swiss|SomaFM|Tara Brach/)
    expect(media.querySelector('iframe, video')).toBeNull() // nothing embeds before a tap
    expect(media.textContent).toMatch(/Radio plays here after a tap\. Radio stops when you leave Calm\./)
  })
  it('Relaxing radio lands on Listen and watch: #calm/listen scrolls the section into view', () => {
    const into = vi.fn(); Element.prototype.scrollIntoView = into as never
    location.hash = '#calm/listen'
    render(<CalmScreen />)
    expect(into).toHaveBeenCalledTimes(1)
    expect((into.mock.contexts[0] as HTMLElement).getAttribute('data-testid')).toBe('calm-media')
    location.hash = ''
  })
  it('a tap loads the privacy-mode player for that video only', () => {
    render(<CalmScreen />)
    fireEvent.click(screen.getByRole('button', { name: /^Video, Heavy Rain/ })) // the card opens and plays at once: one tap
    const frames = screen.getByTestId('calm-media').querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    expect(frames[0]!.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/gzUSh6eEtKE\?/)
  })
  it('offline: one plain line', () => {
    const on = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<CalmScreen />)
    expect(screen.getByText(/You are offline/)).toBeTruthy()
    expect(screen.getByTestId('calm-row').nextElementSibling!.textContent).toMatch(/^You are offline/) // takes the note's place, so the crisis card does not move down
    on.mockRestore()
  })
  it('the crisis card keeps its own Source link class (the media rows never use it)', () => {
    render(<CalmScreen />)
    expect(screen.getByTestId('calm-crisis').querySelector('a.cm-src')).not.toBeNull()
    expect(screen.getByTestId('calm-media').querySelector('.cm-src')).toBeNull()
  })
  it('the crisis card calls 1553 first and names its source', () => {
    render(<CalmScreen />)
    expect(screen.getByRole('link', { name: 'Call 1553' }).getAttribute('href')).toBe('tel:1553')
    expect(screen.getByTestId('calm-crisis').textContent).toMatch(/ncmh\.gov\.ph/)
    expect(screen.getByRole('link', { name: /Call 0919-057-1553/ }).getAttribute('href')).toBe('tel:09190571553')
  })
})
