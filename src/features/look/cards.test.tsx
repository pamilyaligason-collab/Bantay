import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlertCard, HeroCard, Row, SceneHero, Tile } from './index'
import { Ring } from './Ring'

afterEach(() => { cleanup(); document.documentElement.removeAttribute('data-theme') })

for (const theme of ['light', 'dark'] as const) {
  describe(`card set (C-1) in ${theme}`, () => {
    const setup = () => document.documentElement.setAttribute('data-theme', theme)

    it('HeroCard draws icon + title, a whole-card link, one action and a 48 px close', () => {
      setup()
      const onClose = vi.fn(), onClick = vi.fn()
      const { container } = render(<HeroCard hue="green" icon="pill" kicker="Medicines" title="2 doses left today" body="Next at 8 PM" href="#health/meds" action={{ label: 'Take now', onClick }} onClose={onClose} closeLabel="Hide" testId="hero" />)
      const card = screen.getByTestId('hero')
      expect(card.getAttribute('data-hue')).toBe('green')
      expect(container.querySelector('svg.sh-ic')).toBeTruthy()
      expect(screen.getByRole('link', { name: '2 doses left today' }).getAttribute('href')).toBe('#health/meds')
      fireEvent.click(screen.getByRole('button', { name: 'Take now' }))
      expect(onClick).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('HeroCard with a locked action draws the lock and "View only" with the reason', () => {
      setup()
      const { container } = render(<HeroCard hue="blue" icon="heart" title="Mama" action={{ label: 'Log', disabled: true, lockReason: 'You can see Mama but not log for her.' }} />)
      const b = screen.getByRole('button', { name: /View only/ }) as HTMLButtonElement
      expect(b.disabled).toBe(true)
      expect(b.querySelector('svg.sh-ic')).toBeTruthy()
      expect(container.textContent).toContain('You can see Mama but not log for her.')
    })

    it('SceneHero hides the scene from assistive tech, keeps the title and puts Jack in his own cell', () => {
      setup()
      const { container } = render(<SceneHero scene={<i data-testid="layer" />} scrim inkOnScene kicker="General Santos" title="31 degrees" body="Hot and humid" href="#weather" action={{ label: 'Plan the day', href: '#weather' }} secondary={{ label: 'Later', onClick: () => {} }} jack="ready-for-rain" jackSize={56} testId="scene" />)
      expect(container.querySelector('.sc-scene')!.getAttribute('aria-hidden')).toBe('true')
      expect(container.querySelector('.sc-scrim')).toBeTruthy()
      expect(screen.getByTestId('scene').getAttribute('data-ink')).toBe('light')
      expect(screen.getByRole('heading', { name: '31 degrees' })).toBeTruthy()
      expect(container.querySelector('.sc-jack img')!.getAttribute('width')).toBe('56')
      expect(container.querySelector('.sc-txt img')).toBeNull() // art never sits inside the text cell
    })

    it('SceneHero without Jack draws no picture, compact is flagged', () => {
      setup()
      const { container } = render(<SceneHero scene={null} title="Storm" compact testId="s" />)
      expect(container.querySelector('img')).toBeNull()
      expect(screen.getByTestId('s').hasAttribute('data-compact')).toBe(true)
    })

    it('Tile is a whole-target link with icon, label and a visible value; the ring does not replace the value', () => {
      setup()
      const { container } = render(<Tile hue="lilac" icon="flask" label="Labs" value="3 results" ring={0.6} href="#health/labs" testId="tile" />)
      const t = screen.getByTestId('tile')
      expect(t.tagName).toBe('A')
      expect(t.textContent).toBe('Labs3 results')
      expect(container.querySelector('svg.sh-ic')).toBeTruthy()
      expect(container.querySelector('svg.rg')!.getAttribute('aria-hidden')).toBe('true')
    })

    it('Tile draws a sparkline and is a button when it has onClick only', () => {
      setup()
      const onClick = vi.fn()
      const { container } = render(<Tile hue="blue" icon="heart" label="BP" value="120/80" spark={[3, 1, 2]} onClick={onClick} />)
      expect(container.querySelector('.tl-spark path')!.getAttribute('d')).toBe('M0 2 L28 18 L56 10')
      fireEvent.click(screen.getByRole('button', { name: /BP/ }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('Row keeps its control outside the link and shows the badge count as text', () => {
      setup()
      const { container } = render(<Row icon="msg" title="Messages" sub="Anna: see you" href="#family/messages" badge={3} control={<button type="button">Mute</button>} testId="row" />)
      const link = screen.getByRole('link', { name: /Messages/ })
      expect(link.textContent).toContain('3')
      expect(link.querySelector('button')).toBeNull()
      expect(screen.getByRole('button', { name: 'Mute' })).toBeTruthy()
      expect(container.querySelector('svg.sh-ic')).toBeTruthy()
    })

    it('AlertCard shows tone, icon, title, body and its action', () => {
      setup()
      const { container } = render(<AlertCard tone="red" icon="warn" title="Storm signal 3" body="Stay inside" action={{ label: 'Read warning', href: '#safety/warnings' }} testId="al" />)
      expect(screen.getByTestId('al').getAttribute('data-tone')).toBe('red')
      expect(container.querySelector('svg.sh-ic')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Read warning' })).toBeTruthy()
      expect(container.querySelector('img')).toBeNull() // never Jack on an alert (D-91)
    })
  })
}

describe('Ring', () => {
  it('clamps the value and a label makes it a named image', () => {
    const { container, rerender } = render(<Ring value={2} label="Move 100%" />)
    expect(screen.getByRole('img', { name: 'Move 100%' })).toBeTruthy()
    const len = 2 * Math.PI * (28 / 2 - 3)
    expect(container.querySelector('.rg-val')!.getAttribute('stroke-dasharray')).toBe(`${len} ${len}`)
    rerender(<Ring value={Number.NaN} />)
    expect(container.querySelector('.rg-val')!.getAttribute('stroke-dasharray')).toBe(`0 ${len}`)
  })
})
