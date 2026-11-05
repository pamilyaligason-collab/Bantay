import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlertRow } from './store'

const h = vi.hoisted(() => ({ acting: false, rows: [] as unknown[], markSeen: vi.fn((_id: string) => Promise.resolve()) }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: h.acting ? 'p1' : null, name: '' }) }))
vi.mock('./useAlerts', () => ({ useAlertRows: () => h.rows }))
vi.mock('./store', () => ({ markSeen: (id: string) => h.markSeen(id) }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [{ id: 'p1', name: 'Mama Rosa' }], selfId: null }) }))
import { AlertCardToday, pickAlert } from './AlertCardToday'

afterEach(() => { cleanup(); h.acting = false; h.rows = []; h.markSeen.mockClear() })
const row = (id: string, o: Partial<AlertRow>): AlertRow => ({ id, personId: 'p1', kind: 'dose_missed', template: 'dose_missed', ref: null, createdAt: '2026-10-26T01:00:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-02T00:00:00Z', ...o })

describe('pickAlert: SOS > reading > hazard, newest first within a kind; a missed dose is a My day row, never this card', () => {
  const sos = row('sos', { kind: 'sos', template: 'family_sos', createdAt: '2026-10-26T00:00:00Z' })
  const reading = row('reading', { kind: 'reading_high', template: 'reading_high', createdAt: '2026-10-26T00:30:00Z' })
  const dose = row('dose', { createdAt: '2026-10-26T02:00:00Z' })
  const hazard = row('hazard', { kind: 'hazard', template: 'storm_warning', createdAt: '2026-10-26T03:00:00Z' })
  it('orders by priority even when a later kind is newer', () => {
    expect(pickAlert([hazard, dose, reading, sos])!.id).toBe('sos')
    expect(pickAlert([hazard, dose, reading])!.id).toBe('reading')
    expect(pickAlert([hazard, dose])!.id).toBe('hazard')
    expect(pickAlert([dose])).toBeNull()
    expect(pickAlert([hazard])!.id).toBe('hazard')
  })
  it('the newest of the same kind wins', () => {
    expect(pickAlert([row('old', { kind: 'hazard', template: 'storm_warning', createdAt: '2026-10-26T00:00:00Z' }), row('new', { kind: 'hazard', template: 'storm_warning', createdAt: '2026-10-26T05:00:00Z' })])!.id).toBe('new')
  })
  it('seen rows and normal-tone rows never make the card', () => {
    expect(pickAlert([row('seen', { seenAt: '2026-10-26T01:10:00Z' }), row('digest', { kind: 'digest', template: 'digest' }), row('late', { kind: 'sos', template: 'sos_late' })])).toBeNull()
    expect(pickAlert([])).toBeNull()
  })
})

describe('AlertCardToday', () => {
  it('renders nothing when there is no unseen urgent row', () => {
    const { container } = render(<AlertCardToday />)
    expect(container.firstChild).toBeNull()
  })
  it('shows the fixed copy with the name, and Open marks it seen and goes to the right tab', () => {
    h.rows = [row('r1', { kind: 'reading_high', template: 'reading_high' })]
    render(<AlertCardToday />)
    expect(screen.getByText('Please check on Mama Rosa')).toBeTruthy()
    expect(screen.getByText('Open Bantay to see more.')).toBeTruthy()
    const open = screen.getByRole('link', { name: /Please check on Mama Rosa/ })
    expect(open.getAttribute('href')).toBe('#health')
    fireEvent.click(open)
    expect(h.markSeen).toHaveBeenCalledWith('r1')
  })
  it('the close button marks it seen without opening anything', () => {
    h.rows = [row('r2', { kind: 'reading_high', template: 'reading_high' })]
    render(<AlertCardToday />)
    fireEvent.click(screen.getByRole('button', { name: /Dismiss this family alert/ }))
    expect(h.markSeen).toHaveBeenCalledWith('r2')
  })
  it('is one row with no Jack art (D-91)', () => {
    h.rows = [row('r3', { kind: 'sos', template: 'family_sos' })]
    const { container } = render(<AlertCardToday />)
    expect(container.querySelectorAll('img.jack, .jack').length).toBe(0)
    expect(screen.getAllByRole('region', { name: 'Family alert' }).length).toBe(1)
  })
})

describe('AlertCardToday while an admin views as someone', () => {
  it("the admin's own family alert is not the viewed person's: nothing for a reading or a hazard", () => {
    h.acting = true
    for (const r of [row('v1', { kind: 'reading_high', template: 'reading_high' }), row('v2', { kind: 'hazard', template: 'storm_warning' })]) {
      h.rows = [r]
      const { container, unmount } = render(<AlertCardToday />)
      expect(container.firstChild, r.kind).toBeNull()
      unmount()
    }
  })
  it('an SOS or a storm call for help is safety: it still shows while viewing', () => {
    h.acting = true
    for (const [kind, template] of [['sos', 'family_sos'], ['rollcall', 'rollcall_help']] as const) {
      h.rows = [row(`v-${kind}`, { kind, template })]
      const { unmount } = render(<AlertCardToday />)
      expect(screen.getByRole('region', { name: 'Family alert' }).getAttribute('data-kind'), kind).toBe(kind)
      unmount()
    }
  })
  it('not viewing, the same hazard row shows', () => {
    h.rows = [row('v3', { kind: 'hazard', template: 'storm_warning' })]
    render(<AlertCardToday />)
    expect(screen.getByRole('region', { name: 'Family alert' })).toBeTruthy()
  })
})

describe('AlertCardToday system row', () => {
  it('names the job and links to System health instead of the push line', () => {
    h.rows = [row('sys', { kind: 'system', template: 'system', personId: null, ref: 'alerts-ingest:81234' })]
    render(<AlertCardToday />)
    expect(screen.getByText('Official alerts feed had a failed run')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Open Bantay|needs your attention/)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/admin#/system')
  })
  it('a row with no ref says so plainly', () => {
    h.rows = [row('sys', { kind: 'system', template: 'system', personId: null, ref: null })]
    render(<AlertCardToday />)
    expect(screen.getByText('No job name was saved. Open System health to see which one.')).toBeTruthy()
  })
})
