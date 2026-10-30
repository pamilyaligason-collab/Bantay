import { useCallback, useEffect, useState } from 'react'
import { ldb } from '../log/store'
import { liveMedicines, parseSchedule, toMinutes } from '../health/meds'
import { Row } from '../look/Row'
import { currentPersonId } from '../sensors/health'
import { DENIALS_BEFORE_SETTINGS, bumpNotifyDenials, notifyDenials, notifyState, onResume, openAppSettings, turnOnReminders } from './steps'

const clock = (hhmm: string) => {
  const m = toMinutes(hhmm)
  if (m == null) return '' // unknown time: show nothing, never 12:00 AM
  return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** The doses on file, one line each: "Losartan 50 mg · 9:00 AM". Empty list = none on file. */
async function dosesOnFile(): Promise<string[]> {
  const id = await currentPersonId().catch(() => null)
  if (!id) return []
  const meds = liveMedicines(await ldb.medications.where('personId').equals(id).toArray().catch(() => []), id)
  return meds.map((m) => {
    const times = parseSchedule(m.schedule).times.map(clock).filter(Boolean).join(', ')
    const name = [m.name, m.strength || m.dose].filter(Boolean).join(' ')
    return times ? `${name} · ${times}` : name
  })
}

/** Onboarding screen 3: the permission is asked here, in context (O-2). After two refusals Android no longer prompts, so the button opens the app's settings (m2-3). */
export default function RemindersStep({ onNext }: { onNext: () => void }) {
  const [doses, setDoses] = useState<string[] | null>(null)
  const [denials, setDenials] = useState(0)
  const [busy, setBusy] = useState(false)
  const [on, setOn] = useState(false)
  const refresh = useCallback(() => { void notifyState().then((n) => setOn(n.display)); void notifyDenials().then(setDenials) }, [])
  useEffect(() => { void dosesOnFile().then(setDoses); refresh() }, [refresh])
  useEffect(() => onResume(refresh), [refresh])
  const settings = denials >= DENIALS_BEFORE_SETTINGS && !on
  const turnOn = async () => {
    setBusy(true)
    try {
      if (settings) { await openAppSettings(); return } // back from Settings: onResume re-reads the switch
      await turnOnReminders()
      const n = await notifyState()
      if (n.display) { onNext(); return }
      setDenials(await bumpNotifyDenials())
    } finally { setBusy(false) }
  }
  return (
    <div className="ob-page">
      <div className="hdr"><h1>Medicine reminders</h1><span>Bantay rings at each dose, even with the screen off.</span></div>
      {doses && doses.length > 0 ? (
        <>
          <ul className="ob-list" aria-label="Doses on file">{doses.map((d) => <li key={d}><Row icon="pill" title={d} /></li>)}</ul>
          <p className="ob-note">Not right? Fix later in Health.</p>
        </>
      ) : doses && <p className="ob-note">No medicines yet. Your carer can add them.</p>}
      {settings && <p className="ob-note" role="status">Android needs you to allow notifications there.</p>}
      <div className="ob-grow" />
      <div className="ob-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void turnOn()}>{settings ? 'Open app settings' : 'Turn on reminders'}</button>
        <button type="button" className="btn2" onClick={onNext}>Not now</button>
      </div>
    </div>
  )
}
