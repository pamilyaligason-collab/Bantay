import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocBundle } from '../records/api'
import type { FamilyEvent } from './store'

const h = vi.hoisted(() => ({ queue: { count: 0, byPerson: {} as Record<string, number> }, docs: [] as unknown[], events: [] as unknown[], file: vi.fn() }))
vi.mock('../records/useRecordsServer', () => ({ useQueue: () => h.queue, useConfirmedDocs: () => h.docs }))
vi.mock('./roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: 'p1' }) }))
vi.mock('./usePlan', () => ({ usePlan: () => ({ tasks: [], events: h.events, notes: [] }) }))
vi.mock('./messagesApi', () => ({ listMessages: async () => ({ ok: true, data: [] }) }))
vi.mock('../shell/useKv', () => ({ useKv: () => [null, vi.fn(), true] }))
vi.mock('../scan/open', () => ({ openScan: vi.fn(), openScanWithFile: h.file }))
import { calSummary, recentPapers, TogetherList } from './TogetherList'

afterEach(cleanup)
beforeEach(() => { h.queue = { count: 0, byPerson: {} }; h.docs = []; h.events = []; h.file.mockClear() })

// Local-time instants, the way events.ts instant() builds them (toISOString), so these hold in any time zone.
const ev = (title: string, y: number, m: number, d: number, hh = 0, mm = 0): FamilyEvent => ({ clientId: title, title, startsAt: new Date(y, m, d, hh, mm).toISOString(), endsAt: null, allDay: hh === 0 && mm === 0, personId: null })
const bundle = (id: string, kind: string, doc_date: string | null, confirmed_at: string | null = null) => ({ doc: { id, kind, doc_date, confirmed_at }, labs: [], items: [], vaccinations: [], imaging: [], files: [] }) as unknown as DocBundle

describe('calSummary (local day, ML-38)', () => {
  const lateNight = new Date(2026, 9, 27, 23, 30)
  const afterMidnight = new Date(2026, 9, 28, 0, 30)

  it('an all-day event today is Today at 23:30 and at 00:30 (its UTC date is the day before in Manila)', () => {
    expect(calSummary([ev('School program', 2026, 9, 27)], lateNight)).toBe('School program · Today')
    expect(calSummary([ev('School program', 2026, 9, 28)], afterMidnight)).toBe('School program · Today')
  })

  it('an event tomorrow morning is Tomorrow, never Today, at 23:30 and 00:30', () => {
    expect(calSummary([ev('Dentist', 2026, 9, 28, 6, 0)], lateNight)).toBe('Dentist · Tomorrow')
    expect(calSummary([ev('Dentist', 2026, 9, 29, 6, 0)], afterMidnight)).toBe('Dentist · Tomorrow')
  })

  it('yesterday is dropped; the soonest later one wins; none says so', () => {
    const s = calSummary([ev('Old', 2026, 9, 26), ev('Later', 2026, 9, 30, 9, 0), ev('Sooner', 2026, 9, 29, 9, 0)], lateNight)
    expect(s.startsWith('Sooner · ')).toBe(true)
    expect(calSummary([ev('Old', 2026, 9, 26)], lateNight)).toBe('Nothing coming up')
    expect(calSummary([], lateNight)).toBe('Nothing coming up')
  })
})

describe('recentPapers', () => {
  it('newest 3 by paper date, falling back to the confirmed day', () => {
    const list = [bundle('a', 'lab', '2026-01-05'), bundle('b', 'lab', '2026-09-01'), bundle('c', 'rx', null, '2026-10-20T01:00:00Z'), bundle('d', 'lab', '2026-03-01')]
    expect(recentPapers(list).map((b) => b.doc.id)).toEqual(['c', 'b', 'd'])
  })
})

describe('Papers card', () => {
  it('shows "<n> to review" from the viewer own queue only when n > 0', () => {
    h.queue = { count: 5, byPerson: { p1: 2, p2: 3 } }
    render(<TogetherList />)
    expect(screen.getByTestId('papers-review').textContent).toBe('2 to review')
  })

  it('no pill when only other people have papers waiting', () => {
    h.queue = { count: 3, byPerson: { p2: 3 } }
    render(<TogetherList />)
    expect(screen.queryByTestId('papers-review')).toBeNull()
  })

  it('lists the 3 newest papers (date + Done) and "All papers (4)"', () => {
    h.docs = [bundle('a', 'lab', '2026-01-05'), bundle('b', 'lab', '2026-09-01'), bundle('c', 'rx', '2026-10-20'), bundle('d', 'lab', '2026-03-01')]
    render(<TogetherList />)
    const rows = screen.getAllByTestId('paper-row')
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.textContent?.includes('Done'))).toBe(true)
    expect(rows[0]!.textContent).toContain('20 Oct 2026')
    expect(rows[0]!.textContent).not.toContain('2026-10-20')
    expect(screen.getByTestId('papersrow').textContent).toBe('All papers (4) ›')
  })

  it('before any paper has loaded (or with none) the link has no count', () => {
    render(<TogetherList />)
    expect(screen.queryAllByTestId('paper-row')).toHaveLength(0)
    expect(screen.getByTestId('papersrow').textContent).toBe('All papers ›')
  })

  it('Upload hands the picked file to the scan flow', () => {
    render(<TogetherList />)
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('papers-file'), { target: { files: [f] } })
    expect(h.file).toHaveBeenCalledWith(f)
  })

  it('the sub line says these are your papers', () => {
    render(<TogetherList />)
    expect(screen.getByTestId('papers-card').textContent).toContain('Your papers')
  })
})
