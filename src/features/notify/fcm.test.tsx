import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The push plugin, the Supabase client and the native bridge are mocked: nothing leaves the test.
const h = vi.hoisted(() => {
  type Listener = (e: never) => void
  const s = {
    native: true,
    calls: [] as string[],
    channels: [] as { id: string; importance: number }[],
    listeners: new Map<string, Listener>(),
    removed: [] as string[],
    perm: 'prompt' as string, // what checkPermissions answers
    permAfterAsk: 'granted' as string, // what requestPermissions answers
    registerFails: false,
    uid: 'u1' as string | null,
    authCb: null as null | ((e: string, s: { user: { id: string } } | null) => void),
    rpcs: [] as { fn: string; args: Record<string, unknown> }[],
    rpcError: false,
    deletes: [] as { table: string; col: string; val: unknown }[],
    events: [] as string[],
    polls: 0,
    opened: 'app-settings' as string | null
  }
  return s
})

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native, getPlatform: () => 'android' } }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => h.native, openFix: async (t: string) => { h.calls.push(`openFix:${t}`); return { opened: h.opened } } }))
vi.mock('../phonecheck/appInfo', () => ({ shellVersionNow: async () => '2.4.0' }))
vi.mock('./alertsLive', () => ({ pollAlerts: async () => { h.polls++; return 0 } }))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    createChannel: async (c: { id: string; importance: number }) => { h.calls.push(`createChannel:${c.id}`); h.channels.push(c) },
    checkPermissions: async () => { h.calls.push('checkPermissions'); return { receive: h.perm } },
    requestPermissions: async () => { h.calls.push('requestPermissions'); h.perm = h.permAfterAsk; return { receive: h.permAfterAsk } },
    register: async () => { h.calls.push('register'); if (h.registerFails) throw new Error('no firebase') },
    unregister: async () => { h.calls.push('unregister'); h.events.push('unregister') },
    addListener: async (name: string, fn: (e: never) => void) => { h.listeners.set(name, fn); return { remove: async () => { h.removed.push(name) } } }
  }
}))
vi.mock('../auth/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: h.uid ? { user: { id: h.uid } } : null } }),
      onAuthStateChange: (cb: never) => { h.authCb = cb; return { data: { subscription: { unsubscribe: () => { h.authCb = null } } } } },
      signOut: async () => { h.events.push('signOut') }
    },
    rpc: async (fn: string, args: Record<string, unknown>) => { h.rpcs.push({ fn, args }); return { data: null, error: h.rpcError ? { message: 'x' } : null } },
    from: (table: string) => ({ delete: () => ({ eq: async (col: string, val: unknown) => { h.deletes.push({ table, col, val }); h.events.push('delete'); return { error: null } } }) })
  }
}))

import { db } from '../../db'
import { signOut } from '../auth/session'
import { CHANNEL_ID, QUIET_CHANNEL_ID, claimToken, createChannels, forgetPushToken, KEY_PUSH_PERM, KEY_PUSH_TOKEN, tabFor, watchPushForSession } from './fcm'
import { PushPermissionRow } from './PushPermissionRow'

beforeEach(async () => {
  Object.assign(h, { native: true, calls: [], channels: [], removed: [], perm: 'prompt', permAfterAsk: 'granted', registerFails: false, uid: 'u1', rpcs: [], rpcError: false, deletes: [], events: [], polls: 0, opened: 'app-settings' })
  h.listeners.clear()
  await db.kv.clear()
})
afterEach(() => { cleanup(); location.hash = '' })

const started = () => waitFor(() => expect(h.calls).toContain('register'))

describe('watchPushForSession', () => {
  it('creates both channels BEFORE register, asks for the notification permission, then registers', async () => {
    const stop = watchPushForSession()
    await started()
    const at = (c: string) => h.calls.indexOf(c)
    expect(at('createChannel:carer_alerts')).toBeGreaterThanOrEqual(0)
    expect(at('createChannel:carer_quiet')).toBeGreaterThanOrEqual(0)
    expect(Math.max(at('createChannel:carer_alerts'), at('createChannel:carer_quiet'))).toBeLessThan(at('register'))
    expect(at('requestPermissions')).toBeGreaterThan(at('checkPermissions'))
    expect(at('requestPermissions')).toBeLessThan(at('register'))
    expect(h.channels.map((c) => [c.id, c.importance])).toEqual([['carer_alerts', 5], ['carer_quiet', 2]])
    expect((await db.kv.get(KEY_PUSH_PERM))?.value).toBe('granted')
    stop()
  })
  it('an already granted permission is not asked again', async () => {
    h.perm = 'granted'
    const stop = watchPushForSession()
    await started()
    expect(h.calls).not.toContain('requestPermissions')
    stop()
  })
  it('a denied permission: no register, the answer is saved for the Me row', async () => {
    h.perm = 'denied'
    const stop = watchPushForSession()
    await waitFor(async () => expect((await db.kv.get(KEY_PUSH_PERM))?.value).toBe('denied'))
    expect(h.calls).not.toContain('register')
    stop()
  })
  it('a person who says no to the prompt is not registered', async () => {
    h.permAfterAsk = 'denied'
    const stop = watchPushForSession()
    await waitFor(() => expect(h.calls).toContain('requestPermissions'))
    await waitFor(async () => expect((await db.kv.get(KEY_PUSH_PERM))?.value).toBe('denied'))
    expect(h.calls).not.toContain('register')
    stop()
  })
  it('a registration event claims the token on the server (rpc push_token_claim) and keeps it locally for sign-out', async () => {
    const stop = watchPushForSession()
    await started()
    h.listeners.get('registration')!({ value: 'fcm-token-ABCDEFGHIJKLMNOP' } as never)
    await waitFor(() => expect(h.rpcs).toEqual([{ fn: 'push_token_claim', args: { p_token: 'fcm-token-ABCDEFGHIJKLMNOP', p_app_version: '2.4.0' } }]))
    expect((await db.kv.get(KEY_PUSH_TOKEN))?.value).toBe('fcm-token-ABCDEFGHIJKLMNOP')
    stop()
  })
  it('a push received in the foreground refreshes the bell now', async () => {
    const stop = watchPushForSession()
    await started()
    h.listeners.get('pushNotificationReceived')!({} as never)
    expect(h.polls).toBe(1)
    stop()
  })
  it('a tap opens the tab of the template: missed dose -> Health, SOS -> Family, storm -> Safety, nothing known -> Today', async () => {
    const stop = watchPushForSession()
    await started()
    const tap = h.listeners.get('pushNotificationActionPerformed')!
    for (const [t, hash] of [['dose_watch', '#health'], ['family_sos', '#family'], ['storm_warning', '#safety'], ['pin_changed', '#today'], ['nope', '#today'], [undefined, '#today']] as const) {
      location.hash = ''
      tap({ notification: { data: { t } } } as never)
      expect(location.hash).toBe(hash)
    }
    stop()
  })
  it('a push that fails to register (no google-services.json, no Play services) does not throw or stop the app', async () => {
    h.registerFails = true
    const stop = watchPushForSession()
    await started()
    expect(() => stop()).not.toThrow()
  })
  it('stopping removes the listeners; signing in as someone else registers again for them', async () => {
    const stop = watchPushForSession()
    await started()
    h.authCb!('SIGNED_OUT', null)
    await waitFor(() => expect(h.removed.sort()).toEqual(['pushNotificationActionPerformed', 'pushNotificationReceived', 'registration', 'registrationError']))
    h.calls.length = 0
    h.authCb!('SIGNED_IN', { user: { id: 'u2' } })
    await started()
    stop()
  })
  it('does nothing on the web (no plugin call at all)', async () => {
    h.native = false
    const stop = watchPushForSession()
    await new Promise((r) => setTimeout(r, 20))
    expect(h.calls).toEqual([])
    expect(() => stop()).not.toThrow()
  })
  it('signed out at start: nothing is registered', async () => {
    h.uid = null
    const stop = watchPushForSession()
    await new Promise((r) => setTimeout(r, 20))
    expect(h.calls).toEqual([])
    stop()
  })
})

describe('claimToken', () => {
  it('an offline or failing claim is false (the next registration event tries again) but the token is still kept for sign-out', async () => {
    h.rpcError = true
    expect(await claimToken('tok-1-aaaaaaaaaaaaaaaa')).toBe(false)
    expect((await db.kv.get(KEY_PUSH_TOKEN))?.value).toBe('tok-1-aaaaaaaaaaaaaaaa')
  })
})

describe('sign-out (ML-07)', () => {
  it('deletes this phone token on the server BEFORE the session ends, then unregisters it with Google', async () => {
    await db.kv.put({ key: KEY_PUSH_TOKEN, value: 'tok-own-aaaaaaaaaaaaaaaa' })
    await signOut()
    expect(h.deletes).toEqual([{ table: 'push_tokens', col: 'token', val: 'tok-own-aaaaaaaaaaaaaaaa' }])
    expect(h.events.indexOf('delete')).toBeGreaterThanOrEqual(0)
    expect(h.events.indexOf('delete')).toBeLessThan(h.events.indexOf('signOut'))
    expect(h.events).toContain('unregister')
    expect(await db.kv.get(KEY_PUSH_TOKEN)).toBeUndefined()
  })
  it('with no token saved nothing is deleted and sign-out still happens', async () => {
    await signOut()
    expect(h.deletes).toEqual([])
    expect(h.events).toContain('signOut')
  })
  it('on the web forgetPushToken never touches the plugin', async () => {
    h.native = false
    await forgetPushToken()
    expect(h.calls).toEqual([])
  })
})

describe('tabFor and channels', () => {
  it('maps data.t to a tab', () => {
    expect([tabFor('dose_watch'), tabFor('family_sos'), tabFor('digest'), tabFor('share_on'), tabFor(5), tabFor('constructor')]).toEqual(['health', 'family', 'family', 'today', 'today', 'today'])
  })
  it('the channel ids are the ones the server sends to, and a failing create does not stop the second', async () => {
    expect([CHANNEL_ID, QUIET_CHANNEL_ID]).toEqual(['carer_alerts', 'carer_quiet'])
    const made: string[] = []
    await createChannels({ createChannel: async (c: { id: string }) => { made.push(c.id); throw new Error('exists') } } as never)
    expect(made).toEqual(['carer_alerts', 'carer_quiet']) // a failing create does not stop the second
  })
})

describe('PushPermissionRow', () => {
  it('denied: says alerts are off, offers Open settings, and carries the auto-start line', async () => {
    h.perm = 'denied'
    render(<PushPermissionRow />)
    expect(await screen.findByText('Alerts are off on this phone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    await waitFor(() => expect(h.calls).toContain('openFix:notifications'))
    expect(await screen.findByText(/Settings opened/)).toBeTruthy()
    expect(screen.getByText(/Oppo, Vivo and Xiaomi/)).toBeTruthy()
  })
  it('a settings screen that will not open shows the written steps', async () => {
    h.perm = 'denied'; h.opened = null
    render(<PushPermissionRow />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }))
    expect(await screen.findByText(/Open Settings, then Apps, then Bantay, then Notifications/)).toBeTruthy()
  })
  it('granted: no Open settings button, still the auto-start line', async () => {
    h.perm = 'granted'
    render(<PushPermissionRow />)
    expect(await screen.findByText(/On\. Family alerts can reach you/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
    expect(screen.getByText(/auto-start/)).toBeTruthy()
  })
  it('the web app shows nothing', () => {
    h.native = false
    const { container } = render(<PushPermissionRow />)
    expect(container.innerHTML).toBe('')
  })
})
