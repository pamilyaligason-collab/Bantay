import { useEffect, useState } from 'react'
import { db } from '../../db'
import { isNativeAndroid } from '../safety/settingsOpener'
import { PhoneCheckCard } from './PhoneCheckCard'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK, KEY_PHONE_LATER, KEY_TOAST_SEEN, type AlarmHealth } from './keys'
import { probeProblems, type ProbeResult } from './probe'
import { useKvValue } from './useKvValue'
import './phonecheck.css'

export const toastText = (n: number) => `${n} medicine alarm${n === 1 ? ' was' : 's were'} missing and ${n === 1 ? 'has' : 'have'} been set again.`

/** Mounted at the top of Today (S7). Two quiet things, both only on the Android app:
 *  - `today-alarmfix`: when the check on opening Bantay found a medicine alarm missing and set it again, a short message says so once. If every alarm was set, nothing shows.
 *  - after "Remind me later" on the phone check: a small card stays until the problem is fixed. */
export function AlarmFixedToast() {
  const health = useKvValue<AlarmHealth>(KEY_ALARM_HEALTH)
  const check = useKvValue<ProbeResult & { at?: string }>(KEY_PHONE_CHECK)
  const later = useKvValue<{ at: string }>(KEY_PHONE_LATER)
  const [shown, setShown] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const android = isNativeAndroid()
  useEffect(() => {
    if (!android || !health || !(health.rearmed > 0) || shown === health.at) return
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
  const problems = check ? probeProblems(check) : []
  return (
    <>
      {shown && health && <div className="pc-toast" role="status">{toastText(health.rearmed)}</div>}
      {later && problems.length > 0 && check && (open
        ? <PhoneCheckCard result={check} onFixed={() => setOpen(false)} />
        : <div className="pc-later" role="group" aria-label="Phone check"><span>Your phone may miss medicine alarms.</span><button type="button" className="pc-btn2" onClick={() => setOpen(true)}>Fix it</button></div>)}
    </>
  )
}
