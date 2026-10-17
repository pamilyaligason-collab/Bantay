import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { enableAlerts, isIosNeedsInstall, reAskDue, urlB64ToBytes } from './alerts'

describe('isIosNeedsInstall', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
  it('true for iPhone Safari not standalone', () => expect(isIosNeedsInstall(iphone, false)).toBe(true))
  it('false once installed', () => expect(isIosNeedsInstall(iphone, true)).toBe(false))
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

describe('enableAlerts', () => {
  beforeEach(async () => {
    await db.kv.clear()
    await db.outbox.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  const stub = (perm: NotificationPermission) => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => perm) })
    const sub = { toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }) }
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn(async () => sub) } }) }
    })
  }

  it('granted with a VAPID key stores the subscription and queues an upsert', async () => {
    stub('granted')
    expect(await enableAlerts('AQID')).toBe('granted')
    expect((await db.kv.get('push.sub'))?.value).toMatchObject({ endpoint: 'https://push.example/abc' })
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'push_subscriptions', op: 'upsert' })
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
  })
  it('unsupported when Notification is missing', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(await enableAlerts('AQID')).toBe('unsupported')
  })
})
