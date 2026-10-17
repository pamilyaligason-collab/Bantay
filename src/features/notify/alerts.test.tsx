import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { track } from '../admin/events'
import AlertsBanner from './AlertsBanner'
import { enableAlerts, ensureSubscribed, isIosNeedsInstall, reAskDue, urlB64ToBytes } from './alerts'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

describe('isIosNeedsInstall', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
  const ipados = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
  it('true for iPhone Safari not standalone', () => expect(isIosNeedsInstall(iphone, false)).toBe(true))
  it('false once installed', () => expect(isIosNeedsInstall(iphone, true)).toBe(false))
  it('true for iPadOS 13+ (Mac UA with touch)', () => expect(isIosNeedsInstall(ipados, false, 5)).toBe(true))
  it('false for a real Mac (no touch)', () => expect(isIosNeedsInstall(ipados, false, 0)).toBe(false))
  it('false on Android', () => expect(isIosNeedsInstall('Mozilla/5.0 (Linux; Android 14) Chrome/120', false)).toBe(false))
})

describe('reAskDue', () => {
  const DAY = 86_400_000
  it('due when never shown', () => expect(reAskDue(undefined, 1000)).toBe(true))
  it('not due inside 3 days', () => expect(reAskDue(0, 3 * DAY - 1)).toBe(false))
  it('due at 3 days', () => expect(reAskDue(0, 3 * DAY)).toBe(true))
})

describe('urlB64ToBytes', () => {
  it('decodes url-safe base64', () => expect(Array.from(urlB64ToBytes('AQID'))).toEqual([1, 2, 3]))
})

const sub = { toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }) }
function stub(perm: NotificationPermission, existing: unknown = null) {
  const subscribe = vi.fn(async () => sub)
  vi.stubGlobal('Notification', { permission: perm, requestPermission: vi.fn(async () => perm) })
  vi.stubGlobal('navigator', {
    ...navigator,
    serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription: async () => existing } }) }
  })
  return subscribe
}

beforeEach(async () => {
  await db.kv.clear()
  await db.outbox.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('enableAlerts', () => {
  it('granted with a VAPID key stores the subscription and queues an upsert', async () => {
    stub('granted')
    expect(await enableAlerts('AQID')).toBe('granted')
    expect((await db.kv.get('push.sub'))?.value).toMatchObject({ endpoint: 'https://push.example/abc' })
    expect(await db.outbox.toArray()).toMatchObject([{ table: 'push_subscriptions', op: 'upsert' }])
    expect(track).toHaveBeenCalledWith('action', 'alerts_on')
  })
  it('granted without a key does not subscribe or queue', async () => {
    stub('granted')
    expect(await enableAlerts(undefined)).toBe('granted')
    expect(await db.outbox.count()).toBe(0)
  })
  it('denied queues nothing and records the ask time', async () => {
    stub('denied')
    expect(await enableAlerts('AQID')).toBe('denied')
    expect(await db.outbox.count()).toBe(0)
    expect(typeof (await db.kv.get('alerts.lastAsk'))?.value).toBe('number')
    expect(track).toHaveBeenCalledWith('action', 'alerts_off')
  })
  it('unsupported when Notification is missing', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(await enableAlerts('AQID')).toBe('unsupported')
  })
})

describe('ensureSubscribed', () => {
  it('granted but not subscribed: subscribes, saves, queues once', async () => {
    const subscribe = stub('granted')
    expect(await ensureSubscribed('AQID')).toBe(true)
    expect(await ensureSubscribed('AQID')).toBe(true) // second launch: no duplicate upsert
    expect(subscribe).toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(1)
  })
  it('reuses an existing browser subscription', async () => {
    const subscribe = stub('granted', sub)
    expect(await ensureSubscribed('AQID')).toBe(true)
    expect(subscribe).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(1)
  })
  it('does nothing when permission is not granted or no key', async () => {
    stub('default')
    expect(await ensureSubscribed('AQID')).toBe(false)
    stub('granted')
    expect(await ensureSubscribed(undefined)).toBe(false)
    expect(await db.outbox.count()).toBe(0)
  })
  it('returns false when the push service fails, so a later launch retries', async () => {
    const subscribe = stub('granted')
    subscribe.mockRejectedValueOnce(new Error('offline'))
    expect(await ensureSubscribed('AQID')).toBe(false)
    expect(await ensureSubscribed('AQID')).toBe(true)
  })
})

describe('AlertsBanner', () => {
  it('shows when alerts are off and never re-asked', async () => {
    stub('denied')
    render(<AlertsBanner />)
    expect(await screen.findByText('Alerts are off on this phone')).toBeTruthy()
  })
  it('stays hidden right after onboarding denial (shared ask key)', async () => {
    stub('denied')
    await enableAlerts('AQID')
    render(<AlertsBanner />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Alerts are off on this phone')).toBeNull()
  })
  it('shows "not set up yet" when granted, key present, no subscription', async () => {
    stub('granted')
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    render(<AlertsBanner />)
    expect(await screen.findByText('Alerts are not set up yet')).toBeTruthy()
    screen.getByRole('button', { name: 'Try again' }).click()
    await waitFor(() => expect(screen.queryByText('Alerts are not set up yet')).toBeNull())
    expect((await db.kv.get('push.sub'))?.value).toBeTruthy()
  })
  it('hidden when granted and subscribed', async () => {
    stub('granted')
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID')
    await db.kv.put({ key: 'push.sub', value: { endpoint: 'x' } })
    render(<AlertsBanner />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('region')).toBeNull()
  })
})
