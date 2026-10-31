import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import { ensureSubscribed } from '../features/notify/alerts'
import { flushConsent } from '../features/setup/consent'
import StartDone from '../features/setup/StartDone'

const flagged = () => { try { return localStorage.getItem('bantay.onboarded') === '1' } catch { return false } }

/** First launch after joining: three screens (3 to 5: reminders, where you are, first test). Everything else (photo, medicines, SOS contacts, sharing...) is on the Today checklist,
 *  so whatever the member skips stays there. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const finish = async () => {
    await db.kv.put({ key: 'onboarded', value: true })
    try { localStorage.setItem('bantay.onboarded', '1') } catch { /* private mode */ }
    onDone()
  }
  return <StartDone onDone={() => void finish()} />
}

/** Shows onboarding on first launch. A deep link to a tab (notification tap, shared link) skips it. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'show' | 'done'>('loading')
  useEffect(() => {
    ensureSubscribed()
    void flushConsent() // a consent notice that could not be sent at start-done goes now
    db.kv.get('onboarded').then((r) => setState(r?.value || flagged() || (location.hash !== '' && location.hash !== '#welcome') ? 'done' : 'show'))
  }, [])
  if (state === 'loading') return null
  return state === 'show' ? <Onboarding onDone={() => setState('done')} /> : <>{children}</>
}
