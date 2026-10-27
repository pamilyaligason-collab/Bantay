import { useEffect, useState } from 'react'
import { db } from '../../db'
import { isNativeAndroid } from '../safety/settingsOpener'
import { PhoneCheckCard } from './PhoneCheckCard'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK, KEY_PHONE_LATER, KEY_TOAST_SEEN, type AlarmHealth } from './keys'
import { probeProblems, type ProbeResult } from './probe'
import { useKvValue } from './useKvValue'
import './phonecheck.css'

export const TOAST_TEXT = 'Your medicine alarms are set again.'

/** Mounted at the top of Today (S7). Two quiet things, both only on the Android app:
 *  - `today-alarmfix`: after alarms that could not be set (permission or a phone switch) were set again, a short message says so once. A normal re-arm on opening Bantay shows nothing.
 *  - after "Remind me later" on the phone check: a small card stays until the problem is fixed. */
export function AlarmFixedToast() {
  const health = useKvValue<AlarmHealth>(KEY_ALARM_HEALTH)
  const check = useKvValue<ProbeResult & { at?: string }>(KEY_PHONE_CHECK)
  const later = useKvValue<{ at: string }>(KEY_PHONE_LATER)
  const [shown, setShown] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const android = isNativeAndroid()
  useEffect(() => {
    if (!android || !health || !health.recovered || shown === health.at) return
    let cancelled = false
    void (async () => {
      const seen = (await db.kv.get(KEY_TOAST_SEEN).catch(() => undefined))?.value
      if (cancelled || seen === health.at) return
      await db.kv.put({ key: KEY_TOAST_SEEN, value: health.at }).catch(() => undefined)
      setShown(health.at)
    })()
    return () => { cancelled = true }
  }, [android, health, shown])
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(null), 6000)
    return () => clearTimeout(t)
  }, [shown])
  if (!android) return null
  const problems = check ? probeProblems(check).filter((p) => p !== 'call') : [] // the call permission is not an alarm problem
  return (
    <>
      {shown && health && <div className="pc-toast" role="status">{TOAST_TEXT}</div>}
      {later && problems.length > 0 && check && (open
        ? <PhoneCheckCard result={check} onFixed={() => setOpen(false)} />
        : <div className="pc-later" role="group" aria-label="Phone check"><span>Your phone may miss medicine alarms.</span><button type="button" className="pc-btn2" onClick={() => setOpen(true)}>Fix it</button></div>)}
    </>
  )
}
