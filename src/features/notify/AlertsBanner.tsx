import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { ASK_KEY, enableAlerts, ensureSubscribed, kvGet, markAsked, reAskDue, vapidKey } from './alerts'

export const NATIVE_NOTICE = 'Family alerts also show here.'

type Mode = 'off' | 'unsubscribed'

/** Gentle re-ask: alerts off, or granted but not set up yet. At most once every 3 days (shared key with onboarding). */
export default function AlertsBanner() {
  const [mode, setMode] = useState<Mode | null>(null)
  const [blocked, setBlocked] = useState(false)
  const native = Capacitor.isNativePlatform()
  useEffect(() => {
    if (native || typeof Notification === 'undefined') return
    ;(async () => {
      const granted = Notification.permission === 'granted'
      const need: Mode | null = !granted ? 'off' : vapidKey() && !(await db.kv.get('push.sub')) ? 'unsubscribed' : null
      if (!need || !reAskDue(await kvGet<number>(ASK_KEY), Date.now())) return
      await markAsked()
      setMode(need)
    })()
  }, [native])
  // D-78: the Android app has no server push. Family alerts are rows seen in Bantay (bell, Family, Today); never a promise of a lock-screen alert.
  if (native) return <div className="grp" role="region" aria-label="Family alerts" style={{ padding: 16 }}><span className="sub">{NATIVE_NOTICE}</span></div>
  if (!mode) return null
  const off = mode === 'off'
  return (
    <div className="grp" role="region" aria-label={off ? 'Alerts are off' : 'Alerts are not set up'} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong>{off ? 'Alerts are off on this phone' : 'Alerts are not set up yet'}</strong>
      <span className="sub">
        {off ? 'You won’t hear about storms or missed medicines until you open Bantay.' : 'Tap to try again so storm and medicine alerts reach this phone.'}
      </span>
      {blocked && <span className="sub">{off ? 'Your phone is blocking alerts for Bantay. Turn them on in your phone settings.' : 'That did not work. Check your connection and try again.'}</span>}
      <button
        className="btn"
        onClick={async () => {
          const ok = off ? (await enableAlerts()) === 'granted' : await ensureSubscribed()
          if (ok) setMode(null)
          else setBlocked(true)
        }}
      >
        {off ? 'Turn on alerts' : 'Try again'}
      </button>
    </div>
  )
}
