import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PagasaData, PagasaRow } from './pagasa'
const h = vi.hoisted(() => ({ d: undefined as PagasaData | null | undefined }))
vi.mock('./pagasa', async (orig) => ({ ...(await orig<typeof import('./pagasa')>()), usePagasa: () => h.d }))
import { PagasaCard } from './PagasaCard'

const URL1 = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'
const row = (o: Partial<PagasaRow> = {}): PagasaRow => ({ dedupe_key: 'k', kind: 'tropical_cyclone', title: 'Typhoon "Samuel" - Tropical Cyclone Bulletin #1', issued_at: new Date(Date.now() - 3_600_000).toISOString(), areas: '', signals: [], source_url: URL1, fetched_at: new Date().toISOString(), ...o })
const put = (rows: PagasaRow[], saved = false, readAt = Date.now()) => { h.d = { rows, saved, readAt } }
afterEach(() => { cleanup(); h.d = undefined })
const link = () => screen.getByRole('link', { name: 'Open the PAGASA bulletin ›' })
const tone = (c: HTMLElement) => c.querySelector('[data-testid="pagasa-card"]')!.getAttribute('data-tone')

describe('PAGASA card', () => {
  it('renders nothing until the first read settles', () => {
    const { container } = render(<PagasaCard />)
    expect(container.innerHTML).toBe('')
  })
  it('current bulletin with no signal: title, bulletin time, line, authority, link to the row', () => {
    put([row()])
    const { container } = render(<PagasaCard zone="dampas" />)
    expect(screen.getByRole('heading', { name: 'PAGASA' })).toBeTruthy()
    expect(screen.getByText('Typhoon "Samuel" - Tropical Cyclone Bulletin #1')).toBeTruthy()
    expect(container.textContent).toMatch(/Bulletin .*\d/)
    expect(screen.getByText('No wind signal in this bulletin.')).toBeTruthy()
    expect(screen.getByText('PAGASA is the official word.')).toBeTruthy()
    expect(link().getAttribute('href')).toBe(URL1)
    expect(link().getAttribute('target')).toBe('_blank')
    expect(link().getAttribute('rel')).toContain('noopener')
    expect(tone(container)).toBeNull()
    expect(container.textContent).not.toMatch(/\bsafe\b|all clear/i)
  })
  it('signal 3 is red, names the signal and the zone place when listed', () => {
    put([row({ signals: [{ level: 3, areas: 'Samar' }, { level: 1, areas: 'Bohol' }] })])
    const { container } = render(<PagasaCard zone="dampas" />)
    expect(tone(container)).toBe('red')
    expect(screen.getByText('Signal #3 raised. Check if your place is listed.')).toBeTruthy()
    expect(screen.getByText('Signal #1 lists Bohol.')).toBeTruthy()
  })
  it('signal 1 is amber and an unlisted place adds no line', () => {
    put([row({ signals: [{ level: 1, areas: 'Samar' }] })])
    const { container } = render(<PagasaCard zone="conel" />)
    expect(tone(container)).toBe('amber')
    expect(screen.queryByText(/lists/)).toBeNull()
  })
  it('no current row: the no-bulletin line and the home link; same for null data', () => {
    put([row({ fetched_at: new Date(Date.now() - 3 * 3_600_000).toISOString() })])
    const { unmount } = render(<PagasaCard />)
    expect(screen.getByText('No PAGASA bulletin read in the last 2 hours. Check PAGASA directly.')).toBeTruthy()
    expect(link().getAttribute('href')).toBe('https://www.pagasa.dost.gov.ph/')
    unmount()
    h.d = null
    render(<PagasaCard />)
    expect(screen.getByText(/No PAGASA bulletin read/)).toBeTruthy()
    expect(screen.getByText('PAGASA is the official word.')).toBeTruthy()
  })
  it('saved copy shows its rows with a status chip; older than 24 h shows the no-bulletin line', () => {
    put([row()], true, Date.now() - 3_600_000)
    const { unmount } = render(<PagasaCard />)
    expect(screen.getByRole('status').textContent).toMatch(/^Not updated since /)
    expect(screen.getByText('No wind signal in this bulletin.')).toBeTruthy()
    unmount()
    put([row()], true, Date.now() - 25 * 3_600_000)
    render(<PagasaCard />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(/No PAGASA bulletin read/)).toBeTruthy()
  })
  it('advisory text is cut to 160 characters', () => {
    put([row({ kind: 'advisory', title: 'Advisory', areas: 'y'.repeat(300) })])
    render(<PagasaCard />)
    expect(screen.getByText(`${'y'.repeat(160)}…`)).toBeTruthy()
  })
})
