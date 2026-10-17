import { useEffect, useRef, useState } from 'react'
import { Sky } from '../features/look'
import { signInWithGoogle, signInWithPin } from '../features/auth/pinLogin'
import { hasPasskeyFlag, loadFamily, passkeySupported, signInWithPasskey, abandonPasskeyWait, type FamilyMember } from '../features/auth/family'
import { urlSignInError } from '../features/auth/urlError'

/** Six-digit PIN pad (56px keys). Calls onDone with the PIN; the pad clears itself so a miss starts fresh. */
function PinPad({ busy, onDone }: { busy: boolean; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const add = (d: string) => { if (!busy) setPin((p) => (p.length < 6 ? p + d : p)) }
  const back = () => setPin((p) => p.slice(0, -1))
  useEffect(() => { if (pin.length === 6) { onDone(pin); setPin('') } }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') back() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
  return (
    <div className="pinpad">
      <div className="dots" role="img" aria-label={`${pin.length} of 6 digits entered`}>
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="key" disabled={busy} onClick={() => add(d)}>{d}</button>)}
        <span />
        <button type="button" className="key" disabled={busy} onClick={() => add('0')}>0</button>
        <button type="button" className="key" aria-label="Delete last digit" disabled={busy || !pin} onClick={back}>⌫</button>
      </div>
    </div>
  )
}

/** The two original ways in, for a new phone or someone not in the list. */
function OtherWays({ run, busy }: { run: (f: () => Promise<string | null>) => void; busy: boolean }) {
  const [showPin, setShowPin] = useState(false)
  const [handle, setHandle] = useState('')
  const [pin, setPin] = useState('')
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button>
      {!showPin ? (
        <button className="btn2" onClick={() => setShowPin(true)}>Sign in with your name and PIN</button>
      ) : (
        <form className="grp signin" onSubmit={(e) => { e.preventDefault(); if (handle && pin.length === 6) { run(() => signInWithPin(handle, pin)); setPin('') } }}>
          <label className="row" htmlFor="si-handle">
            <span className="si-l">Name</span>
            <input id="si-handle" name="bantay-handle" type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} enterKeyHint="next" placeholder="your handle" autoFocus />
          </label>
          <label className="row" htmlFor="si-pin">
            <span className="si-l">PIN</span>
            <input id="si-pin" name="bantay-pin" type="password" inputMode="numeric" pattern="[0-9]*" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="off" maxLength={6} enterKeyHint="go" placeholder="6 digits" />
          </label>
          <div className="row"><button className="btn" type="submit" disabled={busy || !handle || pin.length !== 6}>Sign in</button></div>
        </form>
      )}
      {showPin && <p className="si-hint">Five wrong tries lock sign-in for 15 minutes. Ask your family admin to reset your PIN.</p>}
    </>
  )
}

/** The tapped person. Fingerprint first when it is on for this phone; the PIN pad shows on cancel, error, mismatch, or
 *  "Use PIN instead". The prompt starts once per mount (the card is keyed by person), so a miss never loops. */
function PickCard({ pick, busy, run, setError, onBack }: {
  pick: FamilyMember; busy: boolean; run: (f: () => Promise<string | null>) => void
  setError: (e: string) => void; onBack: () => void
}) {
  const fp = passkeySupported() && hasPasskeyFlag(pick.personId)
  const [phase, setPhase] = useState<'prompting' | 'pin'>(fp ? 'prompting' : 'pin')
  const seq = useRef(0)
  const head = useRef<HTMLHeadingElement>(null)
  const alive = useRef(true)
  const ask = () => {
    abandonPasskeyWait()
    setError('')
    setPhase('prompting')
    const mine = ++seq.current
    void signInWithPasskey(pick.personId).then((e) => {
      if (!alive.current || mine !== seq.current) return // unmounted, or a newer prompt replaced this one
      if (e) { setError(e); setPhase('pin') }
    })
  }
  useEffect(() => {
    alive.current = true
    if (fp) ask()
    return () => { alive.current = false; abandonPasskeyWait() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'pin') head.current?.focus() }, [phase])
  const pin = pick.provider === 'pin' && pick.handle ? pick.handle : null
  return (
    <div className="grp pickcard">
      <span className="avatar big" aria-hidden="true">{pick.initials}</span>
      <h2 className="pname" ref={head} tabIndex={-1}>{pick.displayName}</h2>
      {phase === 'prompting' ? (
        <>
          <p className="si-hint" role="status">Use your fingerprint or face now.</p>
          {pin
            ? <button className="btn2" autoFocus onClick={() => { ++seq.current; abandonPasskeyWait(); setPhase('pin') }}>Use PIN instead</button>
            : <button className="btn2" autoFocus disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google instead</button>}
        </>
      ) : (
        <>
          {fp && <button className="btn" onClick={ask}>Use fingerprint or face</button>}
          {pin ? <PinPad busy={busy} onDone={(p) => run(() => signInWithPin(pin, p))} />
            : <button className={fp ? 'btn2' : 'btn'} disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button>}
        </>
      )}
      <button className="btn2" onClick={onBack}>Back</button>
    </div>
  )
}

/** Shown by AuthGate when nobody is signed in. On success supabase-js fires an auth change and AuthGate takes over.
 *  The family picker appears only on a phone that signed in before (cache in localStorage); a fresh phone never lists names. */
export default function SignIn() {
  const [family] = useState(loadFamily)
  const [pick, setPick] = useState<FamilyMember | null>(null)
  const [other, setOther] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(urlSignInError ?? '')

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    setError('')
    const e = await f()
    if (e) setError(e)
    setBusy(false)
  }
  const picker = family.length > 0 && !other

  return (
    <div className="bt">
      <Sky state="clear" />
      <div className="topbar" />
      <main className="scroll">
        <div className="hdr">
          <h1>Sign in</h1>
          <span>Family Bantay keeps your family’s health private.</span>
        </div>

        {picker && !pick && (
          <>
            <p className="si-hint">Who is this?</p>
            <div className="faces">
              {family.map((m) => (
                <button key={m.personId} className="face glass" onClick={() => { setError(''); setPick(m) }}>
                  <span className="avatar" aria-hidden="true">{m.initials}</span>
                  <span className="fname">{m.displayName}</span>
                </button>
              ))}
            </div>
            <button className="btn2" onClick={() => { setError(''); setOther(true) }}>Not in the list?</button>
          </>
        )}

        {picker && pick && (
          <PickCard key={pick.personId} pick={pick} busy={busy} run={run} setError={setError} onBack={() => { setError(''); setPick(null) }} />
        )}

        {!picker && (
          <>
            <OtherWays run={run} busy={busy} />
            {family.length > 0
              ? <button className="btn2" onClick={() => setOther(false)}>Back to the family</button>
              : <p className="si-hint">First time on this phone? Sign in once and it will remember your family.</p>}
          </>
        )}

        {error && <p className="grp si-err" role="alert">{error}</p>}
      </main>
    </div>
  )
}
