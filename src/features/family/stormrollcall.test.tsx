import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rows: [] as { person_id: string; status: string; at: string }[], upsert: vi.fn() }))
vi.mock('../auth/client', () => ({
  supabase: {
    from: () => {
      const q = { select: () => q, eq: () => Promise.resolve({ data: h.rows, error: null }), upsert: (r: unknown, o: unknown) => { h.upsert(r, o); return Promise.resolve({ error: null }) } }
      return q
    }
  }
}))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('../today/actions', () => ({ logFeeling: vi.fn(), feelingToast: () => '', FAIL_TEXT: {} }))
vi.mock('./roster', async (orig) => ({
  ...(await orig<typeof import('./roster')>()),
  useFamilyPeople: () => ({
    selfId: 'p1',
    people: [
      { id: 'p1', name: 'Lloyd Roc', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true },
      { id: 'p2', name: 'Papa Roc', photoPath: null, thumb: null, phone: '+63 917 123 4567', birthdate: null, isMe: false },
      { id: 'p3', name: 'Mama Roc', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false },
      { id: 'p4', name: 'Ate Roc', photoPath: null, thumb: null, phone: '09175550000', birthdate: null, isMe: false },
      { id: 'p5', name: 'Kuya Roc', photoPath: null, thumb: null, phone: '09175551111', birthdate: null, isMe: false }
    ]
  })
}))
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { StormCard } from '../safety/StormCard'
import { fdb } from './store'
import { StormRollCall } from './StormRollCall'

const NOW = Date.parse('2026-10-24T08:00:00+08:00')
const sig = (): Alert => ({
  id: 'pagasa-tcws-rosal-champi-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas, Tagbilaran City: Typhoon Rosal (CHAMPI)',
  what: 'w', where: 'Bohol', when: '2026-10-24 04:50 PH time', doNow: 'x', source: 'PAGASA', sourceUrl: null, issuedAt: '2026-10-23T20:50:38.000Z', lat: 9.6, lon: 123.8, bulletin: 'b'
})

beforeEach(async () => { h.rows = []; h.upsert.mockReset(); await Promise.all([db.kv.clear(), db.outbox.clear(), fdb.tasks.clear()]) })
afterEach(() => cleanup())

describe('StormRollCall', () => {
  it('is hidden when no storm is live', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [{ ...sig(), kind: 'gdacs', level: 'Orange' }] })
    const { container } = render(<StormRollCall now={NOW} />)
    await new Promise((r) => setTimeout(r, 80))
    expect(container.textContent).toBe('')
    expect(await fdb.tasks.count()).toBe(0)
  })
  it('lists each answer, "n of m safe", Call only for silent or needs-help people with a number', async () => {
    h.rows = [
      { person_id: 'p1', status: 'ok', at: '2026-10-24T00:10:00Z' },
      { person_id: 'p2', status: 'ok', at: '2026-10-24T00:11:00Z' },
      { person_id: 'p3', status: 'need_help', at: '2026-10-24T00:12:00Z' }
    ]
    await db.kv.put({ key: ALERTS_KEY, value: [sig()] })
    render(<StormRollCall now={NOW} />)
    expect(await screen.findByText('2 of 5 safe')).toBeTruthy() // 5 people, p1 and p2 ok (hand count)
    const list = screen.getByRole('list', { name: 'Storm check-ins' })
    const rowOf = (name: string) => within(list).getByText(name).closest('li') as HTMLElement
    expect(within(rowOf('You')).getByText('Safe')).toBeTruthy()
    expect(within(rowOf('Papa')).getByText('Safe')).toBeTruthy()
    expect(within(rowOf('Mama')).getByText('Needs help')).toBeTruthy()
    expect(within(rowOf('Ate')).getByText('No answer yet')).toBeTruthy()
    expect(within(rowOf('Ate')).getByRole('link', { name: 'Call Ate' }).getAttribute('href')).toBe('tel:09175550000')
    expect(within(rowOf('Kuya')).getByRole('link', { name: 'Call Kuya' }).getAttribute('href')).toBe('tel:09175551111')
    expect(within(rowOf('Papa')).queryByRole('link')).toBeNull() // safe: no Call
    expect(within(rowOf('You')).queryByRole('link')).toBeNull()
    expect(within(rowOf('Mama')).queryByRole('link')).toBeNull() // needs help but no number saved
  })
  it('the shared checklist shows 4 tasks, made once, and a tap ticks the family task', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [sig()] })
    const a = render(<StormRollCall now={NOW} />)
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(4))
    expect(await fdb.tasks.count()).toBe(4)
    a.unmount()
    render(<StormRollCall now={NOW} />) // second mount
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(4))
    expect(await fdb.tasks.count()).toBe(4)
    expect((await db.outbox.toArray()).filter((o) => o.table === 'family_tasks').length).toBe(4)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fill water containers' }))
    await waitFor(async () => expect((await fdb.tasks.filter((t) => t.title === 'Fill water containers').first())!.done).toBe(true))
  })
})

describe('StormCard: Is everyone safe?', () => {
  it('I am safe and I need help each write the roll call for me, with the storm id', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [sig()] })
    render(<StormCard now={NOW} />)
    expect(await screen.findByRole('heading', { name: 'Is everyone safe?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "I'm safe" }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1))
    expect(h.upsert.mock.calls[0]![0]).toMatchObject({ person_id: 'p1', storm_ref: 'pagasa-tcws-rosal-champi-dampas', status: 'ok' })
    expect(await screen.findByText('Saved. Your family can see you are safe.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'I need help' }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2))
    expect(h.upsert.mock.calls[1]![0]).toMatchObject({ status: 'need_help' })
    expect(await db.outbox.filter((o) => o.table === 'rollcall').count()).toBe(0)
    await waitFor(async () => expect(await fdb.tasks.count()).toBe(4)) // let the checklist finish before the next test clears the tables
  })
  it('the checklist is made once even with the card and the family list both mounted', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [sig()] })
    render(<><StormCard now={NOW} /><StormRollCall now={NOW} /></>)
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(4))
    expect(await fdb.tasks.count()).toBe(4)
    expect(await db.outbox.filter((o) => o.table === 'family_tasks').count()).toBe(4)
  })
})
