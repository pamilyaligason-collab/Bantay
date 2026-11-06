import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ can: null as null | { log: boolean; mood: boolean; reason: string }, activity: [] as { kind: string; startedAt: string }[], self: 'me' as string | null, ready: true, alerts: [] as unknown[], storm: null as { title: string; body: string } | null, water: [] as { ml: number; drunkAt: string }[], warn: false, breaths: [] as { at: string }[], seen: vi.fn((_id: string) => Promise.resolve()), cel: vi.fn((_k: string) => true), goal: 1500, checkIn: vi.fn((_p?: string) => Promise.resolve('ok')) }))
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
vi.mock('../nutrition/hooks', () => ({ NO_WATER: s.empty, useWater: () => (s.arrived ? m.water : s.empty), useGoal: () => ({ waterMl: m.goal }) }))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => ({ id: m.self, ready: m.ready }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => m.self, useActingCan: () => m.can, useActing: () => ({ acting: !!m.can, personId: m.can ? m.self : null, name: m.can ? 'Mama' : '' }) }))
vi.mock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), checkIn: (p?: string) => m.checkIn(p) }))
vi.mock('./NextUp', () => ({ default: () => null, MedsCheck: () => null }))
vi.mock('./PlanToday', () => ({ default: () => null }))
vi.mock('./SelfCare', () => ({ default: () => null }))
vi.mock('../look/celebrate', () => ({ celebrate: (k: string) => m.cel(k) }))
vi.mock('../nutrition/actions', async (orig) => ({ ...(await orig<typeof import('../nutrition/actions')>()), logWater: () => Promise.resolve('ok') }))
import { rowLeaveMs, TICK_MS } from './doneMorph'
import { NUDGE_PLAY_MS, NUDGE_SETTLE_MS, resetNudges } from '../nudge/nudgeDue'
import MyDay from './MyDay'
afterEach(() => { cleanup(); vi.useRealTimers(); resetNudges(); m.warn = false; m.breaths = []; m.activity = []; m.self = 'me'; m.can = null; m.water = []; m.storm = null; m.alerts = []; m.seen.mockClear(); m.cel.mockClear(); m.goal = 1500; vi.unstubAllGlobals(); localStorage.clear(); s.readings = []; s.arrived = true })
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

describe('S22 My day rewards', () => {
  const GLASS = 250
  const glasses = (n: number) => Array.from({ length: n }, () => ({ ml: GLASS, drunkAt: new Date().toISOString() })) // goal 1500 ml = 6 glasses
  const bpToday = () => [{ test: 'bp_systolic', value: 118, takenAt: new Date().toISOString() }]
  const checkedIn = () => [{ kind: 'check-in', startedAt: new Date().toISOString() }]
  const order = () => Array.from(screen.getByTestId('myday').querySelectorAll('[data-testid^="myday-"]')).map((e) => e.getAttribute('data-testid'))
  const phaseOf = (id: string) => screen.getByTestId(id).closest('.td-row')!.getAttribute('data-phase')
  const reduce = () => vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }))

  it('fixed order: blood pressure, water, How are you, then the missed medicine; badges 1 to 3 on the priorities only', () => {
    m.alerts = [miss()]
    render(<MyDay notify={() => undefined} />)
    expect(order().filter((t) => ['myday-bp', 'myday-water', 'myday-checkin', 'myday-missed-ana'].includes(t!))).toEqual(['myday-bp', 'myday-water', 'myday-checkin', 'myday-missed-ana'])
    const badges = (id: string) => screen.getByTestId(id).querySelector('.td-pri')?.textContent
    expect([badges('myday-bp'), badges('myday-water'), badges('myday-checkin'), badges('myday-missed-ana')]).toEqual(['1', '2', '3', undefined])
    expect(screen.getByTestId('myday-bp').querySelector('.td-pri')!.getAttribute('aria-hidden')).toBe('true') // the name stays the title
  })
  it('rows already done on arrival wait in a closed Done today fold with no animation; the button opens it', () => {
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6); m.breaths = [{ at: new Date().toISOString() }] // the breath row counts too
    render(<MyDay notify={() => undefined} />)
    const fold = screen.getByRole('button', { name: /Done today \(4\)/ }) // blood pressure, water, check-in and the breath
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(fold.getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(true)
    expect(panel.querySelectorAll('.td-row[data-phase]').length).toBe(0)
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(Array.from(panel.querySelectorAll('[data-testid^="myday-"]')).map((e) => e.getAttribute('data-testid'))).toEqual(['myday-bp', 'myday-water', 'myday-checkin'])
    expect(screen.queryByTestId('myday-done-card')).toBeNull() // loaded already done: no card, no confetti
    expect(m.cel).not.toHaveBeenCalled()
    expect(screen.getByTestId('myday-prio-done').textContent).toBe('All done')
  })
  it('a row finished on screen ticks and bursts, slides out, then waits in the fold', () => {
    vi.useFakeTimers()
    const { rerender } = render(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-fold')).toBeNull()
    m.activity = checkedIn()
    rerender(<MyDay notify={() => undefined} />)
    expect(phaseOf('myday-checkin')).toBe('tick')
    expect(screen.getByTestId('myday-checkin').querySelectorAll('.td-burst').length).toBe(4)
    expect(screen.getByTestId('myday-checkin').querySelector('.td-tick')).not.toBeNull()
    expect(screen.queryByTestId('myday-fold')).toBeNull() // still in the list while it ticks
    act(() => { vi.advanceTimersByTime(TICK_MS) })
    expect(phaseOf('myday-checkin')).toBe('out')
    act(() => { vi.advanceTimersByTime(rowLeaveMs(false)) })
    expect(screen.getByTestId('myday-checkin').closest('.td-row')!.hasAttribute('data-phase')).toBe(false)
    expect(screen.getByTestId('myday-fold').textContent).toContain('Done today (1)')
    expect(screen.getByTestId('myday-checkin').closest('[hidden]')).not.toBeNull()
  })
  it('water is done at the goal, not on each glass: 5 of 6 stays in the list, the 6th ticks it', () => {
    vi.useFakeTimers()
    m.water = glasses(4)
    const { rerender } = render(<MyDay notify={() => undefined} />)
    m.water = glasses(5)
    rerender(<MyDay notify={() => undefined} />)
    expect(phaseOf('myday-water')).toBeNull()
    expect(screen.getByTestId('myday-water').querySelector('.td-tick')).toBeNull()
    expect(screen.getByTestId('myday-water').textContent).toContain('5 of 6 glasses')
    m.water = glasses(6)
    rerender(<MyDay notify={() => undefined} />)
    expect(phaseOf('myday-water')).toBe('tick')
  })
  it('ML-47: after the glass that reaches the goal, focus never falls to the page and ends on + water; the fold bar and row buttons have distinct names', async () => {
    vi.useFakeTimers()
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(5)
    const { rerender } = render(<MyDay notify={() => undefined} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add a glass of water' })) })
    m.water = glasses(6)
    rerender(<MyDay notify={() => undefined} />)
    expect(phaseOf('myday-water')).toBe('tick')
    const held = () => document.activeElement !== document.body && document.activeElement !== null
    expect(held()).toBe(true) // the tick swapped the plus away: the fold button already holds focus
    for (let t = 0; t < TICK_MS + rowLeaveMs(false) + 50; t += 10) {
      act(() => { vi.advanceTimersByTime(10) })
      expect(held()).toBe(true)
    }
    expect(document.activeElement).toBe(screen.getByTestId('myday-water-add'))
    fireEvent.click(screen.getByTestId('myday-fold')) // fold open: the row's own plus and the bar's differ by name
    expect(screen.getAllByRole('button', { name: 'Add a glass of water' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Add another glass of water' })).toHaveLength(1)
  })
  it('each glass moves the ring but the visible count stays whole rows (ML-40)', () => {
    const dash = () => screen.getByTestId('myday-ring').querySelector('.rg-val')!.getAttribute('stroke-dasharray')
    m.water = glasses(0)
    const { rerender } = render(<MyDay notify={() => undefined} />)
    const before = dash()
    m.water = glasses(3)
    rerender(<MyDay notify={() => undefined} />)
    expect(dash()).not.toBe(before)
    const len = 46 * Math.PI // size 64, stroke 9: r = 23
    const [fill, whole] = dash()!.split(' ').map(Number)
    expect(whole).toBeCloseTo(len, 6)
    expect(fill).toBeCloseTo(len * (3 / 6 / 4), 6) // goal 1500 ml = 6 glasses: half the water share of 1 of 4 rows
    m.goal = 2000
    rerender(<MyDay notify={() => undefined} />)
    expect(Number(dash()!.split(' ')[0])).toBeCloseTo(len * (3 / 8 / 4), 6) // 3 of 8 glasses: 3/32 of the ring
    expect(screen.getByTestId('myday').textContent).toContain('0 of 4 done')
    expect(screen.getByTestId('myday-ring').querySelector('svg')!.getAttribute('aria-label')).toBe('0 of 4 done')
  })
  it('all three priorities finished live: the card shows once, one celebrate call, then the next visit gets the one-line row', () => {
    vi.useFakeTimers()
    m.breaths = [{ at: new Date().toISOString() }]
    const first = render(<MyDay notify={() => undefined} />)
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    first.rerender(<MyDay notify={() => undefined} />)
    const card = screen.getByTestId('myday-done-card')
    expect(card.textContent).toContain('All done for today')
    expect(m.cel).toHaveBeenCalledTimes(1)
    expect(m.cel).toHaveBeenCalledWith('allDone')
    expect(card.textContent).not.toMatch(/in a row/) // no streak is computed for this, so none is shown
    expect(screen.queryByTestId('myday-prio-done')).toBeNull()
    act(() => { vi.advanceTimersByTime(TICK_MS + rowLeaveMs(false)) })
    first.unmount()
    render(<MyDay notify={() => undefined} />) // same day, opened again
    expect(screen.queryByTestId('myday-done-card')).toBeNull()
    expect(screen.getByTestId('myday-prio-done').textContent).toBe('All done')
    expect(m.cel).toHaveBeenCalledTimes(1)
  })
  it('priorities done with an extra left: the card says so, its button opens the fold, later visits get the Priorities done row', () => {
    vi.useFakeTimers()
    m.alerts = [miss()]
    m.breaths = [{ at: new Date().toISOString() }]
    const r = render(<MyDay notify={() => undefined} />)
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    r.rerender(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-done-card').textContent).toContain('1 extra left: Ana missed a medicine at 8:00 AM')
    act(() => { vi.advanceTimersByTime(TICK_MS + rowLeaveMs(false)) })
    fireEvent.click(screen.getByRole('button', { name: 'See what you logged' }))
    expect(screen.getByTestId('myday-fold').getAttribute('aria-expanded')).toBe('true')
    r.unmount()
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-prio-done').textContent).toBe('Priorities done1 extra left: Ana missed a medicine at 8:00 AM')
  })
  it('the extra is named with its own title and time like the board, and left generic when it has no time', () => {
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6); m.breaths = [{ at: new Date().toISOString() }]
    m.alerts = [miss()]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-prio-done').textContent).toBe('Priorities done1 extra left: Ana missed a medicine at 8:00 AM')
    cleanup()
    m.alerts = [miss({ ref: 'ana' })]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-prio-done').textContent).toBe('Priorities done1 extra left')
  })
  it('water past the goal folds with the rest, but its + water button stays on the Done today bar', () => {
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(7)
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByRole('button', { name: /Done today \(3\)/ })).toBeTruthy()
    expect(screen.getByTestId('myday-water').closest('[hidden]')).not.toBeNull()
    const plus = screen.getByTestId('myday-water-add')
    expect(plus.closest('[hidden]')).toBeNull()
    expect(plus.closest('.td-foldbar')).not.toBeNull()
    expect(plus.getAttribute('aria-label')).toBe('Add another glass of water')
    expect(plus.textContent).toBe('+ water')
  })
  it('under the goal there is no + water button on the bar', () => {
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(3)
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-water-add')).toBeNull()
    expect(screen.getByTestId('myday-water').closest('[hidden]')).toBeNull()
  })
  it('a charging low battery in the evening folds into Done today; discharging stays in the list', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 5, 20, 0))
    const bat = (charging: boolean) => vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { getBattery: () => Promise.resolve({ level: 0.2, charging, addEventListener: () => undefined, removeEventListener: () => undefined }) }))
    bat(false)
    const a = render(<MyDay notify={() => undefined} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('myday-battery').closest('[hidden]')).toBeNull()
    a.unmount()
    bat(true)
    render(<MyDay notify={() => undefined} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('myday-battery').closest('[hidden]')).not.toBeNull()
    expect(screen.getByTestId('myday-fold').textContent).toContain('Done today (1)')
  })
  it('a breath done earlier today sits in the fold; with none the row stays in the list', () => {
    m.breaths = [{ at: new Date().toISOString() }]
    render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-fold').textContent).toContain('Done today (1)')
  })
  it('blood pressure finished on its own screen and back (remount): the card and the confetti come once, not again on the next remount', () => {
    vi.useFakeTimers()
    m.activity = checkedIn(); m.water = glasses(6); m.breaths = [{ at: new Date().toISOString() }]
    const a = render(<MyDay notify={() => undefined} />) // blood pressure still open on this visit
    expect(screen.queryByTestId('myday-done-card')).toBeNull()
    a.unmount()
    s.readings = bpToday() // logged on #health/metric/bp_systolic, then back to Today
    const b = render(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-done-card').textContent).toContain('All done for today')
    expect(m.cel).toHaveBeenCalledTimes(1)
    b.unmount()
    render(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-done-card')).toBeNull()
    expect(m.cel).toHaveBeenCalledTimes(1)
  })
  it('the card title is Priorities done while an extra is left, and All done for today only when every row is done', () => {
    vi.useFakeTimers()
    m.alerts = [miss()]
    const r = render(<MyDay notify={() => undefined} />)
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    r.rerender(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-done-card').querySelector('.td-done-t')!.textContent).toBe('Priorities done')
  })
  it('a row finished from the keyboard: focus moves to the next open row (blood pressure Log), not lost', async () => {
    vi.useFakeTimers()
    const r = render(<MyDay notify={() => undefined} />)
    const btn = screen.getByRole('button', { name: "I'm OK" })
    btn.focus()
    await act(async () => { fireEvent.click(btn) })
    expect(m.checkIn).toHaveBeenCalledTimes(1)
    m.activity = checkedIn()
    r.rerender(<MyDay notify={() => undefined} />)
    expect(document.activeElement).toBe(screen.getByTestId('myday-bp').querySelector('a'))
    expect(screen.getByTestId('myday-said').textContent).toBe('Check-in done')
  })
  it('the last open row done: focus lands on the Done today button, and the name is announced', async () => {
    vi.useFakeTimers()
    s.readings = bpToday(); m.water = glasses(6)
    const r = render(<MyDay notify={() => undefined} />)
    const btn = screen.getByRole('button', { name: "I'm OK" })
    btn.focus()
    await act(async () => { fireEvent.click(btn) })
    m.activity = checkedIn()
    r.rerender(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-said').textContent).toBe('Check-in done')
    act(() => { vi.advanceTimersByTime(TICK_MS + rowLeaveMs(false)) })
    expect(document.activeElement).toBe(screen.getByTestId('myday-fold'))
  })
  it('the card is once per local day: the next morning a new finish shows it again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 5, 23, 30))
    const a = render(<MyDay notify={() => undefined} />)
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    a.rerender(<MyDay notify={() => undefined} />)
    expect(m.cel).toHaveBeenCalledTimes(1)
    a.unmount()
    vi.setSystemTime(new Date(2026, 10, 6, 0, 30))
    s.readings = []; m.activity = []; m.water = []
    const b = render(<MyDay notify={() => undefined} />)
    s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    b.rerender(<MyDay notify={() => undefined} />)
    expect(screen.getByTestId('myday-done-card')).toBeTruthy()
    expect(m.cel).toHaveBeenCalledTimes(2)
  })
  it('before the live queries answer nothing counts as just done (unknown is not done)', () => {
    vi.useFakeTimers()
    s.arrived = false
    const r = render(<MyDay notify={() => undefined} />)
    s.arrived = true; s.readings = bpToday(); m.activity = checkedIn(); m.water = glasses(6)
    r.rerender(<MyDay notify={() => undefined} />)
    expect(screen.queryByTestId('myday-done-card')).toBeNull()
    expect(m.cel).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.td-row[data-phase]').length).toBe(0)
  })
  it('reduced motion: no burst, the row only fades (no slide phase), same end state', () => {
    vi.useFakeTimers()
    reduce()
    const { rerender } = render(<MyDay notify={() => undefined} />)
    m.activity = checkedIn()
    rerender(<MyDay notify={() => undefined} />)
    expect(phaseOf('myday-checkin')).toBe('out')
    expect(document.querySelectorAll('.td-burst').length).toBe(0)
    act(() => { vi.advanceTimersByTime(rowLeaveMs(true)) })
    expect(screen.getByTestId('myday-checkin').closest('.td-row')!.hasAttribute('data-phase')).toBe(false)
    expect(screen.getByTestId('myday-fold').textContent).toContain('Done today (1)')
  })
})
