import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import type { Wx } from './heroCards'
import { wxLocal } from './heroCards'
import type { DuePerson } from './nextPick'

const m = vi.hoisted(() => ({
  place: { weather: { lat: 6.2015121, lon: 125.1878084 }, zone: 'conel', source: 'zone' } as unknown,
  wx: null as unknown,
  due: [] as unknown[],
  review: 0,
  tick: new Date(2026, 9, 28, 23, 30),
  snooze: vi.fn(async () => 'snoozed')
}))
vi.mock('../location/useLocation', () => ({ usePlace: () => m.place }))
vi.mock('./weather', () => ({ useWeather: () => m.wx }))
vi.mock('./useDueMeds', () => ({ useDueMeds: () => ({ due: m.due, review: m.review, tick: m.tick }), markDue: vi.fn(async () => true), markTaken: vi.fn(async () => 1) }))
vi.mock('./useStorm', () => ({ useStorm: () => null }))
vi.mock('./planCard', () => ({ usePlanCard: () => null }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'me' }))
vi.mock('../family/IncomingSos', () => ({ IncomingSos: () => null })) // DS-3 mounts it in Simple mode; covered in Today.simple.test
vi.mock('../sos/SosHold', () => ({ default: () => null }))
vi.mock('../sos/Call911', () => ({ default: () => null }))
vi.mock('../sos/SosScreen', () => ({ default: () => null }))
vi.mock('../health/bpcheck/BpCheck', () => ({ default: () => null }))
vi.mock('../health/reminderActions', async (orig) => ({ ...(await orig<typeof import('../health/reminderActions')>()), handleReminderAction: m.snooze }))

import NextUp from './NextUp'
import SimpleToday from './SimpleToday'
import WeatherCard from './WeatherCard'
import { doseDay, doseKey, pickNext } from './nextPick'
import { snoozeCard } from './snoozeCard'
import { useNext } from './useNext'

const NOW = Date.parse('2026-10-27T06:00:00Z')
const base: Wx = { temp: 28, rainPct: 10, words: 'clear', at: '2026-10-27T06:00:00Z', humidity: 60, utcOffset: 8 * 3600, tz: 'Asia/Manila' }
const hours = (prob: number) => {
  const t0 = new Date(`${wxLocal(base, new Date()).slice(0, 13)}:00:00Z`).getTime()
  const time = Array.from({ length: 24 }, (_, i) => new Date(t0 + i * 3600_000).toISOString().slice(0, 16))
  return { time, prob: time.map(() => prob), code: time.map(() => 61) }
}
const rainy: Wx = { ...base, hourly: hours(80) }
const quake: Alert = { id: 'q89', kind: 'quake', level: 'Magnitude 4.6', title: 'Magnitude 4.6 earthquake', what: '', where: 'Pondaguitan', when: 'Just now', doNow: 'Drop, cover and hold on.', source: 'USGS', sourceUrl: null, issuedAt: new Date(NOW - 20 * 60_000).toISOString(), lat: 6.2015121 + 0.8, lon: 125.1878084, bulletin: '', checkedAt: new Date(NOW - 5 * 60_000).toISOString() }

const slot = (key: string, at: number) => ({ name: 'Losartan 50 mg', slot: '09:00', at, medicationId: key, key, personId: 'p', dose: '1 tablet' })
const dose = (personId: string, name: string, at: number, rel = at, status: 'missed' | 'upcoming' = 'missed'): DuePerson => ({ personId, name, isMe: personId === 'me', at, rel, status, slots: [{ ...slot(`${personId}${at}`, at), personId }] })

beforeEach(async () => {
  localStorage.clear()
  await db.kv.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  m.place = { weather: { lat: 6.2015121, lon: 125.1878084 }, zone: 'conel', source: 'zone' }
  m.wx = base
  m.due = []
  m.review = 0
  m.tick = new Date(2026, 9, 28, 23, 30)
})
afterEach(() => { cleanup(); vi.useRealTimers(); m.snooze.mockClear() })

const jacks = (c: HTMLElement) => [...c.querySelectorAll('img.jack')].map((i) => i.getAttribute('src') ?? '')
const simple = () => render(<SimpleToday onExit={() => undefined} notify={() => undefined} />)

describe('Simple mode night: one Jack per screen, and only when nothing needs action', () => {
  it('night, nothing due, no warning, rain tip: exactly one Jack (the sleepy one) and the true copy', async () => {
    m.wx = rainy
    const { container } = simple()
    await screen.findByText('No medicine due right now. Good night.')
    expect(screen.getByText(/^Rain likely/)).toBeTruthy() // the tip still shows; only its Jack is dropped
    expect(container.querySelectorAll('img.jack')).toHaveLength(1)
    expect(jacks(container)[0]).toMatch(/sleepy/)
    expect(screen.queryByText('It is late. Rest well.')).toBeNull()
  })
  it('day (not night) with a rain tip: the weather card keeps its ready-for-rain Jack and there is no sleepy one', async () => {
    m.wx = rainy
    m.tick = new Date(2026, 9, 28, 10, 0)
    const { container } = simple()
    await screen.findByText(/^Rain likely/)
    expect(screen.queryByText(/Good night/)).toBeNull()
    expect(container.querySelectorAll('img.jack')).toHaveLength(1)
    expect(jacks(container)[0]).toMatch(/ready-for-rain/)
  })
  it('night with a dose due or late: no sleepy Jack', async () => {
    m.due = [dose('me', 'Lloyd', 1410, 1410)]
    m.tick = new Date(2026, 9, 28, 23, 40)
    const { container } = simple()
    await screen.findByRole('button', { name: /I took it/ })
    expect(screen.queryByText(/Good night/)).toBeNull()
    expect(container.querySelector('img.jack')).toBeNull()
  })
  it('night with an active warning band: no sleepy Jack', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    const { container } = simple()
    await screen.findByRole('region', { name: 'Active warning' })
    expect(screen.queryByText(/Good night/)).toBeNull()
    expect(container.querySelector('img.jack')).toBeNull()
  })
})

describe('Weather card Jack cutoff', () => {
  it('Extreme caution (rank 40) keeps the drink-water Jack', () => {
    m.wx = { ...base, temp: 31, humidity: 70 }
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText(/Extreme caution/)).toBeTruthy()
    expect(jacks(container)[0]).toMatch(/drink-water/)
  })
  it('Danger (rank 80) has no Jack', () => {
    m.wx = { ...base, temp: 33, humidity: 70 }
    const { container } = render(<WeatherCard expanded />)
    expect(screen.getByText(/Danger/)).toBeTruthy()
    expect(container.querySelector('img.jack')).toBeNull()
  })
  it('noJack drops the rain Jack but keeps the line', () => {
    m.wx = rainy
    const { container } = render(<WeatherCard expanded noJack />)
    expect(screen.getByText(/^Rain likely/)).toBeTruthy()
    expect(container.querySelector('img.jack')).toBeNull()
  })
})

describe('Native snooze carries the dose day, not the tap day', () => {
  it('doseDay: a 23:30 dose seen at 00:10 is yesterday, a 00:30 dose seen at 23:50 is tomorrow, an ordinary dose is today', () => {
    expect(doseDay(dose('me', 'L', 1410, -30), new Date(2026, 9, 29, 0, 10))).toBe('2026-10-28')
    expect(doseDay(dose('me', 'L', 30, 1470), new Date(2026, 9, 28, 23, 50))).toBe('2026-10-29')
    expect(doseDay(dose('me', 'L', 540, 540), new Date(2026, 9, 28, 9, 30))).toBe('2026-10-28')
  })
  it('In 10 min at 00:10 on a dose from 23:30 yesterday sends day 2026-10-28', async () => {
    vi.setSystemTime(new Date(2026, 9, 29, 0, 10))
    const item = pickNext({ due: [dose('me', 'Lloyd', 1410, -30)], plan: null, storm: null }, new Date(2026, 9, 29, 0, 10))
    render(<NextUp item={item} review={0} notify={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Snooze, in 10 minutes' }))
    await waitFor(() => expect(m.snooze).toHaveBeenCalledTimes(1))
    const ev = (m.snooze.mock.calls[0] as unknown as [{ notification: { extra: { day: string; at: number; people: string[] } } }])[0]
    expect(ev.notification.extra).toMatchObject({ day: '2026-10-28', at: 1410, people: ['me'] })
  })
})

describe('A snoozed late card hides only itself', () => {
  it('another person is picked next while the first is snoozed', () => {
    const a = dose('me', 'Lloyd', 540)
    const b = dose('ana', 'Ana', 600)
    m.due = [a, b]
    m.review = 1
    m.tick = new Date(2026, 9, 28, 10, 0)
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
    const first = renderHook(() => useNext())
    expect(first.result.current.item.who?.personId).toBe('me')
    first.unmount()
    snoozeCard(doseKey(a), 10, new Date())
    const { result } = renderHook(() => useNext())
    expect(result.current.item.who?.personId).toBe('ana')
    expect(result.current.item.key).toBe('dose:ana:600')
    expect(result.current.review).toBe(1)
  })
  it('the only dose snoozed: nothing is next (the weather card expands with the medicines to check row), then it returns', () => {
    const a = dose('me', 'Lloyd', 540)
    m.due = [a]
    m.review = 2
    m.tick = new Date(2026, 9, 28, 10, 0)
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0))
    snoozeCard(doseKey(a), 10, new Date())
    const { result } = renderHook(() => useNext())
    expect(result.current.item.kind).toBe('calm')
    expect(result.current.review).toBe(2)
    m.wx = base
    render(<WeatherCard expanded review={result.current.review} />)
    expect(screen.getByRole('link', { name: /Nothing due right now · 2 medicines to check/ })).toBeTruthy()
    act(() => { vi.setSystemTime(new Date(2026, 9, 28, 10, 11)); document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.item.who?.personId).toBe('me') // 10:11: the 10 minutes are over, the card is back
  })
})
