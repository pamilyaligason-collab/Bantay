import { useEffect, useReducer, useRef, useState } from 'react'
import { JackArt } from '../look/JackArt'
import { type FamilyMember } from '../auth/family'
import { signInWithPin } from '../auth/pinLogin'
import { POLL_GIVE_UP_MS, RESET_COPY, completeReset, pollDelay, resetStep, startReset, type ResetState } from '../auth/pinReset'
import { Icon } from '../shell/Icon'
import SetPin from './SetPin'

const clock = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** `start-forgot` -> (new PIN) -> `start-approve-wait`. The new PIN is chosen first and held in memory, because the server only says "approved" to a reset_complete call
 *  that carries it. When a family admin approves (SEC-1, 0043: only an admin can; supersedes D-76), the poll succeeds and the person is signed in with the new PIN. */
export default function ForgotFlow({ member, onBack, google, start = startReset, complete = completeReset, signIn = signInWithPin, delay = pollDelay, giveUpMs = POLL_GIVE_UP_MS }: {
  member: FamilyMember; onBack: () => void; google: () => void
  start?: typeof startReset; complete?: typeof completeReset; signIn?: typeof signInWithPin; delay?: typeof pollDelay; giveUpMs?: number
}) {
  const [view, setView] = useState<'routes' | 'newpin'>('routes')
  const [st, send] = useReducer(resetStep, { s: 'idle' } as ResetState)
  const [err, setErr] = useState('')
  const [at, setAt] = useState<Date | null>(null)
  const handle = member.handle ?? ''
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const [tick, setTick] = useState(0)
  const [stalled, setStalled] = useState(false) // 30 minutes of polling: stop and let the person choose
  const slow = useRef(false)
  const since = useRef(Date.now())
  const now = useRef(false) // "check again" polls at once

  const begin = async (pin: string): Promise<string | null> => {
    send({ t: 'begin', pin })
    const r = await start(handle, 'family')
    if (!alive.current) return null
    if (!r.ok) { send({ t: 'start_failed', why: r.why }); return RESET_COPY[r.why] }
    setAt(new Date())
    since.current = Date.now(); slow.current = false; setTick(0); setStalled(false) // a new request starts a new 30 minutes
    send({ t: 'started', start: r.start })
    return null
  }

  // Poll while waiting (pollDelay: 10 s, backing off to 30 s; a 429 is "slow down", never a failure). The effect re-arms after each answer, so a slow
  // network never stacks requests. The machine returns the same state while not approved, so the next poll is armed by the counter.
  const waiting = st.s === 'waiting' ? st : null
  useEffect(() => {
    if (!waiting || stalled) return
    let on = true
    const t = setTimeout(async () => {
      if (Date.now() - since.current >= giveUpMs) { setStalled(true); return }
      const result = await complete(waiting.start, waiting.pin)
      slow.current = !result.ok && result.why === 'rate_limited'
      if (on) { send({ t: 'poll', result }); setTick((n) => n + 1) }
    }, now.current ? 0 : delay(tick, slow.current))
    now.current = false
    return () => { on = false; clearTimeout(t) }
  }, [waiting, tick, stalled, complete, delay, giveUpMs])
  const checkAgain = () => { since.current = Date.now(); slow.current = false; now.current = true; setTick(0); setStalled(false) }
  // Approved: sign in with the new PIN. The reducer drops the PIN at `done`, so the last waiting state's copy is kept here and cleared after use.
  const pinHeld = useRef('')
  if (waiting) pinHeld.current = waiting.pin
  useEffect(() => {
    if (st.s !== 'done') return
    const pin = pinHeld.current
    pinHeld.current = ''
    void signIn(handle, pin).then((e) => { if (e && alive.current) setErr(e) })
  }, [st.s]) // eslint-disable-line react-hooks/exhaustive-deps

  const sentTo = 'your family admin' // the server tells admins only, and the app does not know who they are

  if (st.s === 'failed') {
    return (
      <div className="si-set">
        <div className="si-c"><JackArt name="head" size={96} /><h2 className="pname">That did not work</h2></div>
        <p className="si-bad" role="alert">{RESET_COPY[st.why]}</p>
        <button type="button" className="btn" onClick={() => { send({ t: 'cancel' }); setView('routes') }}>Start again</button>
        <button type="button" className="btn2" onClick={onBack}>Back</button>
      </div>
    )
  }
  if (st.s === 'done') {
    return (
      <div className="si-set">
        <div className="si-c"><JackArt name="head" size={96} /><h2 className="pname">Approved</h2></div>
        <p className="si-hint" role="status">{err || 'Signing you in with your new PIN.'}</p>
        {err && <button type="button" className="btn2" onClick={onBack}>Back</button>}
      </div>
    )
  }
  if (waiting) {
    return (
      <div className="si-set">
        <div className="si-c">
          <JackArt name="head" size={96} />
          <h2 className="pname">Asked the family admin</h2>
          <p className="si-hint">Ask a family admin to open Bantay and tap Approve. Read them this number so they know it is you.</p>
        </div>
        <div className="grp si-c si-codebox"><span className="si-eyebrow">Your number</span><div className="si-code" aria-label={`Your number is ${waiting.start.code.split('').join(' ')}`}>{waiting.start.code}</div></div>
        <ul className="grp si-ticks">
          <li><span className="si-tick ok" aria-hidden="true"><Icon name="check" size={16} /></span><div><b>Request is waiting for {sentTo}</b><span className="si-hint">{at ? clock(at) : ''}</span></div></li>
          <li><span className="si-tick" aria-hidden="true"><Icon name="clock" size={16} /></span><div><b>Waiting for the first Approve</b><span className="si-hint" role="status">{stalled ? 'Still waiting. Nobody has tapped Approve yet.' : 'Usually a few minutes. This screen moves on by itself.'}</span></div></li>
        </ul>
        {stalled && <button type="button" className="btn" onClick={checkAgain}>Still waiting - check again</button>}
        <button type="button" className="btn2" onClick={() => { send({ t: 'cancel' }); setView('routes') }}>Try Google instead</button>
        <button type="button" className="btn2" onClick={onBack}>Cancel</button>
      </div>
    )
  }
  if (view === 'newpin' || st.s === 'starting') {
    return <SetPin name={member.displayName.split(' ')[0]} title="Choose a new PIN" canFinger={false} busy={st.s === 'starting'} onSubmit={begin} onBack={() => setView('routes')} />
  }
  return (
    <div className="si-set">
      <div className="si-c">
        <span className="avatar big" aria-hidden="true">{member.initials}</span>
        <h2 className="pname">Forgot your PIN?</h2>
        <p className="si-hint">No problem. Pick the easiest way back in. Your records are not touched.</p>
      </div>
      <button type="button" className="grp si-opt" disabled={!handle} onClick={() => setView('newpin')}>
        <span className="si-tile" aria-hidden="true"><Icon name="users" size={24} /></span>
        <span className="grow"><b>Ask a family admin to approve</b><span className="si-hint">They tap Approve in their Bantay app.</span></span>
        <Icon name="chev" size={20} />
      </button>
      <button type="button" className="grp si-opt" onClick={google}>
        <span className="si-tile" aria-hidden="true"><Icon name="shield" size={24} /></span>
        <span className="grow"><b>Sign in with Google</b><span className="si-hint">If you linked a Google account in Me.</span></span>
        <Icon name="chev" size={20} />
      </button>
      {err && <p className="si-bad" role="alert">{err}</p>}
      <button type="button" className="btn2" onClick={onBack}>Back</button>
    </div>
  )
}
