import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlateSheet from './PlateSheet'
import { FOODS } from './logic'

vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p-me' }))
vi.mock('./hooks', () => ({ useFood: () => [] }))

describe('PlateSheet estimate labels', () => {
  it('says Estimate on a food tile that is still an estimate, and only on those', () => {
    expect(FOODS.some((f) => f.estimate)).toBe(true)
    render(<PlateSheet onDone={() => {}} />)
    const tiles = screen.getAllByRole('button').filter((b) => b.classList.contains('nu-tile'))
    const flagged = tiles.filter((b) => b.textContent?.includes('Estimate'))
    expect(flagged.length).toBeGreaterThan(0)
    for (const b of flagged) expect(b.getAttribute('aria-label')).toMatch(/, estimate$/)
    for (const b of tiles.filter((t) => !flagged.includes(t))) expect(b.getAttribute('aria-label')).not.toMatch(/estimate/)
  })
})
