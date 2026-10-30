import { useState } from 'react'
import AlertsBanner from '../notify/AlertsBanner'
import { Row } from '../look'
import { Icon } from '../shell/Icon'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK, type AlarmHealth } from '../phonecheck/keys'
import { useKvValue } from '../phonecheck/useKvValue'
import { SettingsOpener } from '../safety/settingsOpener'
import { notifyDone, notifyState, turnOnReminders, useSetupLeft } from '../setup/steps'
import { db } from '../../db'
import { UpdateCard } from '../update/UpdateCard'
import { PwaBanner } from '../update/PwaBanner'
import NearbyList from './NearbyList'
import WeekLine from './WeekLine'
import './today.css'

export const DENIED_KEY = 'alerts.denied' // how many times "Turn on" left the phone still off (kv, this phone only)

/** F-4 / P-3: true only when the phone check says notifications are off or the alarm plan failed. Unknown is not off (ML-05). */
export const alertsAreOff = (check: { notif_ok?: boolean | null } | undefined, alarms: Pick<AlarmHealth, 'ok'> | undefined): boolean => check?.notif_ok === false || alarms?.ok === false

/** The amber card right under the weather while phone alerts are off (it says what that costs). After two failed tries the action opens the app's own settings. Ranked above every other notice. */
export function AlertsOffCard() {
  const check = useKvValue<{ notif_ok?: boolean | null }>(KEY_PHONE_CHECK)
  const alarms = useKvValue<AlarmHealth>(KEY_ALARM_HEALTH)
  const denied = useKvValue<number>(DENIED_KEY) ?? 0
  const [busy, setBusy] = useState(false)
  if (!alertsAreOff(check, alarms)) return null
  const open = denied >= 2
  const go = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (open) { await SettingsOpener.open({ target: 'appdetails' }).catch(() => undefined); return }
      await turnOnReminders()
      if (!notifyDone(await notifyState())) await db.kv.put({ key: DENIED_KEY, value: denied + 1 }).catch(() => undefined)
      else await db.kv.delete(DENIED_KEY).catch(() => undefined)
    } finally { setBusy(false) }
  }
  return (
    <section aria-label="Phone alerts are off" data-testid="alerts-off">
      <div className="card td-ao">
        <span className="td-ao-ic"><Icon name="bell" size={32} /></span>
        <span className="td-ao-t"><b>Phone alerts are off</b><span>Reminders will not ring.</span></span>
        <button type="button" className="btn" aria-label={open ? 'Open app settings' : 'Turn on'} onClick={() => void go()} disabled={busy}>{open ? 'Settings' : 'Turn on'}</button>
      </div>
    </section>
  )
}

/** "More" (S16 L1, frame today-more): the setup row, one update row, the add-to-home row, then the nearby rows and the week line. Nothing to show = no heading.
 *  D-50: the update row never sits above a warning (this group is below every alert). */
export default function NoticeStack() {
  const { left } = useSetupLeft()
  return (
    <div className="td-more-g" role="group" aria-labelledby="t-more">
      <h2 id="t-more" className="td-more-h">More</h2>
      {left.length > 0 && <Row icon="check" title={`${left.length} left: ${left.join(', ')}`} sub="Set up" href="#me" testId="setup-row" />}
      <AlertsBanner />
      <UpdateCard />
      <PwaBanner />
      <NearbyList />
      <WeekLine />
    </div>
  )
}
