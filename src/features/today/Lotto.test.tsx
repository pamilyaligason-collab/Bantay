import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LottoRow } from './lottoApi'
const h = vi.hoisted(() => ({ rows: null as unknown as LottoRow[] | null }))
vi.mock('./lottoApi', async (orig) => ({ ...(await orig<typeof import('./lottoApi')>()), useLotto: () => ({ rows: h.rows }) }))
import Lotto, { drawDay, LOTTO_NOTE } from './Lotto'

const r = (game: string, draw_date: string, combination: string, winners: number | null = 0): LottoRow => ({ game, draw_date, combination, jackpot_php: 1_000_000, winners })
const ALL = [
  r('Ultra Lotto 6/58', '2026-11-06', '03-11-24-35-41-52'),
  r('Grand Lotto 6/55', '2026-11-07', '05-12-22-27-34-43', 0),
  r('Super Lotto 6/49', '2026-11-05', '02-09-17-26-38-44'),
  r('Mega Lotto 6/45', '2026-11-04', '07-14-21-28-33-40'),
  r('Lotto 6/42', '2026-11-07', '04-18-19-23-28-33', 2),
  r('3D Lotto 9PM', '2026-11-07', '4-4-7', 12),
  r('Lotto 6/42', '2026-11-03', '01-02-03-04-05-06') // an older draw of the same game
]
afterEach(() => { cleanup(); h.rows = null })

describe('Lotto card', () => {
  it('is hidden with no rows, with an empty table and with only games it does not show', () => {
    for (const rows of [null, [], [r('2D Lotto 11AM', '2026-11-07', '1-2')]]) {
      h.rows = rows
      const { container } = render(<Lotto />)
      expect(container.innerHTML).toBe('')
      cleanup()
    }
  })
  it('shows the three newest draws first with day, winner line and round numbers; the older 6/42 draw never shows', () => {
    h.rows = ALL
    const { container } = render(<Lotto />)
    expect(screen.getByRole('heading', { name: 'Lotto results' })).toBeTruthy()
    const rows = Array.from(container.querySelectorAll('.lt-row'))
    expect(rows.map((x) => x.getAttribute('aria-label'))).toEqual([
      'Grand Lotto 6/55, Sat 7 Nov, no winner, numbers 05 12 22 27 34 43',
      'Lotto 6/42, Sat 7 Nov, 2 winners, numbers 04 18 19 23 28 33',
      '3D Lotto 9PM, Sat 7 Nov, numbers 4 4 7'
    ])
    expect(container.querySelectorAll('.lt-ball')).toHaveLength(6 + 6 + 3)
    expect(container.textContent).not.toContain('01 02 03')
    expect(container.querySelector('.lt-note')!.textContent).toBe('Numbers as posted by PCSO. Check your ticket with PCSO before claiming.')
    expect(LOTTO_NOTE).toBe('Numbers as posted by PCSO. Check your ticket with PCSO before claiming.')
  })
  it('More games opens all six games in order 6/58, 6/55, 6/49, 6/45, 6/42, 3D, and Fewer games folds back', () => {
    h.rows = ALL
    const { container } = render(<Lotto />)
    fireEvent.click(screen.getByRole('button', { name: 'More games' }))
    expect(Array.from(container.querySelectorAll('.lt-name')).map((x) => x.firstChild!.textContent)).toEqual(['Ultra Lotto 6/58', 'Grand Lotto 6/55', 'Super Lotto 6/49', 'Mega Lotto 6/45', 'Lotto 6/42', '3D Lotto 9PM'])
    fireEvent.click(screen.getByRole('button', { name: 'Fewer games' }))
    expect(container.querySelectorAll('.lt-row')).toHaveLength(3)
  })
  it('no More games button when three or fewer games have rows', () => {
    h.rows = ALL.slice(0, 2)
    render(<Lotto />)
    expect(screen.queryByRole('button', { name: 'More games' })).toBeNull()
  })
  it('drawDay is the calendar day, whatever the time zone; a bad date is shown as given', () => {
    expect(drawDay('2026-11-07')).toBe('Sat 7 Nov')
    expect(drawDay('2026-01-01')).toBe('Thu 1 Jan')
    expect(drawDay('nope')).toBe('nope')
  })
  it('balls are round 44-safe chips: a wrapping row, no fixed width on the row', () => {
    const css = readFileSync('src/features/today/lotto.css', 'utf8')
    expect(css).toMatch(/\.lt-ball \{[^}]*border-radius: 50%/)
    expect(css).toMatch(/\.lt-row \{[^}]*flex-wrap: wrap/)
  })
})
