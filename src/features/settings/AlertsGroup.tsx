import { useEffect, useState } from 'react'
import { useKv } from '../shell/useKv'
import { AlarmHealthRow } from '../phonecheck/AlarmHealthRow'
import { KEY_PHONE_CHECK } from '../phonecheck/keys'
import { useKvValue } from '../phonecheck/useKvValue'
import { callPermission, requestCallPermission, type CallPermission } from '../sos/call'
import DigestToggle from '../notify/DigestToggle'
import { PushPermissionRow } from '../notify/PushPermissionRow'
import Group, { LaterRow, NavRow, SwitchRow } from './Group'

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

/** World alerts (Settings board, marked Later): hazards near family, Philippines-wide warnings, digest time and the SMS fallback all need the server to remember a choice per person
 *  (a prefs table and the broadcast function reading it). Until then they are shown dim with a Later pill and no control, so nothing pretends to work. */
function WorldAlertsLater() {
  return (
    <>
      <div className="st-h"><h2>World alerts</h2><span className="st-tag">LATER</span></div>
      <div className="sh-card sh-list st-list" data-testid="world-alerts-later">
        <LaterRow icon="warn" tint="red" title="Hazards near family" sub="Instant. Home zones, plus members who share their place." />
        <LaterRow icon="bolt" tint="amber" title="Philippines-wide warnings" sub="Instant when urgent, otherwise in the digest." />
        <LaterRow icon="clock" tint="green" title="Daily digest time" sub="World big events and news, once a day." />
        <LaterRow icon="msg" tint="blue" title="SMS fallback" sub="Text message if push does not arrive. Carrier charges may apply." />
      </div>
      <div className="sh-card st-later-card">Not on yet. These need Bantay's server to remember a choice for each person. Today Bantay alerts everyone when a PAGASA wind signal covers a home zone, and admins can send a storm, flood or heat warning. Other warnings show on Safety when you open Bantay. Your phone's own carrier alerts (cell broadcast) work even without Bantay.</div>
    </>
  )
}

/** Settings > Alerts and reminders (#me/alerts), as the Settings board: Alerts list, "This phone" (push, quiet hours, alarms), "For carers" (the 8 PM summary: carers only), World alerts (Later). */
export default function AlertsGroup() {
  const [quiet, setQuiet] = useKv<boolean>('quiet.on', true)
  return (
    <Group title="Alerts and reminders" testId="settings-alerts">
      <div className="sh-card sh-list st-list">
        <NavRow icon="file" tint="red" title="Alerts list" sub="Alert list and history" href="#notif" />
      </div>
      <div className="st-h"><h2>This phone</h2></div>
      <div className="sh-card sh-list st-list">
        <PushPermissionRow />
        <SwitchRow icon="moon" tint="purple" title="Quiet hours" sub="10 PM to 6 AM. SOS and storm alerts still ring; other family updates are silent" on={quiet} onChange={setQuiet} />
        <AlarmHealthRow />
        <CallRow />
      </div>
      <DigestToggle />
      <WorldAlertsLater />
    </Group>
  )
}
