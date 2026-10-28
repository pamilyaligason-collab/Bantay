import { useEffect, useRef, useState } from 'react'
import { Sky } from '../features/look'
import { NO_SIGNAL, SIGN_IN_ERROR, fetchFamilyNames, inviteFromHash, signInWithGoogle, signInWithPin, wrongState, type NamesResult } from '../features/auth/pinLogin'
import { afterFailure, loadFails, saveFails } from '../features/auth/pinAttempts'
import '../features/auth/signin.css'
import { MASCOT_ALT, MASCOT_SRC } from '../assets/mascot'
import { JackArt } from '../features/look/JackArt'
import { getLastPerson, hasPasskeyFlag, loadFamily, passkeySupported, signInWithPasskey, abandonPasskeyWait, type FamilyMember } from '../features/auth/family'
import { urlSignInError } from '../features/auth/urlError'
import { onNativeSignInError } from '../features/auth/nativeOAuth'
import { Icon } from '../features/shell/Icon'
import ForgotFlow from '../features/setup/ForgotFlow'
import JoinFlow, { defaultJoinPort, type JoinPort } from '../features/setup/JoinFlow'
import PinPad from '../features/setup/PinPad'

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
      <button className="btn" disabled={busy} onClick={google}>Continue with Google</button>
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
      {showPin && <p className="si-hint">Five wrong tries in a row make you wait one minute.</p>}
      {showPin && <button className="si-link" disabled={handle.trim().length < 3} onClick={() => onForgot(handle)}>Forgot PIN?</button>}
    </>
  )
}

/** The tapped person (`start-pinpad`). Fingerprint first when it is on for this phone; the PIN pad shows on cancel, error, mismatch, or
 *  "Use PIN instead". Fingerprint and Forgot PIN? are real buttons under the pad. The prompt starts once per mount (the card is keyed by person), so a miss never loops. */
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
      <h2 className="pname" ref={head} tabIndex={-1}>{phase === 'pin' && pin ? `Hi ${pick.displayName.split(' ')[0]}` : pick.displayName}</h2>
      {phase === 'prompting' ? (
        <>
          <p className="si-hint" role="status">Use your fingerprint or face now.</p>
          {pin
            ? <button className="btn2" autoFocus onClick={() => { ++seq.current; abandonPasskeyWait(); setPhase('pin') }}>Use PIN instead</button>
            : <button className="btn2" autoFocus disabled={busy} onClick={google}>Continue with Google instead</button>}
        </>
      ) : (
        <>
          {pin && <p className="si-hint">Enter your 6-digit PIN.</p>}
          {pin ? <PinPad busy={busy} shake={shake} onDone={(p) => run(() => tryPin(pin, p))} />
            : <button className={fp ? 'btn2' : 'btn'} disabled={busy} onClick={google}>Continue with Google</button>}
          {(fp || pin) && (
            <div className="si-two">
              {fp && <button type="button" className="btn2" onClick={ask}><Icon name="fp" size={20} /> Fingerprint</button>}
              {pin && <button type="button" className="btn2" onClick={onForgot}>Forgot PIN?</button>}
            </div>
          )}
        </>
      )}
      <button className="btn2" onClick={onBack}>{returning ? 'Not you? Switch person' : 'Back'}</button>
    </div>
  )
}

const mmss = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

/** `start-wrong`: the phone counted five misses in a row, so it waits one minute and then unlocks by itself. The server still enforces its own limit;
 *  this tells the person when to try again. The fingerprint stays available during the wait, and Forgot PIN? is one tap away. */
function WrongWait({ name, until, finger, onFinger, onForgot, onBack, onClear }: {
  name: string; until: number; finger: boolean; onFinger: () => void; onForgot: () => void; onBack: () => void; onClear: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { if (now >= until) onClear() }, [now, until]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grp pickcard si-lock">
      <span className="avatar big" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <h2 className="pname">Take a short break</h2>
      <p className="si-when">Try your PIN again in {mmss(until - now)}</p>
      <p className="si-hint">Five wrong tries in a row. This keeps your health records safe. It only lasts a minute.</p>
      {finger && <button type="button" className="btn" onClick={onFinger}><Icon name="fp" size={20} /> Use my fingerprint</button>}
      {finger && <b>Your fingerprint still works</b>}
      <button type="button" className="btn2" onClick={onForgot}>Forgot PIN?</button>
      <button type="button" className="btn2" onClick={onBack}>Back</button>
    </div>
  )
}

/** Finishing sign-in in the browser (Google). The error line below comes from urlError / onNativeSignInError. */
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

/** Shown by AuthGate when nobody is signed in. On success supabase-js fires an auth change and AuthGate takes over.
 *  The family picker comes from the phone's own cache (localStorage). A fresh phone asks the family-names function for first names
 *  (D-41, nothing is cached from it); offline or on an error it falls back to the handle and PIN form.
 *  A family invite link (#join/<token>) opens the join screens instead (start-who, start-pin) once the server has a join action (joinPort); until then it is ignored.
 *  Wrong PINs are counted here (pinAttempts, kv pin.fail.<handle>): the server answers every failure the same way. */
export default function SignIn({ joinPort = defaultJoinPort }: { joinPort?: JoinPort | null } = {}) {
  const [family] = useState(loadFamily)
  const [invite, setInvite] = useState(() => (joinPort ? inviteFromHash(location.hash) : null)) // no live join action yet: a #join link opens the ordinary sign-in
  const [fresh, setFresh] = useState<NamesResult | 'loading'>(family.length ? { kind: 'error' } : 'loading')
  const loadNames = () => { setFresh('loading'); void fetchFamilyNames().then(setFresh) }
  useEffect(() => { if (!family.length && !invite) loadNames() }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
  const [forgot, setForgot] = useState<FamilyMember | null>(null) // the Forgot PIN? screens
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
  // A person already waiting from an earlier visit goes straight to the wait screen.
  useEffect(() => {
    const h = pick?.handle
    if (!h) return
    let on = true
    void loadFails(h).then((f) => { const st = wrongState(f, Date.now()); if (on && st.kind === 'wait') lockFor(h, pick.displayName, st.until) })
    return () => { on = false }
  }, [pick])
  /** The minute passed: show the PIN pad again. The count is kept, so one more miss waits again; the server still decides. */
  const clearLock = () => setLocked(null)

  /** PIN sign-in with the phone-side count. The reply text is the same whichever handle was typed. */
  const tryPin = async (handle: string, pin: string): Promise<string | null> => {
    const h = handle.trim().toLowerCase()
    const name = pick?.handle === h ? pick.displayName : h
    const before = wrongState(await loadFails(h), Date.now())
    if (before.kind === 'wait') { lockFor(h, name, before.until); return null }
    const e = await signInWithPin(h, pin)
    if (e === null) { await saveFails(h, undefined); return null }
    if (e !== SIGN_IN_ERROR) return e // no signal or server trouble: not a wrong PIN, not counted
    const f = afterFailure(await loadFails(h), Date.now())
    await saveFails(h, f)
    const st = wrongState(f, Date.now())
    if (st.kind === 'wait') { lockFor(h, name, st.until); return null }
    setShake((n) => n + 1)
    return `That PIN did not work. ${st.left} ${st.left === 1 ? 'try' : 'tries'} left.`
  }

  const google = () => {
    setGwait(true)
    void run(async () => { const e = await signInWithGoogle(); if (e) setGwait(false); return e })
  }
  const picker = roster.length > 0 && !other
  const welcome = picker && !pick && !gwait && !forgot && !locked && !invite
  const back = () => { setError(''); setPick(null); setReturning(false); setLocked(null); setForgot(null) }
  const forgotFor = (m: FamilyMember) => { setError(''); setLocked(null); setForgot(m) }
  // Fingerprint during the wait (web passkey): the same call the PIN card uses.
  const finger = !!pick && passkeySupported() && hasPasskeyFlag(pick.personId)
  const leaveInvite = () => { try { history.replaceState(null, '', location.pathname + location.search) } catch { /* no history */ } setInvite(null) }

  return (
    <div className="bt">
      <Sky state="clear" />
      <div className="topbar" />
      <main className="scroll">
        {invite && joinPort ? (
          <JoinFlow invite={invite} port={joinPort} onBack={leaveInvite} />
        ) : (
          <>
            {welcome ? (
              <div className="wl-hello">
                <JackArt name="hello" size={150} className="wl-jj" />
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
              : forgot ? <ForgotFlow member={forgot} onBack={() => setForgot(null)} google={google} />
              : locked ? <WrongWait key={locked.until} name={locked.name} until={locked.until} finger={finger}
                  onFinger={() => { if (pick) void run(() => signInWithPasskey(pick.personId)) }}
                  onForgot={() => forgotFor(pick ?? asMember(locked.handle, locked.name))} onBack={back} onClear={clearLock} />
              : (
              <>
                {picker && !pick && (
                  <>
                    <ul className="grp wl-list" aria-label="Who are you?">
                      {roster.map((m) => (
                        <li key={m.personId}>
                          <button type="button" className="wl-row" onClick={() => { setError(''); setPick(m) }}>
                            {m.photo ? <img className="avatar" src={m.photo} alt="" width={40} height={40} /> : <span className="avatar" aria-hidden="true">{m.initials}</span>}
                            <span className="wl-name"><b>{m.displayName}</b></span>
                            <span className="wl-chev"><Icon name="chev" size={20} /></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="si-hint si-c">Not on the list? Tell whoever sent you the invite link.</p>
                    <button className="btn2" onClick={() => { setError(''); setOther(true) }}>Sign in with a handle and PIN</button>
                    <button className="btn2" disabled={busy} onClick={google}>Continue with Google</button>
                  </>
                )}

                {picker && pick && (
                  <PickCard key={pick.personId} returning={returning} pick={pick} busy={busy} run={run} setError={setError} onBack={back}
                    tryPin={tryPin} google={google} shake={shake} onForgot={() => forgotFor(pick)} />
                )}

                {!picker && (
                  <>
                    <OtherWays run={run} busy={busy} tryPin={tryPin} google={google} onForgot={(h) => forgotFor(asMember(h.trim().toLowerCase(), h.trim()))} />
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
                    {roster.length === 0 && <p className="si-hint si-c">Not on the list? Tell whoever sent you the invite link.</p>}
                  </>
                )}
              </>
            )}
          </>
        )}

        {error && <p className="grp si-err" role="alert">{error}</p>}
        <div className="si-emg">
          <a className="btn si-911red" href="tel:911"><Icon name="phone" size={20} /> Call 911</a>
        </div>
      </main>
    </div>
  )
}

/** A person known only by the handle they typed (no cached family entry). */
function asMember(handle: string, name: string): FamilyMember {
  return { personId: `name:${handle}`, displayName: name, handle, provider: 'pin', initials: (name.slice(0, 1) || '?').toUpperCase() }
}
