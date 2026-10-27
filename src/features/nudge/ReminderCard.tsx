import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useEffect, useState } from 'react'
import { DEFAULT_BP_TIME, getBpTimes, setBpTimes } from './bpReminder'

/** The morning blood pressure reminder with a reply box. Off until the person turns it on; the time is kept on this phone only (kv nudge.bpTimes). Native only: a browser has no lock screen. */
export function ReminderCard() {
  const native = Capacitor.isNativePlatform()
  const [time, setTime] = useState<string | null>(null) // null = off
  const [asked, setAsked] = useState(false)
  useEffect(() => { void getBpTimes().then((t) => setTime(t[0] ?? null)).catch(() => undefined).finally(() => setAsked(true)) }, [])
  const toggle = async () => {
    if (time) { setTime(null); await setBpTimes([]); return }
    try { await LocalNotifications.requestPermissions() } catch { /* the plan below reports no-permission quietly; Me shows the phone checks */ }
    setTime(DEFAULT_BP_TIME)
    await setBpTimes([DEFAULT_BP_TIME])
  }
  const change = async (v: string) => { if (/^\d{2}:\d{2}$/.test(v)) { setTime(v); await setBpTimes([v]) } }
  return (
    <section className="sh-card nu-card" data-testid="nudge-reminder" aria-labelledby="nu-rem-h">
      <h2 className="sh-h2" id="nu-rem-h">Morning blood pressure reminder</h2>
      {!native ? <p className="sh-sub">Reminders with a reply box work in the Bantay app on your phone.</p> : (
        <>
          <div className="nu-row">
            <span className="sh-grow">Remind me to check{time ? ` at` : ''}</span>
            {time && <input type="time" className="nu-time" value={time} onChange={(e) => void change(e.target.value)} aria-label="Reminder time" />}
            <button type="button" role="switch" aria-checked={!!time} aria-label="Morning blood pressure reminder" className="sh-switch" disabled={!asked} onClick={() => void toggle()} />
          </div>
          <p className="sh-sub">When it rings, type your two numbers in the notification, like 128/82, and Bantay saves them. Words it cannot read are never saved.</p>
        </>
      )}
    </section>
  )
}
