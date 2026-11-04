import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ can: null as null | { log: boolean; mood: boolean; reason: string }, activity: [] as { kind: string; startedAt: string }[], self: 'me' as string | null, ready: true, alerts: [] as unknown[], storm: null as { title: string; body: string } | null, water: [] as { ml: number; drunkAt: string }[], seen: vi.fn((_id: string) => Promise.resolve()) }))
vi.mock('../notify/useAlerts', () => ({ useAlertRows: () => m.alerts }))
vi.mock('../notify/store', () => ({ markSeen: (id: string) => m.seen(id) }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [{ id: 'ana', name: 'Ana Reyes' }], selfId: 'me' }) }))
vi.mock('./QuickLog', () => ({ MoodSheet: () => <div role="dialog" aria-label="How are you feeling?" />, MoreSheet: () => <div role="dialog" aria-label="More" /> }))
vi.mock('./useNext', () => ({ useNext: () => ({ item: { kind: 'calm', key: 'calm' }, review: 0 }) }))
vi.mock('./useStorm', () => ({ useStorm: () => m.storm }))
vi.mock('./MyWeek', () => ({ useWeekData: () => ({ readings: [] }) }))
vi.mock('../health/useActivity', () => ({ useActivity: () => m.activity }))
vi.mock('../nutrition/hooks', () => ({ useWater: () => m.water, useGoal: () => ({ waterMl: 1500 }) }))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => ({ id: m.self, ready: m.ready }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => m.self, useActingCan: () => m.can }))
vi.mock('./NextUp', () => ({ default: () => null, MedsCheck: () => null }))
vi.mock('./PlanToday', () => ({ default: () => null }))
vi.mock('./SelfCare', () => ({ default: () => null }))
import MyDay from './MyDay'
afterEach(() => { cleanup(); m.can = null; m.water = []; m.storm = null; m.alerts = []; m.seen.mockClear() })
const manilaDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' }) // a miss from an earlier day is not a row, so the ref must always be today
const miss = (o: object = {}) => ({ id: 'a1', personId: 'ana', kind: 'dose_missed', template: 'dose_missed', ref: `ana:${manilaDay()}:08:00`, createdAt: '2026-11-02T01:00:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-09T00:00:00Z', ...o })

describe('MyDay I am OK row', () => {
  it('shows the button until a check-in is logged today, then a done label', () => {
    m.activity = []
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    unmount()
    m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByRole('button', { name: "I'm OK" })).toBeNull()
    expect(screen.getByText('Checked in')).toBeTruthy()
  })
  it("acting without the mood right: the I'm OK button is locked as View only (moved here from Family, F4)", () => {
    m.activity = []; m.self = 'me'; m.can = { log: true, mood: false, reason: 'Mama has not shared mood.' }
    render(<MyDay notify={() => undefined} />)
    expect((screen.getByRole('button', { name: "I'm OK, view only" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Mama has not shared mood/)).toBeTruthy()
  })
  it("Unwell writes mood-low and check-in: the row says Checked in, never You're OK", () => {
    m.self = 'me'
    const at = new Date().toISOString()
    m.activity = [{ kind: 'mood-low', startedAt: at }, { kind: 'check-in', startedAt: at }]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByText('Checked in')).toBeTruthy()
    expect(screen.queryByText("You're OK")).toBeNull()
  })
  it("crossing midnight brings the I'm OK button back", () => {
    vi.useFakeTimers()
    try {
      m.self = 'me'
      vi.setSystemTime(new Date(2026, 5, 10, 23, 59))
      m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
      const { rerender } = render(<MyDay notify={() => undefined} />)
      expect(screen.getByText('Checked in')).toBeTruthy()
      vi.setSystemTime(new Date(2026, 5, 11, 0, 1))
      rerender(<MyDay notify={() => undefined} />)
      expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    } finally { vi.useRealTimers() }
  })
  it('signed out, the row does not promise the family will know, and says nothing while the lookup is still running', () => {
    m.activity = []; m.self = null; m.ready = false
    const { rerender } = render(<MyDay notify={() => undefined} />)
    expect(screen.queryByText('Sign in to let the family know')).toBeNull()
    m.ready = true
    rerender(<MyDay notify={() => undefined} />)
    expect(screen.queryByText('Lets the family know you are fine')).toBeNull()
    expect(screen.getByText('Sign in to let the family know')).toBeTruthy()
  })

  it('a missed dose of someone else is a row with the first name only, counted in the ring, and Open marks it seen', () => {
    const base = render(<MyDay notify={() => undefined} />)
    const total = (n: HTMLElement) => /of (\d+) done/.exec(n.querySelector('[role="img"]')!.getAttribute('aria-label')!)![1]
    const before = Number(total(base.container))
    expect(screen.queryByTestId('myday-missed-ana')).toBeNull()
    expect(screen.getByText('All yours today')).toBeTruthy()
    base.unmount()
    m.alerts = [miss(), miss({ id: 'a0', ref: `ana:${manilaDay()}:07:00`, createdAt: '2026-11-02T00:00:00Z' })]
    const r = render(<MyDay notify={() => undefined} />)
    const row = screen.getByTestId('myday-missed-ana')
    expect(row.textContent).toContain('Ana missed a medicine')
    expect(row.querySelector('.rw-sub')!.textContent).toBe('8:00 AM') // time only, no stray Open
    expect(row.textContent).not.toMatch(/Losartan|Reyes/)
    expect(Number(total(r.container))).toBe(before + 1)
    expect(screen.getByText('Ana needs you')).toBeTruthy()
    const open = screen.getByRole('link', { name: 'Open Ana' })
    expect(open.getAttribute('href')).toBe('#family/people/ana')
    fireEvent.click(open)
    expect(m.seen).toHaveBeenCalledWith('a1')
    expect(m.seen).toHaveBeenCalledWith('a0') // every unseen slot of that person, not only the newest
  })
  it('a missed dose with no slot time says so, and never invents a time', () => {
    m.alerts = [miss({ id: 'a9', ref: null, createdAt: new Date().toISOString() })]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-missed-ana').querySelector('.rw-sub')!.textContent).toBe('Dose not marked yet')
  })
  it('a seen or other-kind alert makes no row', () => {
    m.alerts = [miss({ seenAt: '2026-11-02T02:00:00Z' }), miss({ id: 'a2', kind: 'sos', template: 'family_sos' })]
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-missed-ana')).toBeNull()
  })
  it('the How are you row opens the mood faces; Log something else opens More', () => {
    render(<MyDay notify={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'How are you? Pick a face' }))
    expect(screen.getByRole('dialog', { name: 'How are you feeling?' })).toBeTruthy()
    cleanup()
    render(<MyDay notify={() => undefined} />)
    fireEvent.click(screen.getByTestId('myday-more'))
    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy()
  })
  it('the Log something else row sits in a full-width wrapper that owns the divider, so the line never stops short', () => {
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-more').parentElement!.className).toBe('td-more-wrap')
  })
  it('the Water plus is a button at the row start', () => {
    render(<MyDay notify={() => undefined} />)
    const plus = screen.getByRole('button', { name: 'Add a glass of water' })
    expect(plus.nextElementSibling?.textContent).toContain('Water')
  })
})

describe('MyDay Water count', () => {
  it('counts today only: 6 glasses yesterday and 2 today read 2', () => {
    const t = new Date(), y = new Date(t.getTime() - 86_400_000)
    m.water = [...Array(6).fill(0).map(() => ({ ml: 250, drunkAt: y.toISOString() })), ...Array(2).fill(0).map(() => ({ ml: 250, drunkAt: t.toISOString() }))]
    render(<MyDay notify={() => undefined} />)
    expect(document.querySelector('.td-todo-count')!.textContent).toBe('2 glasses today')
  })
})

describe('MyDay storm wording', () => {
  it('a nearby cyclone makes the How are you? row ask Is everyone safe?, and the sheet still opens from it', () => {
    m.activity = []
    const calm = render(<MyDay notify={() => undefined} />)
    expect(calm.getByTestId('myday-checkin').textContent).toContain('How are you?')
    expect(calm.queryByText('Is everyone safe?')).toBeNull()
    calm.unmount()
    m.storm = { title: 'Tropical Cyclone PEPITO is near', body: 'Orange alert, 300 km away' }
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-checkin').textContent).toContain('Is everyone safe?')
    fireEvent.click(screen.getByRole('button', { name: 'How are you? Pick a face' }))
    expect(screen.getByRole('dialog', { name: 'How are you feeling?' })).toBeTruthy()
  })
})
