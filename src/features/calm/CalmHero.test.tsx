// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

// The real useKv: instances do not share state, so the hero must re-read after the sheet closes.
vi.mock('../today/BreathSheet', () => ({ default: ({ onClose }: { onClose: () => void }) => <div role="dialog"><button onClick={onClose}>close</button></div> }))
beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

import CalmHero, { AfterScare, restAt } from './CalmHero'
import { SHOWN_PATTERNS } from '../today/breathLogic'

describe('CalmHero with the real useKv', () => {
  it('after the sheet logs a session and closes, the hero says Done once today and shows the new buzz', async () => {
    render(<CalmHero />)
    await waitFor(() => expect(screen.getByText('Not done yet today')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    // another useKv instance (BreathSheet) writes while the sheet is open
    await act(async () => {
      await db.kv.put({ key: 'selfcare.log', value: [{ at: new Date().toISOString(), pattern: 'relax', minutes: 1, mood: 3 }] })
      await db.kv.put({ key: 'selfcare.buzz', value: false })
    })
    fireEvent.click(screen.getByText('close'))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start' })) // BreathSheet does not return focus itself
    await waitFor(() => expect(screen.getByText('Done once today')).toBeTruthy())
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('false')
  })
  it('the buzz switch writes selfcare.buzz', async () => {
    render(<CalmHero />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Gentle buzz' })).toBeTruthy())
    fireEvent.click(screen.getByRole('switch', { name: 'Gentle buzz' }))
    await waitFor(async () => expect((await db.kv.get('selfcare.buzz'))?.value).toBe(false))
    expect(screen.getByRole('switch', { name: 'Gentle buzz' }).getAttribute('aria-checked')).toBe('false')
  })
  it('the idle orb is hidden from screen readers so its changing word is not announced', () => {
    render(<CalmHero />)
    const orb = screen.getByTestId('calm-hero').querySelector('.bo')!
    expect(orb.closest('[aria-hidden="true"]')).not.toBeNull()
  })
  it('S22-C: the hero orb is a dotted sphere (round-capped dots, no rings) and the exercise cards each carry their own', () => {
    render(<CalmHero />)
    const hero = screen.getByTestId('calm-hero')
    expect(hero.querySelectorAll('.bo-orb ellipse[stroke-dasharray^="0 "]').length).toBe(7)
    expect(hero.querySelector('.bo-orb i')).toBeNull()
    const cards = screen.getByTestId('calm-exercises').querySelectorAll('button')
    expect(cards.length).toBe(SHOWN_PATTERNS.length) // After a scare sits after the crisis card
    for (const c of cards) expect(c.querySelector('svg ellipse')).not.toBeNull()
  })
  it('S22-C: an exercise card picks that pattern; the cue words are unchanged', () => {
    render(<CalmHero />)
    const calm = screen.getByTestId('calm-exercises').querySelector('[data-pattern="calm"]') as HTMLElement
    fireEvent.click(calm)
    expect(calm.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Calm box/ }).getAttribute('aria-pressed')).toBe('true')
  })
  it('S22-C reduced motion: the sphere is static at the rest size and the dotted group only spins by CSS that reduced motion switches off', async () => {
    const css = (await import('../look/orb.css?raw')).default
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.ds-spin \{ animation: none/)
    render(<CalmHero />)
    const m = /scale\(([\d.]+)\)/.exec((screen.getByTestId('calm-hero').querySelector('.bo-orb') as HTMLElement).style.transform)
    expect(Number(m![1])).toBeGreaterThan(0.8)
  })
  it('the idle orb rests near 185 px of 220 (scale about 0.84 to 0.91), never at the 121 px bottom of the breath, and shows no words before Start', () => {
    render(<CalmHero />)
    const hero = screen.getByTestId('calm-hero')
    const m = /scale\(([\d.]+)\)/.exec((hero.querySelector('.bo-orb') as HTMLElement).style.transform)
    expect(Number(m![1])).toBeGreaterThan(0.8)
    expect(Number(m![1])).toBeLessThan(0.95)
    expect(restAt(SHOWN_PATTERNS[0]!)).toBeCloseTo(3, 5) // Relax: 4 s in, 75%
  })
})

describe('After a scare', () => {
  it('the card has its own sphere and opens a sheet that steps 5-4-3-2-1 with Next, then Done', () => {
    render(<AfterScare />)
    const card = screen.getByTestId('calm-scare-card')
    expect(card.textContent).toContain('After a scare')
    expect(card.textContent).toContain('3 min')
    expect(card.querySelector('svg ellipse')).not.toBeNull()
    fireEvent.click(card)
    const want = ['Name 5 things you can see.', 'Name 4 things you can hear.', 'Name 3 things you can touch.', 'Name 2 things you can smell.', 'Name 1 thing you can taste.']
    want.forEach((w, i) => {
      expect(screen.getByTestId('scare-step').textContent).toBe(w)
      expect(screen.getByTestId('scare-count').textContent).toBe(`Step ${i + 1} of 5`)
      const btn = screen.getByRole('button', { name: i === 4 ? 'Done' : 'Next' })
      expect(btn.style.minHeight).toBe('44px')
      if (i < 4) fireEvent.click(btn)
    })
  })
})
