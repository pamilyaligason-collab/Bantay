import { useEffect, useReducer, useRef, useState } from 'react'
import { MASCOT_ALT, MASCOT_SRC } from '../../assets/mascot'
import { loadFamily, type FamilyMember } from '../auth/family'
import { signInWithPin } from '../auth/pinLogin'
import { RESET_COPY, completeReset, resetStep, startReset, type ResetState } from '../auth/pinReset'
import { Icon } from '../shell/Icon'
import SetPin from './SetPin'

export const POLL_MS = 3000
const clock = (d: Date) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** `start-forgot` -> (new PIN) -> `start-approve-wait`. The new PIN is chosen first and held in memory, because the server only says "approved" to a reset_complete call
 *  that carries it. When a family member approves, the poll succeeds and the person is signed in with the new PIN. No admin anywhere (D-76). */
export default function ForgotFlow({ member, onBack, google, start = startReset, complete = completeReset, signIn = signInWithPin, pollMs = POLL_MS }: {
  member: FamilyMember; onBack: () => void; google: () => void
  start?: typeof startReset; complete?: typeof completeReset; signIn?: typeof signInWithPin; pollMs?: number
}) {
  const [view, setView] = useState<'routes' | 'newpin'>('routes')
  const [st, send] = useReducer(resetStep, { s: 'idle' } as ResetState)
  const [err, setErr] = useState('')
  const [at, setAt] = useState<Date | null>(null)
  const handle = member.handle ?? ''
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const begin = async (pin: string): Promise<string | null> => {
    send({ t: 'begin', pin })
    const r = await start(handle, 'family')
    if (!alive.current) return null
    if (!r.ok) { send({ t: 'start_failed', why: r.why }); return RESET_COPY[r.why] }
    setAt(new Date())
    send({ t: 'started', start: r.start })
    return null
  }

  // Poll while waiting. The effect re-arms after each answer, so a slow network never stacks requests.
  const waiting = st.s === 'waiting' ? st : null
  const [tick, setTick] = useState(0) // the machine returns the same state while not approved, so the next poll is armed by this counter
  useEffect(() => {
    if (!waiting) return
    let on = true
    const t = setTimeout(async () => {
      const result = await complete(waiting.start, waiting.pin)
      if (on) { send({ t: 'poll', result }); setTick((n) => n + 1) }
    }, pollMs)
    return () => { on = false; clearTimeout(t) }
  }, [waiting, tick, complete, pollMs])
  // Approved: sign in with the new PIN. The reducer drops the PIN at `done`, so the last waiting state's copy is kept here and cleared after use.
  const pinHeld = useRef('')
  if (waiting) pinHeld.current = waiting.pin
  useEffect(() => {
    if (st.s !== 'done') return
    const pin = pinHeld.current
    pinHeld.current = ''
    void signIn(handle, pin).then((e) => { if (e && alive.current) setErr(e) })
  }, [st.s]) // eslint-disable-line react-hooks/exhaustive-deps

  const others = loadFamily().filter((m) => m.personId !== member.personId).map((m) => m.displayName.trim()).filter(Boolean).slice(0, 3)
  const sentTo = others.length ? others.length === 1 ? others[0]! : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}` : 'your family'

  if (st.s === 'failed') {
    return (
      <div className="si-set">
        <div className="si-c"><img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={96} height={96} /><h2 className="pname">That did not work</h2></div>
        <p className="si-bad" role="alert">{RESET_COPY[st.why]}</p>
        <button type="button" className="btn" onClick={() => { send({ t: 'cancel' }); setView('routes') }}>Start again</button>
        <button type="button" className="btn2" onClick={onBack}>Back</button>
      </div>
    )
  }
  if (st.s === 'done') {
    return (
      <div className="si-set">
        <div className="si-c"><img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={96} height={96} /><h2 className="pname">Approved</h2></div>
        <p className="si-hint" role="status">{err || 'Signing you in with your new PIN.'}</p>
        {err && <button type="button" className="btn2" onClick={onBack}>Back</button>}
      </div>
    )
  }
  if (waiting) {
    return (
      <div className="si-set">
        <div className="si-c">
          <img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={96} height={96} />
          <h2 className="pname">Asked the family</h2>
          <p className="si-hint">Ask a family member to open Bantay and tap Approve. Read them this number so they know it is you.</p>
        </div>
        <div className="grp si-c si-codebox"><span className="si-eyebrow">Your number</span><div className="si-code" aria-label={`Your number is ${waiting.start.code.split('').join(' ')}`}>{waiting.start.code}</div></div>
        <ul className="grp si-ticks">
          <li><span className="si-tick ok" aria-hidden="true"><Icon name="check" size={16} /></span><div><b>Request is waiting for {sentTo}</b><span className="si-hint">{at ? clock(at) : ''}</span></div></li>
          <li><span className="si-tick" aria-hidden="true"><Icon name="clock" size={16} /></span><div><b>Waiting for the first Approve</b><span className="si-hint" role="status">Usually a few minutes. This screen moves on by itself.</span></div></li>
        </ul>
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
        <span className="si-tile" aria-hidden="true"><Icon name="users" size={22} /></span>
        <span className="grow"><b>Ask a family member to approve</b><span className="si-hint">They tap Approve in their Bantay app.</span></span>
        <Icon name="chev" size={20} />
      </button>
      <button type="button" className="grp si-opt" onClick={google}>
        <span className="si-tile" aria-hidden="true"><Icon name="shield" size={22} /></span>
        <span className="grow"><b>Sign in with Google</b><span className="si-hint">If you linked a Google account in Me.</span></span>
        <Icon name="chev" size={20} />
      </button>
      {err && <p className="si-bad" role="alert">{err}</p>}
      <button type="button" className="btn2" onClick={onBack}>Back</button>
    </div>
  )
}
