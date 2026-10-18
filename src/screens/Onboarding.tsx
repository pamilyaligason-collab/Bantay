import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db'
import { ensureSubscribed } from '../features/notify/alerts'
import Wizard from '../features/setup/Wizard'

const flagged = () => { try { return localStorage.getItem('bantay.onboarded') === '1' } catch { return false } }

/** First-launch setup: the data-driven wizard (src/features/setup). Whatever the member skips stays on the Today checklist. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const finish = async () => {
    await db.kv.put({ key: 'onboarded', value: true })
    try { localStorage.setItem('bantay.onboarded', '1') } catch { /* private mode */ }
    onDone()
  }
  return <Wizard onDone={finish} />
}

/** Shows onboarding on first launch. A deep link to a tab (notification tap, shared link) skips it. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'show' | 'done'>('loading')
  useEffect(() => {
    ensureSubscribed()
    db.kv.get('onboarded').then((r) => setState(r?.value || flagged() || (location.hash !== '' && location.hash !== '#welcome') ? 'done' : 'show'))
  }, [])
  if (state === 'loading') return null
  return state === 'show' ? <Onboarding onDone={() => setState('done')} /> : <>{children}</>
}
