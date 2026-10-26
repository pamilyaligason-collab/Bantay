import { Capacitor } from '@capacitor/core'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../auth/client'
import { db } from '../../db'
import { ALERT_COLUMNS, adb, clearAlerts, fromServer, upsertAlerts, type ServerAlert } from './store'

// Family alerts, live while Bantay is open (D-78: no server push on the Android app). Realtime INSERT/UPDATE on carer_alerts for this user,
// a 30 s poll as the safety net, and one poll whenever the app comes back to the foreground. Rows land in the feature-local store
// (store.ts) so the bell works offline with what was last seen. DELETE events (the prune, key only) are ignored.
export type { NotifyKind } from './templates'

export const POLL_MS = 30_000
const UID_KEY = 'bantay.alerts.uid'

let inflight: Promise<number> | null = null
let again = false
let epoch = 0 // bumped whenever the signed-in person changes: a poll that began for the last person must not write its rows for the next one (ML-07)
export const INAPP_OK_KEY = 'alerts.inapp.ok'
/** One fetch of the unexpired rows into the store (RLS limits it to this user's rows). Returns the number of rows new to this phone; 0 offline or signed out. */
export function pollAlerts(): Promise<number> {
  if (inflight) { again = true; return inflight } // asked while one is running (resume, tick): run once more after it, so the answer is never older than the ask
  inflight = (async () => {
    if (!supabase) return 0
    const mine = epoch
    try {
      const { data, error } = await supabase.from('carer_alerts').select(ALERT_COLUMNS).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(200)
      if (error || !data || mine !== epoch) return 0
      // the table answered for this user: in-app family alerts work here, so the switch-to-app banner may show (Q1). Before 0030 is applied this never runs.
      await db.kv.get(INAPP_OK_KEY).then((k) => (k?.value === true ? undefined : db.kv.put({ key: INAPP_OK_KEY, value: true }))).catch(() => undefined)
      const rows = (data as Partial<ServerAlert>[]).flatMap((r) => fromServer(r) ?? [])
      const fresh = await upsertAlerts(rows)
      // a seen mark made offline: tell the server now (best effort; the next poll tries again)
      const local = await adb.alerts.bulkGet(rows.filter((r) => !r.seenAt).map((r) => r.id))
      const owed = local.flatMap((l) => (l?.seenAt ? [l.id] : []))
      if (owed.length) await supabase.from('carer_alerts').update({ seen_at: new Date().toISOString() }).in('id', owed)
      return fresh
    } catch { return 0 }
  })().finally(() => { inflight = null; if (again) { again = false; void pollAlerts() } })
  return inflight
}

/** Subscribe for this user and keep the store fresh. Returns the stop function. */
export function startAlertsLive(userId: string): () => void {
  const sb = supabase
  if (!sb) return () => undefined
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let stopped = false
  let removeApp: (() => void) | null = null

  const open = () => {
    if (stopped || channel) return
    channel = sb.channel(`carer_alerts:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'carer_alerts', filter: `carer_user_id=eq.${userId}` }, (p) => {
        if (p.eventType === 'DELETE') return // the 30-day prune: the bell already hides expired rows
        const row = fromServer(p.new as Partial<ServerAlert>)
        if (row) void upsertAlerts([row])
      })
      .subscribe()
    timer = setInterval(() => void pollAlerts(), POLL_MS)
  }
  const close = () => {
    if (channel) void sb.removeChannel(channel)
    channel = null
    if (timer) clearInterval(timer)
    timer = null
  }
  const setActive = (active: boolean) => {
    if (stopped) return
    if (!active) return close() // in the background nothing is listened to: an APK user sees the rows when they open Bantay
    open()
    void pollAlerts()
  }

  open()
  void pollAlerts()
  if (Capacitor.isNativePlatform()) {
    // native: appStateChange only (visibilitychange fires too, which would poll twice)
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', (s) => setActive(s.isActive))).then((h) => { if (stopped) void h.remove(); else removeApp = () => void h.remove() }).catch(() => undefined)
  } else if (typeof document !== 'undefined') {
    const on = () => setActive(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', on)
    removeApp = () => document.removeEventListener('visibilitychange', on)
  }
  return () => { stopped = true; close(); removeApp?.() }
}

/** App.tsx hook: start for whoever is signed in, stop on sign-out. A different person signing in on this phone never sees the last one's rows (ML-07). */
export function watchAlertsForSession(): () => void {
  const sb = supabase
  if (!sb) return () => undefined
  let stop: (() => void) | null = null
  let uid: string | null = null
  const apply = (next: string | null) => {
    if (next === uid) return
    stop?.(); stop = null
    const was = uid ?? (() => { try { return localStorage.getItem(UID_KEY) } catch { return null } })()
    uid = next
    epoch++
    if (!next) { if (was) { void clearAlerts(); try { localStorage.removeItem(UID_KEY) } catch { /* private mode */ } } return }
    const begin = () => { try { localStorage.setItem(UID_KEY, next) } catch { /* private mode */ } stop = startAlertsLive(next) }
    if (was && was !== next) void clearAlerts().then(begin) // another person on this phone: start clean
    else begin()
  }
  void sb.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null))
  const { data } = sb.auth.onAuthStateChange((_e, session) => apply(session?.user.id ?? null))
  return () => { data.subscription.unsubscribe(); stop?.(); stop = null; uid = null }
}
