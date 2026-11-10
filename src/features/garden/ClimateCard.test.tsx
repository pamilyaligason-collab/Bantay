import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pair, tokensOf } from '../look/contrastMath'
import css from './climate-card.css?raw'
import { parseDrought } from '../../../supabase/functions/pagasa-drought/drought'
import boholJson from '../../../supabase/functions/pagasa-drought/fixtures/bohol.json'
import socotJson from '../../../supabase/functions/pagasa-drought/fixtures/south-cotabato.json'
const h = vi.hoisted(() => ({ c: { ready: true, province: 'Bohol' as string | null }, d: undefined as import('./drought').Drought | null | undefined }))
vi.mock('./climate', async (orig) => ({ ...(await orig<typeof import('./climate')>()), useClimate: () => h.c }))
vi.mock('./drought', async (orig) => ({ ...(await orig<typeof import('./drought')>()), useDrought: () => h.d }))
import ClimateCard, { CLIMATE_NONE, ClimateView } from './ClimateCard'
import { OUTLOOK_URL } from './drought'

const FIXTURES: Record<string, unknown> = { 'bohol.json': boholJson, 'south-cotabato.json': socotJson } // real PAGASA answers saved 10 Nov 2026
const real = (n: string, p: string) => parseDrought(FIXTURES[n], p)!
const BOHOL = { ...real('bohol.json', 'Bohol'), saved: false }

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T04:00:00Z')) }) // noon in Manila, 10 Nov 2026
afterEach(() => { vi.useRealTimers(); cleanup(); h.c = { ready: true, province: 'Bohol' }; h.d = undefined })

describe('Climate outlook card', () => {
  it('shows the real Bohol outlook: six month chips with their level words (no "Now" chip: it equals November), one sentence, the PAGASA link', () => {
    h.d = BOHOL
    const { container } = render(<ClimateCard />)
    expect(screen.getByRole('heading', { name: 'Climate outlook' })).toBeTruthy()
    const months = within(screen.getByRole('list', { name: 'Month by month' })).getAllByRole('listitem')
    expect(months).toHaveLength(6)
    const chips = Array.from(container.querySelectorAll('.clm-chip'))
    expect(chips.map((x) => x.textContent)).toEqual(['NovNot affected', 'DecDry condition', 'JanDry spell', 'FebDrought', 'MarDrought', 'AprDrought'])
    expect(chips.map((x) => x.getAttribute('data-level'))).toEqual(['not_affected', 'dry_condition', 'dry_spell', 'drought', 'drought', 'drought'])
    expect(screen.getByText('Dry spell expected from January; drought possible February to April.')).toBeTruthy()
    expect(container.textContent).toContain('Bohol · PAGASA, 3 Nov')
    const link = screen.getByRole('link', { name: /PAGASA Drought Monitor/ })
    expect(link.getAttribute('href')).toBe(OUTLOOK_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
  it('is climate only: no weather words, numbers or units', () => {
    h.d = BOHOL
    const { container } = render(<ClimateCard />)
    expect(container.textContent).not.toMatch(/rain|°|forecast|temperature|mm\b|%|wind|storm/i)
  })
  it('a saved copy says so', () => {
    h.d = { ...BOHOL, saved: true }
    const { container } = render(<ClimateCard />)
    expect(container.textContent).toContain('(saved copy)')
  })
  it('unknown, missing or old (over 60 days): "not available yet" with the link, no chips', () => {
    for (const d of [null, { ...BOHOL, issued_at: '2026-08-01' }]) {
      h.d = d
      const { container, unmount } = render(<ClimateCard />)
      expect(screen.getByText(CLIMATE_NONE)).toBeTruthy()
      expect(container.querySelector('.clm-chips')).toBeNull()
      expect(screen.getByRole('link', { name: /PAGASA Drought Monitor/ }).getAttribute('href')).toBe(OUTLOOK_URL)
      unmount()
    }
  })
  it('no province for the place: the empty card, and nothing while the place is still being found', () => {
    h.c = { ready: true, province: null }; h.d = null
    const { unmount } = render(<ClimateCard />)
    expect(screen.getByText(CLIMATE_NONE)).toBeTruthy()
    unmount()
    h.c = { ready: false, province: null }
    expect(render(<ClimateCard />).container.textContent).toBe('')
  })
  it('waits for the read before it shows, so the empty card never flashes first', () => {
    h.d = undefined
    expect(render(<ClimateCard />).container.textContent).toBe('')
  })
  it('the view uses its own month clock: in January the past months are gone', () => {
    const { container } = render(<ClimateView province="Bohol" d={BOHOL} nowYm="2027-01" />)
    expect(Array.from(container.querySelectorAll('.clm-chip')).map((x) => x.textContent)).toEqual(['Oct (latest)Not affected', 'JanDry spell', 'FebDrought', 'MarDrought'])
  })
})

describe('chip colours (ML-39): every level, light and dark, text >= 4.5', () => {
  const rule = (level: string) => {
    const m = new RegExp(`\\[data-level="${level}"\\] \\{ background: var\\((--[\\w-]+)\\); color: var\\((--[\\w-]+)\\);`).exec(css)
    expect(m, level).toBeTruthy()
    return { bg: m![1]!, fg: m![2]! }
  }
  const pairs = { not_affected: ['--tint-green', '--tint-green-ink'], dry_condition: ['--tint-slate', '--tint-slate-ink'], dry_spell: ['--tint-amber', '--tint-amber-ink'], drought: ['--tint-amber-ink', '--tint-amber'] } as const
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}`, () => {
      const t = tokensOf(theme)
      for (const [level, [bg, fg]] of Object.entries(pairs)) {
        expect(rule(level)).toEqual({ bg, fg }) // the css uses the pair this test checks
        expect(pair(t, fg, bg), `${level} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(pair(t, '--muted', '--card')).toBeGreaterThanOrEqual(4.5) // the issue-date line
      expect(pair(t, '--ink', '--card')).toBeGreaterThanOrEqual(4.5) // the sentence and the link
    })
  }
  it('drought is a strong amber pair, never the SOS red (--danger-bg)', () => {
    expect(css).not.toMatch(/danger|--red|tint-red/)
  })
  it('narrow phones get two columns, so "Not affected" does not wrap', () => {
    expect(css).toMatch(/max-width: 419px\) \{ \.clm-chips \{ grid-template-columns: repeat\(2/)
  })
  it('the dry spell chip also carries a border, so it differs from drought by more than colour', () => {
    expect(css).toMatch(/data-level="dry_spell"\][^}]*box-shadow: inset/)
  })
  it('type floor: no text under 15px, and no motion at all (reduced motion is moot)', () => {
    for (const f of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(f[1])).toBeGreaterThanOrEqual(15)
    expect(css).not.toMatch(/animation|transition/)
  })
})
