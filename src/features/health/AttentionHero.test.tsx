import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AttentionHero } from './AttentionHero'
import { pickAttention } from './attention'
import type { Reading } from './ranges'

afterEach(cleanup)
const NOW = new Date('2026-11-02T12:00:00')
const r = (test: string, value: number, daysAgo: number, extra: Partial<Reading> = {}): Reading => ({ personId: 'p1', test, value, unit: 'U/L', takenAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), ...extra })
const show = (rows: Reading[]) => render(<AttentionHero attention={pickAttention(rows, () => undefined, NOW)} canLog canEdit onAdd={() => undefined} />)

describe('AttentionHero', () => {
  it('an old lead shows "Old result" with its year', () => {
    show([r('alt', 90, 400, { labLow: 10, labHigh: 50 })])
    expect(screen.getByTestId('bodyhero').textContent).toMatch(/Old result, .*2025/)
  })
  it('a pulse lead says it is a pulse reading, not judged as resting', () => {
    show([r('heart_rate', 130, 1, { unit: 'bpm' })])
    expect(screen.getByTestId('bodyhero').textContent).toContain('A pulse reading, not judged as resting')
  })
  it('two buttons share one row', () => {
    show([r('alt', 90, 2, { labLow: 10, labHigh: 50 })])
    expect(screen.getByTestId('bodyhero').querySelectorAll('.ah-acts .cd-act')).toHaveLength(2)
  })
})
