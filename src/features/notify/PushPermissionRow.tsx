import { useEffect, useState } from 'react'
import { useKvValue } from '../phonecheck/useKvValue'
import { isNativeAndroid, openFix } from '../safety/settingsOpener'
import '../shell/shell.css'
import { KEY_PUSH_PERM, refreshPushPermission, retryPushRegistration } from './fcm'

/** Me > Alerts row (lane A mounts this one line; lane E owns the file). Android app only. Shows whether Android lets Bantay show alerts, an Open settings button when it does not,
 *  and the one line about allowing auto-start on phones that stop apps after a restart (Oppo, Vivo, Xiaomi). Plain words, no medical claim. */
export function PushPermissionRow() {
  const perm = useKvValue<string>(KEY_PUSH_PERM)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!isNativeAndroid()) return
    void refreshPushPermission()
    const back = () => { if (document.visibilityState === 'visible') void refreshPushPermission() } // back from Settings: read the answer again
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  if (!isNativeAndroid()) return null
  const denied = perm === 'denied'
  const open = async () => {
    const r = await openFix('notifications')
    setNote(r.opened ? 'Settings opened. Turn on notifications for Bantay.' : 'We could not open Settings. Open Settings, then Apps, then Bantay, then Notifications.')
  }
  return (
    <>
      <div>
        <div className="sh-grow">
          <b>{denied ? 'Alerts are off on this phone' : 'Alerts on this phone'}</b>
          <div className="sh-sub" role="status">
            {denied ? note || 'Bantay cannot tell you when your family needs help.' : perm === 'granted' ? note || 'On. Family alerts can reach you when Bantay is closed.' : 'Not on yet.'}
          </div>
        </div>
        {denied && <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void open()}>Open settings</button>}
        {!denied && perm !== 'granted' && <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => retryPushRegistration()}>Turn on</button>}
      </div>
      <div>
        <div className="sh-grow"><div className="sh-sub">On Oppo, Vivo and Xiaomi phones, also allow Bantay to auto-start. If you do not, alerts can stop after you restart the phone.</div></div>
      </div>
    </>
  )
}
