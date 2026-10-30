import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../admin/events'
import { loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import FirstSuccessStep from './FirstSuccessStep'
import RemindersStep from './RemindersStep'
import { OnbDots } from './SetPin'
import WhereStep from './WhereStep'
import { recordConsent } from './consent'
import './setup.css'
import './onboarding.css'

type Step = 3 | 4 | 5
const SKIP_NAME = { 3: 'onboard_skip_reminders', 4: 'onboard_skip_where', 5: 'onboard_skip_test' } as const

/** Onboarding screens 3 to 5 of 5 (screens 1 and 2 are the welcome and PIN, shown before sign-in): Reminders, Where you are, First success.
 *  Skip on 3-5 records nothing; the step stays on the Today setup row (useSetupLeft). System back steps back one screen (one history entry per screen).
 *  Consent is a quiet line on screen 5, never a question: it is written when the person leaves for Today. */
export default function StartDone({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>(3)
  const [name, setName] = useState('')
  const [rung, setRung] = useState(false)
  const stepRef = useRef<Step>(3)
  const closed = useRef(false)
  useEffect(() => {
    let live = true
    void getMember().then((m) => {
      if (!live || !m?.personId) return
      setName(loadFamily().find((f) => f.personId === m.personId)?.displayName.trim().split(/\s+/)[0] ?? '')
    }).catch(() => undefined)
    const back = () => { if (!closed.current && stepRef.current > 3) { stepRef.current = (stepRef.current - 1) as Step; setStep(stepRef.current) } }
    window.addEventListener('popstate', back)
    return () => { live = false; window.removeEventListener('popstate', back) }
  }, [])
  const go = useCallback((n: Step) => {
    if (n > stepRef.current) { try { history.pushState({ bantayOnb: n }, '') } catch { /* no history */ } }
    stepRef.current = n
    setStep(n)
  }, [])
  const leave = (consent: boolean) => {
    if (closed.current) return
    closed.current = true
    if (stepRef.current > 3) { try { history.go(3 - stepRef.current) } catch { /* no history */ } } // drop this screen's own entries
    if (consent) void recordConsent()
    onDone()
  }
  const next = () => (step < 5 ? go((step + 1) as Step) : leave(true))
  const skip = () => { void track('action', SKIP_NAME[step]); next() }
  return (
    <div className="bt">
      <div className="topbar" />
      <main className="scroll si-set ob-main" key={step}>
        <OnbDots n={step} />
        {!(step === 5 && rung) && <div className="ob-top"><button type="button" className="ob-skip" onClick={skip}>Skip</button></div>}
        <div className="ob-slide ob-page">
          {step === 3 && <RemindersStep onNext={next} />}
          {step === 4 && <WhereStep onNext={next} />}
          {step === 5 && <FirstSuccessStep name={name} onRung={() => setRung(true)} onBackToReminders={() => go(3)} onOpenToday={() => leave(true)} />}
        </div>
      </main>
    </div>
  )
}
