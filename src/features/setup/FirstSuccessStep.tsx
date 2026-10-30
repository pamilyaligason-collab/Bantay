import { useEffect, useState } from 'react'
import { track } from '../admin/events'
import { CheckDraw } from '../look/CheckDraw'
import { scheduleTestAlarm } from '../phonecheck/probe'
import { Icon } from '../shell/Icon'
import { notifyState } from './steps'

/** The D-86 behaviour in one sentence (A-15, M2-4): private until shared and accepted, admins can read. Shown on onboarding screen 5 and in the Wizard's Sharing step. */
export const CONSENT_LINE = 'Your records stay private until you or a family admin share them and the person accepts. Family admins can see them. Change this in Settings > Family and sharing.'

const SECONDS = 5

type Phase = 'idle' | 'wait' | 'rung' | 'failed'

/** Onboarding screen 5: the first success is a reminder that rings (O-1). The ring is scheduleTestAlarm(5) on the alarm channel (not steps.scheduleTest, ML-10).
 *  shortcut: "it rang" is a 5 s timer while Bantay is open, not a delivery receipt; upgrade to a notification-received listener if a phone shows a false pass. */
export default function FirstSuccessStep({ name, onRung, onBackToReminders, onOpenToday }: { name: string; onRung?: () => void; onBackToReminders: () => void; onOpenToday: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [left, setLeft] = useState(SECONDS)
  const [allowed, setAllowed] = useState<boolean | null>(null) // null until the switch is read: unknown is never "off"
  const [web, setWeb] = useState(false)
  useEffect(() => { void notifyState().then((n) => setAllowed(n.display)) }, [])
  useEffect(() => {
    if (phase !== 'wait') return
    if (left <= 0) {
      if (web) { try { new Notification('Bantay test', { body: 'Reminders work on this phone.' }) } catch { /* the page still says it worked: the switch was on */ } }
      void track('action', 'onboard_test_rang')
      setPhase('rung')
      onRung?.()
      return
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, left, web]) // eslint-disable-line react-hooks/exhaustive-deps -- onRung is a one-shot callback
  const send = async () => {
    const r = await scheduleTestAlarm(SECONDS)
    if (r === 'no-permission') { setAllowed(false); return }
    if (r === 'failed') { setPhase('failed'); return }
    setWeb(r === 'web')
    setLeft(SECONDS)
    setPhase('wait')
  }
  const blocked = allowed === false && phase !== 'rung'

  if (phase === 'rung') {
    return (
      <div className="ob-page">
        <div className="ob-grow" />
        <div className="ob-center" role="status">
          <CheckDraw size={96} />
          <h1>{name ? `It works. You're set, ${name}.` : "It works. You're set."}</h1>
        </div>
        <p className="ob-consent">{CONSENT_LINE}</p>
        <div className="ob-grow" />
        <div className="ob-actions"><button type="button" className="btn" onClick={onOpenToday}>Open Today</button></div>
      </div>
    )
  }
  return (
    <div className="ob-page">
      <div className="hdr"><h1>Let's test it.</h1><span>Tap below. Your phone rings in 5 seconds.</span></div>
      {blocked && <p className="ob-note" role="status">Reminders are off, so the test cannot ring.</p>}
      {phase === 'failed' && <p className="ob-bad" role="alert">The test reminder could not be set. Check the switches in Settings.</p>}
      <div className="ob-grow" />
      <p className="ob-consent">{CONSENT_LINE}</p>
      <div className="ob-actions">
        {blocked
          ? <button type="button" className="btn" onClick={onBackToReminders}>Turn on reminders first</button>
          : <button type="button" className="btn" disabled={phase === 'wait'} onClick={() => void send()}><Icon name="bell" size={20} />{phase === 'wait' ? `Ringing in ${left}` : 'Send a test reminder'}</button>}
        {phase === 'failed' && <button type="button" className="btn2" onClick={onOpenToday}>Open Today</button>}
      </div>
    </div>
  )
}
