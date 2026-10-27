import { useState } from 'react'
import '../shell/shell.css'
import { UpdateSheet } from './UpdateSheet'
import { checkForUpdate, useUpdate } from './useUpdate'

const when = (t: number | null) => (t ? new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '')

/** Me > version row: "App <shell versionName> · Screens <build date>" + Check for updates. The shell number comes from the APK; in a browser it falls back to the web build's. */
export function UpdateRow() {
  const u = useUpdate()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const web = String(import.meta.env.VITE_APP_VERSION ?? 'dev')
  const built = String(import.meta.env.VITE_BUILD_DATE ?? '')
  const version = u.shell && u.shell.versionCode !== 0 ? u.shell.versionName : web
  const check = async () => {
    setNote('Checking...')
    const s = await checkForUpdate(true)
    if (s.shell?.versionCode === 0) setNote('This web version updates by itself. Updates you choose come with the Android app.')
    else if (s.decision.kind !== 'none') { setNote(''); setOpen(true) }
    else setNote(s.failed ? 'Could not check. Try again when you have signal.' : `You have the latest version${s.checkedAt ? `. Checked ${when(s.checkedAt)}` : ''}`)
  }
  const sub = note || (u.decision.kind !== 'none' ? `${u.decision.latest.versionName} is ready${u.checkedAt ? ` · checked ${when(u.checkedAt)}` : ''}` : u.checkedAt ? `Checked ${when(u.checkedAt)}` : 'Not checked yet')
  return (
    <>
      <div>
        <div className="sh-grow"><b>App {version}{built && ` · Screens ${built}`}</b><div className="sh-sub" role="status">{sub}</div></div>
        <button type="button" className="sh-pill sh-ghost sh-small" disabled={u.checking} onClick={() => void check()}>Check for updates</button>
      </div>
      {open && u.decision.kind !== 'none' && <UpdateSheet latest={u.decision.latest} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Me > version line for everyone (mockup start-me "Bantay 2.0.0 · Up to date"). No button: Check for updates is the admin row, and a ready update still shows on Today (UpdateCard).
 *  "Up to date" is said only after a real check found nothing newer; before that, or after a failed check, it says so. */
export function VersionRow() {
  const u = useUpdate()
  const web = String(import.meta.env.VITE_APP_VERSION ?? 'dev')
  const version = u.shell && u.shell.versionCode !== 0 ? u.shell.versionName : web
  const sub = u.decision.kind !== 'none' ? `${u.decision.latest.versionName} is ready` : u.checkedAt && !u.failed ? 'Up to date' : 'Not checked yet'
  return <div><div className="sh-grow"><b>Bantay {version}</b><div className="sh-sub" role="status">{sub}</div></div></div>
}
