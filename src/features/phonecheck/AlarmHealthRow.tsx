import { useState } from 'react'
import { syncDoseReminders } from '../health/reminders'
import { isNativeAndroid } from '../safety/settingsOpener'
import '../shell/shell.css'
import { applyFix, fixCopy } from './fix'
import { KEY_ALARM_HEALTH, KEY_PHONE_CHECK, type AlarmHealth } from './keys'
import { PhoneCheckCard } from './PhoneCheckCard'
import { probe, probeProblems, scheduleTestAlarm, type ProbeResult } from './probe'
import { reportPhoneHealth } from './report'
import { useKvValue } from './useKvValue'

const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) }

/** The text under the row title: what was checked, how many alarms are set, how many had to be set again (mockup `today-alarmfix`: "Alarms checked 8:40, 3 of 3 set (1 set again)"). */
export function healthLine(h: AlarmHealth | undefined): string {
  if (!h) return 'Not checked yet'
  if (!h.ok) return `Alarms checked ${when(h.at)}. Bantay could not set them; tap Check now.`
  const again = h.rearmed > 0 ? ` (${h.rearmed} set again)` : ''
  return `Alarms checked ${when(h.at)}, ${h.set} set${h.days ? ` for the next ${h.days} days` : ''}${again}`
}

/** Me > "Alarms" row (owner of Me.tsx is S6c, which mounts this one line). Android app only: the browser app has no phone alarms. Shows the last self-check, "Check now", a test alarm,
 *  what needs fixing, and, when Android took back the Phone permission, "Hold for help can no longer call for you, tap to allow". */
export function AlarmHealthRow() {
  const health = useKvValue<AlarmHealth>(KEY_ALARM_HEALTH)
  const check = useKvValue<ProbeResult & { at?: string }>(KEY_PHONE_CHECK)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [fixing, setFixing] = useState(false)
  if (!isNativeAndroid()) return null
  const problems = check ? probeProblems(check) : []
  const alarmProblems = problems.filter((p) => p !== 'call')
  const run = async () => {
    setBusy(true); setNote('')
    await syncDoseReminders()
    const r = await probe()
    void reportPhoneHealth({ result: r })
    setBusy(false)
    setNote(probeProblems(r).filter((p) => p !== 'call').length ? '' : 'Checked. Alarms are set.')
  }
  const test = async () => {
    const o = await scheduleTestAlarm()
    setNote(o === 'scheduled' ? 'A test alarm will ring in a few seconds.' : o === 'no-permission' ? 'Turn notifications on for Bantay first.' : 'The test alarm could not be set.')
  }
  return (
    <>
      <div>
        <div className="sh-grow">
          <b>Alarms</b>
          <div className="sh-sub" role="status">{alarmProblems.length ? fixCopy(alarmProblems[0]!, check?.oem ?? null).title.replace('One thing to fix: ', 'Needs fixing: ') : note || healthLine(health)}</div>
        </div>
        {alarmProblems.length
          ? <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => setFixing((x) => !x)}>Fix</button>
          : <button type="button" className="sh-pill sh-ghost sh-small" disabled={busy} onClick={() => void run()}>Check now</button>}
      </div>
      {fixing && check && alarmProblems.length > 0 && <PhoneCheckCard result={check} onFixed={() => setFixing(false)} onLater={() => setFixing(false)} />}
      <div>
        <div className="sh-grow"><b>Test alarm</b><div className="sh-sub">Hear how a medicine alarm rings. It rings loudly.</div></div>
        <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void test()}>Test</button>
      </div>
      {check?.call_ok === false && (
        <div>
          <div className="sh-grow"><b>Hold for help can no longer call for you</b><div className="sh-sub">Tap to allow</div></div>
          <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => void applyFix('call')}>Allow</button>
        </div>
      )}
    </>
  )
}
