import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { disableType, enableType, getState, type HealthBridge, normalise, type RawSample, type SensorType, syncAll } from './health'
import QuickWalk from './QuickWalk'
import SensorSettings from './SensorSettings'
import { summarise } from './MovementCard'

const S = (over: Partial<RawSample> = {}): RawSample => ({ startDate: '2026-10-01T06:00:00.000Z', endDate: '2026-10-01T06:10:00.000Z', value: 500, ...over })

function fake(over: Partial<HealthBridge> & { data?: Partial<Record<SensorType, RawSample[]>> } = {}): HealthBridge & { request: ReturnType<typeof vi.fn> } {
  const { data = {}, ...rest } = over
  return {
    platform: 'android',
    isAvailable: async () => true,
    request: vi.fn(async () => true),
    granted: async () => true,
    read: async (t) => data[t] ?? [],
    ...rest
  } as HealthBridge & { request: ReturnType<typeof vi.fn> }
}

beforeEach(async () => {
  await Promise.all([db.kv.clear(), db.outbox.clear(), ldb.activity.clear(), hdb.readings.clear(), hdb.people.clear()])
})
afterEach(cleanup)

describe('normalise', () => {
  it('steps become one activity each, with minutes', () => {
    const n = normalise('steps', [S(), S({ value: 0 })], 'p', 'health-connect')
    expect(n.activities).toEqual([{ personId: 'p', kind: 'steps', minutes: 10, steps: 500, startedAt: '2026-10-01T06:00:00.000Z', source: 'health-connect' }])
  })
  it('sleep counts only asleep stages and skips awake or in-bed samples', () => {
    const staged = S({ value: 480, stages: [{ stage: 'awake', durationMinutes: 30 }, { stage: 'deep', durationMinutes: 90 }, { stage: 'rem', durationMinutes: 60 }] })
    expect(normalise('sleep', [staged], 'p', 'health-connect').activities[0]).toMatchObject({ kind: 'sleep', minutes: 150, steps: null })
    expect(normalise('sleep', [S({ value: 60, sleepState: 'inBed' })], 'p', 'healthkit').activities).toEqual([])
    expect(normalise('sleep', [S({ value: 420 })], 'p', 'health-connect').activities[0]?.minutes).toBe(420)
  })
  it('heart rate keeps one reading per 15 minutes', () => {
    const hr = [0, 2, 14, 16].map((m) => S({ startDate: new Date(Date.UTC(2026, 9, 1, 6, m)).toISOString(), value: 70 + m }))
    expect(normalise('heartRate', hr, 'p', 'healthkit').readings.map((r) => r.value)).toEqual([70, 86])
  })
  it('blood pressure becomes systolic and diastolic readings the Health screen already knows', () => {
    const r = normalise('bloodPressure', [S({ value: 0, systolic: 128.4, diastolic: 82 })], 'p', 'health-connect').readings
    expect(r.map((x) => [x.test, x.value, x.unit])).toEqual([['bp_systolic', 128, 'mmHg'], ['bp_diastolic', 82, 'mmHg']])
  })
  it('drops samples with bad dates', () => {
    expect(normalise('steps', [S({ startDate: 'nope' })], 'p', 'healthkit').activities).toEqual([])
  })
})

describe('permissions', () => {
  it('asks the OS for exactly the one type being turned on', async () => {
    const b = fake()
    expect(await enableType('sleep', b)).toBe('on')
    expect(b.request).toHaveBeenCalledTimes(1)
    expect(b.request).toHaveBeenCalledWith('sleep')
    expect((await getState()).enabled).toEqual(['sleep'])
  })
  it('permission denied: type stays off, nothing is read or logged', async () => {
    const read = vi.fn(async () => [S()])
    const b = fake({ request: vi.fn(async () => false), read })
    expect(await enableType('steps', b)).toBe('denied')
    expect((await getState()).enabled).toEqual([])
    await syncAll(b, 'p')
    expect(read).not.toHaveBeenCalled()
    expect(await ldb.activity.count()).toBe(0)
  })
  it('a plugin that throws on request counts as denied', async () => {
    expect(await enableType('steps', fake({ request: vi.fn(async () => { throw new Error('x') }) }))).toBe('denied')
  })
  it('web has no health store: unavailable, never prompts', async () => {
    const b = fake({ platform: 'web' })
    expect(await enableType('steps', b)).toBe('unavailable')
    expect(b.request).not.toHaveBeenCalled()
  })
  it('access revoked in the OS switches the type off on the next sync', async () => {
    const b = fake({ data: { steps: [S()] } })
    await enableType('steps', b)
    await syncAll(b, 'p')
    const res = await syncAll(fake({ granted: async () => false, data: { steps: [S({ startDate: '2026-10-02T06:00:00.000Z', endDate: '2026-10-02T06:10:00.000Z' })] } }), 'p')
    expect(res.byType.steps).toBe('revoked')
    expect((await getState()).enabled).toEqual([])
    expect(await ldb.activity.count()).toBe(1)
  })
  it('turning a type off keeps old data and stops reading', async () => {
    const b = fake({ data: { steps: [S()] } })
    await enableType('steps', b)
    await disableType('steps')
    expect((await syncAll(b, 'p')).added).toBe(0)
  })
})

describe('sync', () => {
  it('repeated syncs and overlapping reads never double count, and write through the outbox', async () => {
    const data = { steps: [S(), S({ startDate: '2026-10-01T07:00:00.000Z', endDate: '2026-10-01T07:05:00.000Z', value: 300 })], bloodPressure: [S({ systolic: 120, diastolic: 80 })] }
    const b = fake({ data })
    await enableType('steps', b)
    await enableType('bloodPressure', b)
    const first = await syncAll(b, 'p')
    const second = await syncAll(b, 'p')
    await syncAll(b, 'p')
    expect(first.added).toBe(4)
    expect(second.added).toBe(0)
    expect(await ldb.activity.count()).toBe(2)
    expect(await hdb.readings.count()).toBe(2)
    expect((await db.outbox.toArray()).map((r) => r.table).sort()).toEqual(['activity', 'activity', 'readings', 'readings'])
    expect((await ldb.activity.toArray()).every((a) => a.source === 'health-connect')).toBe(true)
  })
  it('iOS rows are tagged healthkit', async () => {
    const b = fake({ platform: 'ios', data: { steps: [S()] } })
    await enableType('steps', b)
    await syncAll(b, 'p')
    expect((await ldb.activity.toArray())[0]?.source).toBe('healthkit')
  })
  it('concurrent calls share one run', async () => {
    const read = vi.fn(async () => [S()])
    const b = fake({ read })
    await enableType('steps', b)
    const [a, c] = await Promise.all([syncAll(b, 'p'), syncAll(b, 'p')])
    expect(a).toBe(c)
    expect(read).toHaveBeenCalledTimes(1)
    expect(await ldb.activity.count()).toBe(1)
  })
  it('one type failing does not stop the others', async () => {
    const b = fake({ read: async (t) => { if (t === 'steps') throw new Error('boom'); return [S({ value: 0, systolic: 118, diastolic: 76 })] } })
    await enableType('steps', b)
    await enableType('bloodPressure', b)
    const r = await syncAll(b, 'p')
    expect(r.byType).toEqual({ steps: 'error', bloodPressure: 'ok' })
    expect(await hdb.readings.count()).toBe(2)
  })
  it('uses the first person when none is given', async () => {
    await hdb.people.put({ id: 'lola', name: 'Lola' })
    const b = fake({ data: { steps: [S()] } })
    await enableType('steps', b)
    await syncAll(b)
    expect((await ldb.activity.toArray())[0]?.personId).toBe('lola')
  })
})

describe('no notification path', () => {
  it('syncing and logging never touch the Notification API or the service worker', async () => {
    const ctor = vi.fn()
    vi.stubGlobal('Notification', ctor)
    const b = fake({ data: { steps: [S()], heartRate: [S({ value: 80 })] } })
    await enableType('steps', b)
    await enableType('heartRate', b)
    await syncAll(b, 'p')
    render(<QuickWalk native={false} />)
    fireEvent.click(screen.getByRole('button', { name: '10 min' }))
    await waitFor(() => expect(ldb.activity.count()).resolves.toBe(2))
    expect(ctor).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('QuickWalk', () => {
  it('logs exactly once per tap, as manual, with the right minutes', async () => {
    render(<QuickWalk native={false} />)
    fireEvent.click(screen.getByRole('button', { name: '20 min' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('20 minutes'))
    const rows = await ldb.activity.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'walk', minutes: 20, steps: null, source: 'manual' })
    expect(await db.outbox.count()).toBe(1)
  })
  it('a rapid double tap still logs once', async () => {
    render(<QuickWalk native={false} />)
    const b = screen.getByRole('button', { name: '30 min' })
    fireEvent.click(b)
    fireEvent.click(b)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('30 minutes'))
    expect(await ldb.activity.count()).toBe(1)
  })
  it('custom minutes work and nonsense is refused', async () => {
    render(<QuickWalk native={false} />)
    const input = screen.getByLabelText('Other number of minutes')
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Log' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(input, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('35 minutes'))
    expect((await ldb.activity.toArray()).map((a) => a.minutes)).toEqual([35])
  })
  it('is hidden in the app once steps sync is on, shown while it is off', async () => {
    const { container } = render(<QuickWalk native />)
    expect(container.textContent).toContain('Did you walk today?')
    cleanup()
    await db.kv.put({ key: 'sensors.state', value: { enabled: ['steps'], cursor: {} } })
    const r = render(<QuickWalk native />)
    await waitFor(() => expect(r.container.textContent).toBe(''))
  })
})

describe('SensorSettings', () => {
  it('explains itself on the web and has no switches', () => {
    render(<SensorSettings native={false} />)
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.getByText(/need the Bantay app/)).toBeTruthy()
  })
  it('all switches start off and each one prompts only for itself', async () => {
    const b = fake()
    render(<SensorSettings native bridge={b} />)
    const sw = screen.getAllByRole('switch')
    expect(sw.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'false'])
    expect(b.request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch', { name: 'Heart rate' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Heart rate' }).getAttribute('aria-checked')).toBe('true'))
    expect(b.request.mock.calls).toEqual([['heartRate']])
  })
  it('denied: switch stays off and says why', async () => {
    render(<SensorSettings native bridge={fake({ request: vi.fn(async () => false) })} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Steps' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Not turned on'))
    expect(screen.getByRole('switch', { name: 'Steps' }).getAttribute('aria-checked')).toBe('false')
  })
})

describe('summarise', () => {
  it('adds today only, and picks the latest sleep', () => {
    const base = { personId: 'p', steps: null, source: 'manual' as const }
    const rows = [
      { ...base, kind: 'walk', minutes: 20, startedAt: '2026-10-02T01:00:00.000Z' },
      { ...base, kind: 'walk', minutes: 99, startedAt: '2026-10-01T01:00:00.000Z' },
      { ...base, kind: 'steps', minutes: 5, steps: 1000, startedAt: '2026-10-02T02:00:00.000Z' },
      { ...base, kind: 'sleep', minutes: 400, startedAt: '2026-10-01T15:00:00.000Z' }
    ]
    expect(summarise(rows, '2026-10-01T16:00:00.000Z')).toEqual({ walk: 25, steps: 1000, sleep: 400 })
  })
})
