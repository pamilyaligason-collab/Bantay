import { useEffect, useState } from 'react'
import { useKv } from '../shell/useKv'
import { AlarmHealthRow } from '../phonecheck/AlarmHealthRow'
import { KEY_PHONE_CHECK } from '../phonecheck/keys'
import { useKvValue } from '../phonecheck/useKvValue'
import { callPermission, requestCallPermission, type CallPermission } from '../sos/call'
import DigestToggle from '../notify/DigestToggle'
import { PushPermissionRow } from '../notify/PushPermissionRow'
import Group, { NavRow, SwitchRow } from './Group'

/** "Hold for help can call for you": the one place besides setup that asks for the Phone permission (never the SOS flow). Android app only.
 *  Hidden when Android already took the permission back and the Alarms rows say so (AlarmHealthRow), so the same warning never shows twice. */
function CallRow() {
  const [perm, setPerm] = useState<CallPermission>('unavailable')
  const check = useKvValue<{ call_ok?: boolean | null }>(KEY_PHONE_CHECK)
  useEffect(() => { let live = true; void callPermission().then((p) => { if (live) setPerm(p) }); return () => { live = false } }, [])
  if (perm === 'unavailable' || (perm === 'denied' && check?.call_ok === false)) return null
  return (
    <div className="st-row">
      <div className="sh-grow">
        <b>Hold for help can call for you</b>
        <div className="sh-sub">{perm === 'granted' ? 'On. Hold for help calls your first contact for you. 911 always opens the dial screen.' : 'Off. Hold for help opens the dial screen and you press call.'}</div>
      </div>
      {perm === 'denied' && <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void requestCallPermission().then(setPerm)}>Allow</button>}
    </div>
  )
}

/** Settings > Alerts and reminders (#me/alerts). The 8 PM summary is DigestToggle's own card: it shows only for someone who cares for another person (carers only). */
export default function AlertsGroup() {
  const [quiet, setQuiet] = useKv<boolean>('quiet.on', true)
  return (
    <Group title="Alerts and reminders" testId="settings-alerts">
      <div className="sh-card sh-list st-list">
        <NavRow icon="bell" title="Alerts list" sub="Alert list and history" href="#notif" />
      </div>
      <DigestToggle />
      <div className="sh-card sh-list st-list">
        <PushPermissionRow />
        <SwitchRow icon="moon" title="Quiet hours" sub="10 PM to 6 AM. SOS and storm alerts still ring; other family updates are silent" on={quiet} onChange={setQuiet} />
        <AlarmHealthRow />
        <CallRow />
      </div>
    </Group>
  )
}
