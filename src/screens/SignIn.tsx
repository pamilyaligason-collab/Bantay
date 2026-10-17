import { useState } from 'react'
import { signInWithGoogle, signInWithPin } from '../features/auth/pinLogin'

/** Shown by AuthGate when nobody is signed in. On success supabase-js fires an auth change and AuthGate takes over. */
export default function SignIn() {
  const [showPin, setShowPin] = useState(false)
  const [handle, setHandle] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    setError('')
    const e = await f()
    if (e) { setError(e); setPin('') }
    setBusy(false)
  }

  return (
    <div className="bt">
      <div className="topbar" />
      <main className="scroll">
        <div className="hdr">
          <h1>Sign in</h1>
          <span>Family Bantay keeps your family’s health private.</span>
        </div>

        <button className="btn" disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button>

        {!showPin ? (
          <button className="btn2" onClick={() => setShowPin(true)}>Sign in with your name and PIN</button>
        ) : (
          <form
            className="grp signin"
            onSubmit={(e) => { e.preventDefault(); if (handle && pin.length === 6) run(() => signInWithPin(handle, pin)) }}
          >
            <label className="row" htmlFor="si-handle">
              <span className="si-l">Name</span>
              <input
                id="si-handle" name="bantay-handle" type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} enterKeyHint="next"
                placeholder="your handle" autoFocus
              />
            </label>
            <label className="row" htmlFor="si-pin">
              <span className="si-l">PIN</span>
              <input
                id="si-pin" name="bantay-pin" type="password" inputMode="numeric" pattern="[0-9]*" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="off" maxLength={6} enterKeyHint="go" placeholder="6 digits"
              />
            </label>
            <div className="row">
              <button className="btn" type="submit" disabled={busy || !handle || pin.length !== 6}>Sign in</button>
            </div>
          </form>
        )}

        {error && <p className="grp si-err" role="alert">{error}</p>}
        {showPin && <p className="si-hint">Five wrong tries lock sign-in for 15 minutes. Ask your family admin to reset your PIN.</p>}
      </main>
    </div>
  )
}
