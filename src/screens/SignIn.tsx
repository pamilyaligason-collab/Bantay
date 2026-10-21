import { useEffect, useRef, useState } from 'react'
import { Sky } from '../features/look'
import { NO_SIGNAL, SIGN_IN_ERROR, fetchFamilyNames, requestPinReset, signInWithGoogle, signInWithPin, type NamesResult } from '../features/auth/pinLogin'
import { afterFailure, loadFails, pinState, saveFails } from '../features/auth/pinAttempts'
import '../features/auth/signin.css'
import { MASCOT_ALT, MASCOT_SRC } from '../assets/mascot'
import { getLastPerson, hasPasskeyFlag, loadFamily, passkeySupported, signInWithPasskey, abandonPasskeyWait, type FamilyMember } from '../features/auth/family'
import { urlSignInError } from '../features/auth/urlError'
import { onNativeSignInError } from '../features/auth/nativeOAuth'
import { Icon } from '../features/shell/Icon'

/** Six-digit PIN pad (56px keys). Calls onDone with the PIN; the pad clears itself so a miss starts fresh. */
function PinPad({ busy, onDone, shake = 0 }: { busy: boolean; onDone: (pin: string) => void; shake?: number }) {
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
      <div key={shake} className={shake ? 'dots shake' : 'dots'} role="img" aria-label={`${pin.length} of 6 digits entered`}>
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
function OtherWays({ run, busy, tryPin, google, onForgot }: {
  run: (f: () => Promise<string | null>) => void; busy: boolean
  tryPin: (handle: string, pin: string) => Promise<string | null>; google: () => void; onForgot: (handle: string) => void
}) {
  const [showPin, setShowPin] = useState(false)
  const [handle, setHandle] = useState('')
  const [pin, setPin] = useState('')
  return (
    <>
      <button className="btn" disabled={busy} onClick={google}>Admin? Continue with Google</button>
      {!showPin ? (
        <button className="btn2" onClick={() => setShowPin(true)}>Sign in with your name and PIN</button>
      ) : (
        <form className="grp signin" onSubmit={(e) => { e.preventDefault(); if (handle && pin.length === 6) { run(() => tryPin(handle, pin)); setPin('') } }}>
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
      {showPin && <button className="si-link" onClick={() => onForgot(handle)}>Forgot PIN? Ask an admin</button>}
    </>
  )
}

/** The tapped person. Fingerprint first when it is on for this phone; the PIN pad shows on cancel, error, mismatch, or
 *  "Use PIN instead". The prompt starts once per mount (the card is keyed by person), so a miss never loops. */
function PickCard({ pick, busy, run, setError, onBack, returning, tryPin, google, shake, onForgot }: {
  pick: FamilyMember; returning: boolean; busy: boolean; run: (f: () => Promise<string | null>) => void
  setError: (e: string) => void; onBack: () => void
  tryPin: (handle: string, pin: string) => Promise<string | null>; google: () => void; shake: number; onForgot: () => void
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
    if (fp) ask() // older iOS Safari may reject a passkey prompt without a user gesture; the catch path then shows the PIN pad
    return () => { alive.current = false; abandonPasskeyWait() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'pin') head.current?.focus() }, [phase])
  const pin = pick.provider === 'pin' && pick.handle ? pick.handle : null
  return (
    <div className="grp pickcard">
      {pick.photo ? <img className="avatar big" src={pick.photo} alt="" width={72} height={72} />
        : returning ? <img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={112} height={112} />
        : <span className="avatar big" aria-hidden="true">{pick.initials}</span>}
      <h2 className="pname" ref={head} tabIndex={-1}>{pick.displayName}</h2>
      {phase === 'prompting' ? (
        <>
          <p className="si-hint" role="status">Use your fingerprint or face now.</p>
          {pin
            ? <button className="btn2" autoFocus onClick={() => { ++seq.current; abandonPasskeyWait(); setPhase('pin') }}>Use PIN instead</button>
            : <button className="btn2" autoFocus disabled={busy} onClick={google}>Continue with Google instead</button>}
        </>
      ) : (
        <>
          {fp && <button className="btn" onClick={ask}>Use fingerprint or face</button>}
          {pin ? <PinPad busy={busy} shake={shake} onDone={(p) => run(() => tryPin(pin, p))} />
            : <button className={fp ? 'btn2' : 'btn'} disabled={busy} onClick={google}>Continue with Google</button>}
          {pin && <button className="si-link" onClick={onForgot}>Forgot PIN? Ask an admin</button>}
        </>
      )}
      <button className="btn2" onClick={onBack}>{returning ? 'Not you? Switch person' : 'Back'}</button>
    </div>
  )
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** "PIN locked": the phone counted five misses. The server enforces the real lock; this tells the person when to expect it to end.
 *  The count here is advisory: "An admin unlocked me" and the lock time passing both clear it and show the PIN pad again. */
function Locked({ name, until, onAsk, onBack, onClear }: { name: string; until: number; onAsk: () => void; onBack: () => void; onClear: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClear, Math.max(0, until - Date.now()))
    return () => clearTimeout(t)
  }, [until]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grp pickcard si-lock">
      <span className="avatar big" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <h2 className="pname">PIN locked</h2>
      <p className="si-when">Locked until {hhmm(until)}, or ask an admin.</p>
      <p className="si-hint">Too many wrong tries. This keeps your health records safe.</p>
      <button className="btn" onClick={onAsk}>Ask an admin</button>
      <button className="btn2" onClick={onClear}>An admin unlocked me</button>
      <button className="btn2" onClick={onBack}>Back</button>
    </div>
  )
}

/** Finishing sign-in in the browser (Google, admins only). The error line below comes from urlError / onNativeSignInError. */
function GoogleWait({ onBack, onAgain }: { onBack: () => void; onAgain: () => void }) {
  return (
    <div className="grp pickcard">
      <img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={112} height={112} />
      <h2 className="pname">Finishing sign-in in Chrome…</h2>
      <p className="si-hint" role="status">Pick your Google account there. When Chrome says you are done, come back here. Bantay may open by itself.</p>
      <button className="btn" onClick={onBack}>I'm back</button>
      <button className="btn2" onClick={onAgain}>Try again</button>
    </div>
  )
}

/** Only an admin can add a person or reset a PIN. The request goes to admins; the reply is the same for any handle. */
function AskAdmin({ admins, handle, onBack }: { admins: FamilyMember[]; handle: string; onBack: () => void }) {
  const [h, setH] = useState(handle)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'nosignal'>('idle')
  const first = [...new Set(admins.map((a) => a.displayName.trim().split(/\s+/)[0]).filter(Boolean))]
  const send = async () => {
    setState('sending')
    setState((await requestPinReset(h)) === 'sent' ? 'sent' : 'nosignal')
  }
  return (
    <div className="si-ask">
      <h2 className="pname">Ask an admin</h2>
      <p className="si-hint">Only an admin can add you to the family, or reset a forgotten PIN.</p>
      <p>Ask {first.length ? `${first.join(', ')} or ` : ''}an admin in person or by message. Or send a request:</p>
      {admins.length > 0 && (
        <ul className="grp si-admins" aria-label="Admins">
          {admins.map((a) => <li key={a.personId} className="row"><span className="avatar" aria-hidden="true">{a.initials}</span><span><b>{a.displayName}</b><span className="si-hint"> Admin</span></span></li>)}
        </ul>
      )}
      <div className="grp si-card"><b>Not on the list</b><span className="si-hint">Tell the admin your name. They add you in Admin, then Members, and give you a 6-digit PIN.</span></div>
      <div className="grp si-card">
        <b>Forgot your PIN</b>
        <span className="si-hint">Send a request and the admin resets it. Your records are not touched.</span>
        <label className="si-field">
          <span className="si-l">Your name (handle)</span>
          <input value={h} onChange={(e) => { setH(e.target.value); setState('idle') }} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} />
        </label>
        <button className="btn" disabled={state === 'sending' || h.trim().length < 3} onClick={send}>Send a request</button>
        {state === 'sent' && <p className="si-hint" role="status">Request sent. An admin will see it in Admin.</p>}
        {state === 'nosignal' && <p className="si-hint" role="status">No signal. Try again when you have data.</p>}
      </div>
      <button className="btn2" onClick={onBack}>Back to the list</button>
    </div>
  )
}

/** Shown by AuthGate when nobody is signed in. On success supabase-js fires an auth change and AuthGate takes over.
 *  The family picker comes from the phone's own cache (localStorage). A fresh phone asks the family-names function for first names
 *  (D-41, nothing is cached from it); offline or on an error it falls back to the handle and PIN form.
 *  Wrong PINs are counted here (pinAttempts, kv pin.fail.<handle>): the server answers every failure the same way. */
export default function SignIn() {
  const [family] = useState(loadFamily)
  const [fresh, setFresh] = useState<NamesResult | 'loading'>(family.length ? { kind: 'error' } : 'loading')
  const loadNames = () => { setFresh('loading'); void fetchFamilyNames().then(setFresh) }
  useEffect(() => { if (!family.length) loadNames() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Cached family first; else the names list for a fresh phone (handle is the id: there is no person id before sign-in).
  const roster: FamilyMember[] = family.length ? family
    : fresh !== 'loading' && fresh.kind === 'ok'
      ? fresh.names.map((n) => ({ personId: `name:${n.handle}`, displayName: n.initial ? `${n.first_name} ${n.initial}.` : n.first_name, handle: n.handle, provider: 'pin' as const, initials: (n.first_name.slice(0, 1) + n.initial).toUpperCase() }))
      : []
  // A returning visit shows only the last person (mascot: the app has no profile photo field) and goes straight to PickCard.
  const [pick, setPick] = useState<FamilyMember | null>(() => { const id = getLastPerson(); return family.find((m) => m.personId === id) ?? null })
  const [returning, setReturning] = useState(pick !== null)
  const [other, setOther] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(urlSignInError ?? '')
  const [shake, setShake] = useState(0)
  const [locked, setLocked] = useState<{ handle: string; name: string; until: number } | null>(null)
  const [ask, setAsk] = useState<string | null>(null) // the "Ask an admin" screen, with the handle to prefill
  const [gwait, setGwait] = useState(false)
  useEffect(() => onNativeSignInError((e) => { setGwait(false); setError(e) }), [])

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    setError('')
    const e = await f()
    if (e) setError(e)
    setBusy(false)
  }

  const lockFor = (handle: string, name: string, until: number) => { setError(''); setLocked({ handle, name, until }) }
  // A person already locked from an earlier visit goes straight to the locked screen.
  useEffect(() => {
    const h = pick?.handle
    if (!h) return
    let on = true
    void loadFails(h).then((f) => { const st = pinState(f, Date.now()); if (on && st.kind === 'locked') lockFor(h, pick.displayName, st.until) })
    return () => { on = false }
  }, [pick])
  /** "An admin unlocked me" or the lock time passed: forget the phone-side count and show the PIN pad again. The server still decides. */
  const clearLock = () => {
    if (!locked) return
    void saveFails(locked.handle, undefined)
    setLocked(null)
  }

  /** PIN sign-in with the phone-side count. The reply text is the same whichever handle was typed. */
  const tryPin = async (handle: string, pin: string): Promise<string | null> => {
    const h = handle.trim().toLowerCase()
    const name = pick?.handle === h ? pick.displayName : h
    const before = pinState(await loadFails(h), Date.now())
    if (before.kind === 'locked') { lockFor(h, name, before.until); return null }
    const e = await signInWithPin(h, pin)
    if (e === null) { await saveFails(h, undefined); return null }
    if (e !== SIGN_IN_ERROR) return e // no signal or server trouble: not a wrong PIN, not counted
    const f = afterFailure(await loadFails(h), Date.now())
    await saveFails(h, f)
    const st = pinState(f, Date.now())
    if (st.kind === 'locked') { lockFor(h, name, st.until); return null }
    setShake((n) => n + 1)
    return `That PIN did not work. ${st.left} ${st.left === 1 ? 'try' : 'tries'} left before a 15-minute lock.`
  }

  const google = () => {
    setGwait(true)
    void run(async () => { const e = await signInWithGoogle(); if (e) setGwait(false); return e })
  }
  const picker = roster.length > 0 && !other
  const welcome = picker && !pick && !gwait && ask === null && !locked
  const admins = family.filter((m) => m.provider === 'google')
  const back = () => { setError(''); setPick(null); setReturning(false); setLocked(null); setAsk(null) }

  return (
    <div className="bt">
      <Sky state="clear" />
      <div className="topbar" />
      <main className="scroll">
        {welcome ? (
          <div className="wl-hello">
            <img className="wl-jj" src={MASCOT_SRC} alt={MASCOT_ALT} width={150} height={150} />
            <h1>Hi! I'm Jack Jack.</h1>
            <p>I watch over the family's health and safety. Who are you?</p>
          </div>
        ) : (
          <div className="hdr">
            <h1>Sign in</h1>
            <span>Family Bantay keeps your family’s health private.</span>
          </div>
        )}

        {gwait ? <GoogleWait onBack={() => setGwait(false)} onAgain={google} />
          : ask !== null ? <AskAdmin admins={admins} handle={ask} onBack={() => setAsk(null)} />
          : locked ? <Locked key={locked.until} name={locked.name} until={locked.until} onAsk={() => setAsk(locked.handle)} onBack={back} onClear={clearLock} />
          : (
          <>
            {picker && !pick && (
              <>
                <ul className="grp wl-list" aria-label="Who are you?">
                  {roster.map((m) => (
                    <li key={m.personId}>
                      <button type="button" className="wl-row" onClick={() => { setError(''); setPick(m) }}>
                        {m.photo ? <img className="avatar" src={m.photo} alt="" width={40} height={40} /> : <span className="avatar" aria-hidden="true">{m.initials}</span>}
                        <span className="wl-name"><b>{m.displayName}</b>{m.provider === 'google' && <span className="si-hint">Admin</span>}</span>
                        <span className="wl-chev"><Icon name="chev" size={20} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="si-link" onClick={() => setAsk('')}>Not on the list? Ask an admin to add you</button>
                <button className="btn2" onClick={() => { setError(''); setOther(true) }}>Sign in with a handle and PIN</button>
                <button className="btn2" disabled={busy} onClick={google}>Admin? Continue with Google</button>
              </>
            )}

            {picker && pick && (
              <PickCard key={pick.personId} returning={returning} pick={pick} busy={busy} run={run} setError={setError} onBack={back}
                tryPin={tryPin} google={google} shake={shake} onForgot={() => setAsk(pick.handle ?? '')} />
            )}

            {!picker && (
              <>
                <OtherWays run={run} busy={busy} tryPin={tryPin} google={google} onForgot={(h) => setAsk(h)} />
                {roster.length > 0
                  ? <button className="btn2" onClick={() => setOther(false)}>Back to the family</button>
                  : fresh === 'loading' ? <p className="si-hint" role="status">Looking for your family</p>
                  : fresh.kind === 'offline' ? (
                    <>
                      <p className="si-hint" role="status">{NO_SIGNAL}</p>
                      <button className="btn2" onClick={loadNames}>Try again</button>
                    </>
                  )
                  : <p className="si-hint">First time on this phone? Sign in once and it will remember your family.</p>}
                {roster.length === 0 && <button className="si-link" onClick={() => setAsk('')}>Not on the list? Ask an admin to add you</button>}
              </>
            )}
          </>
        )}

        {error && <p className="grp si-err" role="alert">{error}</p>}
        <a className="si-link si-911" href="tel:911">Emergency call 911</a>
      </main>
    </div>
  )
}
