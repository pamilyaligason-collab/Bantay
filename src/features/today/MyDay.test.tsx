import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ can: null as null | { log: boolean; mood: boolean; reason: string }, activity: [] as { kind: string; startedAt: string }[], self: 'me' as string | null, ready: true, alerts: [] as unknown[], storm: null as { title: string; body: string } | null, water: [] as { ml: number; drunkAt: string }[], warn: false, breaths: [] as { at: string }[], seen: vi.fn((_id: string) => Promise.resolve()) }))
// s.arrived false = the live queries have not answered yet (the hooks hand back their shared empty first value)
const s = vi.hoisted(() => ({ empty: [] as never[], readings: [] as { test: string; value: number; takenAt: string }[], arrived: true }))
vi.mock('../notify/useAlerts', () => ({ useAlertRows: () => m.alerts }))
vi.mock('../notify/store', () => ({ markSeen: (id: string) => m.seen(id) }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [{ id: 'ana', name: 'Ana Reyes' }], selfId: 'me' }) }))
vi.mock('./QuickLog', () => ({ MoodSheet: () => <div role="dialog" aria-label="How are you feeling?" />, MoreSheet: () => <div role="dialog" aria-label="More" /> }))
vi.mock('./useNext', () => ({ useNext: () => ({ item: { kind: 'calm', key: 'calm' }, review: 0 }) }))
vi.mock('./WarningCard', () => ({ useWarnings: () => ({ onScreen: m.warn }) }))
vi.mock('../shell/useKv', () => ({ useKv: () => [m.breaths, () => undefined, true] })) // the only kv MyDay reads is selfcare.log
vi.mock('./useStorm', () => ({ useStorm: () => m.storm }))
vi.mock('./MyWeek', () => ({ useWeekData: () => ({ readings: s.readings, loaded: s.arrived }) }))
vi.mock('../health/useActivity', () => ({ NO_ACTIVITY: s.empty, useActivity: () => (s.arrived ? m.activity : s.empty) }))
vi.mock('../nutrition/hooks', () => ({ NO_WATER: s.empty, useWater: () => (s.arrived ? m.water : s.empty), useGoal: () => ({ waterMl: 1500 }) }))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => ({ id: m.self, ready: m.ready }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => m.self, useActingCan: () => m.can, useActing: () => ({ acting: !!m.can, personId: m.can ? m.self : null, name: m.can ? 'Mama' : '' }) }))
vi.mock('./NextUp', () => ({ default: () => null, MedsCheck: () => null }))
vi.mock('./PlanToday', () => ({ default: () => null }))
vi.mock('./SelfCare', () => ({ default: () => null }))
import { NUDGE_PLAY_MS, NUDGE_SETTLE_MS, resetNudges } from '../nudge/nudgeDue'
import MyDay from './MyDay'
afterEach(() => { cleanup(); vi.useRealTimers(); resetNudges(); m.warn = false; m.breaths = []; m.activity = []; m.self = 'me'; m.can = null; m.water = []; m.storm = null; m.alerts = []; m.seen.mockClear(); s.readings = []; s.arrived = true })
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
  it('viewing as someone who cannot be logged for: the blood pressure Log is a disabled button, not a link, and the header names her', () => {
    m.activity = []; m.self = 'me'; m.can = { log: false, mood: false, reason: 'Mama has her own sign-in, so only Mama can log.' }
    render(<MyDay notify={() => undefined} />)
    expect((screen.getByRole('button', { name: 'Log blood pressure, view only' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('link', { name: 'Log' })).toBeNull()
    expect(screen.getByText("Mama's day")).toBeTruthy()
    expect(screen.queryByText('All yours today')).toBeNull()
  })
  it("D-128: viewing as someone, the admin's own missed-dose alert is no row, no count and no needs line; not viewing it is all three", () => {
    m.activity = []; m.self = 'me'; m.alerts = [miss()]; m.can = { log: false, mood: false, reason: 'Mama has her own sign-in, so only Mama can log.' }
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-missed-ana')).toBeNull()
    expect(screen.getByText("Mama's day")).toBeTruthy()
    expect(screen.queryByText(/needs you/)).toBeNull()
    const viewedTotal = screen.getByTestId('myday').querySelector('.td-day-t')!.textContent
    unmount()
    m.can = null
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-missed-ana')).toBeTruthy()
    expect(screen.getByText('Ana needs you')).toBeTruthy()
    expect(screen.getByTestId('myday').querySelector('.td-day-t')!.textContent).not.toBe(viewedTotal) // the missed row counts when it shows
  })
  it("selfcare.log is not by person: the admin's own breath today counts for the admin, not in the viewed person's ring", () => {
    const done = () => Number(/(\d+) of \d+ done/.exec(screen.getByTestId('myday').textContent ?? '')![1])
    m.activity = []; m.self = 'me'
    const none = (() => { const u = render(<MyDay notify={() => undefined} />); const n = done(); u.unmount(); return n })()
    m.breaths = [{ at: new Date().toISOString() }]
    const own = (() => { const u = render(<MyDay notify={() => undefined} />); const n = done(); u.unmount(); return n })()
    expect(own, 'not viewing: the breath counts').toBe(none + 1)
    m.can = { log: false, mood: false, reason: 'Mama has her own sign-in, so only Mama can log.' }
    render(<MyDay notify={() => undefined} />)
    expect(done(), 'viewing: the breath is not hers').toBe(none)
  })
  it('the lock line leads with Look only, the same words as the bar', () => {
    m.activity = []; m.self = 'me'; m.can = { log: false, mood: false, reason: 'Mama has her own sign-in, so only Mama can log.' }
    const { container } = render(<MyDay notify={() => undefined} />)
    expect(container.querySelector('.td-lock-why')!.textContent).toBe('Look only. Mama has her own sign-in, so only Mama can log.')
  })
  it('not viewing, or viewing with logging allowed: Log stays a link and the header says All yours today', () => {
    m.activity = []; m.self = 'me'; m.can = null
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Log' })).toBeTruthy()
    expect(screen.getByText('All yours today')).toBeTruthy()
    unmount()
    m.can = { log: true, mood: true, reason: '' }
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Log' })).toBeTruthy()
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

describe('D-125 nudges on My day', () => {
  const pills = () => Array.from(screen.getByTestId('myday').querySelectorAll('.nd-due')).map((e) => e.closest('[data-testid]')!.getAttribute('data-testid'))
  const moving = () => Array.from(screen.getByTestId('myday').querySelectorAll('[data-nudge="move"]')).map((e) => e.getAttribute('data-testid'))
  it('a still Due pill sits on blood pressure and the check-in; the check-in button says Due as its description and keeps its name', () => {
    render(<MyDay notify={() => undefined} />)
    expect(pills()).toEqual(expect.arrayContaining(['myday-bp', 'myday-checkin']))
    expect(screen.getByTestId('myday-bp').querySelector('.nd-due')!.textContent).toBe('Due')
    const b = screen.getByRole('button', { name: 'How are you? Pick a face' })
    expect(document.getElementById(b.getAttribute('aria-describedby')!)!.textContent).toBe('Due')
  })
  it('a check-in done today clears its pill; the other rows are untouched', () => {
    m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(pills()).not.toContain('myday-checkin')
    expect(pills()).toContain('myday-bp')
  })
  it('only the blood pressure row moves, after the settle time, once per app open', () => {
    vi.useFakeTimers()
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(moving()).toEqual([])
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(moving()).toEqual(['myday-bp'])
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS) }) // the move has played out
    unmount()
    render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(moving()).toEqual([])
    expect(pills()).toContain('myday-bp') // the pill stays
  })
  it('view only: no pill and no mover', () => {
    vi.useFakeTimers()
    m.can = { log: false, mood: false, reason: 'Mama has her own sign-in, so only Mama can log.' }
    render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(pills()).toEqual([])
    expect(moving()).toEqual([])
  })
  it('viewing with logging allowed but no mood: Log is nudged, the check-in is not', () => {
    m.can = { log: true, mood: false, reason: '' }
    render(<MyDay notify={() => undefined} />)
    expect(pills()).toContain('myday-bp')
    expect(pills()).not.toContain('myday-checkin')
  })
  it('during a warning, or a storm, none', () => {
    vi.useFakeTimers()
    m.warn = true
    const { unmount } = render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(pills()).toEqual([])
    expect(moving()).toEqual([])
    unmount()
    m.warn = false
    m.storm = { title: 'Storm Sample is near', body: '200 km away' }
    render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(pills()).toEqual([])
    expect(moving()).toEqual([])
  })
  it('the missed-dose row never carries a pill or moves', () => {
    vi.useFakeTimers()
    m.alerts = [miss()]
    render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(screen.getByTestId('myday-missed-ana').querySelector('.nd-due')).toBeNull()
    expect(screen.getByTestId('myday-missed-ana').getAttribute('data-nudge')).toBeNull()
  })
  it('water is due from 2 PM under half the goal, and only then', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 5, 13, 59))
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(pills()).not.toContain('myday-water')
    unmount()
    vi.setSystemTime(new Date(2026, 10, 5, 14, 0))
    m.water = [{ ml: 700, drunkAt: new Date(2026, 10, 5, 9).toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(pills()).toContain('myday-water')
  })
})

describe('D-125 nudges on My day: the mover, the first paint, midnight', () => {
  const moving = () => Array.from(screen.getByTestId('myday').querySelectorAll('[data-nudge="move"]')).map((e) => e.getAttribute('data-testid'))
  const pills = () => Array.from(screen.getByTestId('myday').querySelectorAll('.nd-due')).map((e) => e.closest('[data-testid]')!.getAttribute('data-testid'))
  const bpToday = () => [{ test: 'bp_systolic', value: 118, takenAt: new Date().toISOString() }]
  it('before the live queries answer: no pill and no mover; unknown is not due', () => {
    vi.useFakeTimers()
    s.arrived = false
    render(<MyDay notify={() => undefined} />)
    expect(pills()).toEqual([])
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS + 100) })
    expect(moving()).toEqual([])
  })
  it('the check-in is the mover when blood pressure is fine; the move ends and the state clears after 1.2 s, so a re-render cannot replay it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 5, 9, 0)) // morning: water is due only from 14:00
    s.readings = bpToday()
    const { rerender } = render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(moving()).toEqual(['myday-checkin'])
    act(() => { vi.advanceTimersByTime(NUDGE_PLAY_MS) })
    expect(moving()).toEqual([])
    expect(pills()).toEqual(['myday-checkin']) // the pill stays
    rerender(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(moving()).toEqual([])
  })
  it('water is the mover after 2 PM when blood pressure and the check-in are fine: the plus tile carries the move', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 5, 15, 0))
    s.readings = bpToday()
    m.activity = [{ kind: 'check-in', startedAt: new Date().toISOString() }]
    render(<MyDay notify={() => undefined} />)
    act(() => { vi.advanceTimersByTime(NUDGE_SETTLE_MS) })
    expect(moving()).toEqual(['myday-water'])
    expect(screen.getByTestId('myday-water').querySelector('.td-todo-plus')).not.toBeNull() // the e2e proves .td-todo-plus::after animates
  })
  it('23:30: a check-in saved at 23:10 is done; 00:30 the next day it is due again (local day)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 5, 23, 30))
    m.activity = [{ kind: 'check-in', startedAt: new Date(2026, 10, 5, 23, 10).toISOString() }]
    const { unmount } = render(<MyDay notify={() => undefined} />)
    expect(pills()).not.toContain('myday-checkin')
    unmount()
    vi.setSystemTime(new Date(2026, 10, 6, 0, 30))
    render(<MyDay notify={() => undefined} />)
    expect(pills()).toContain('myday-checkin')
  })
  it('00:30: a check-in saved at 00:10 the same day is done; water is not due before 2 PM', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 6, 0, 30))
    m.activity = [{ kind: 'check-in', startedAt: new Date(2026, 10, 6, 0, 10).toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(pills()).not.toContain('myday-checkin')
    expect(pills()).not.toContain('myday-water')
  })
})
