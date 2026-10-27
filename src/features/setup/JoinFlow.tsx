import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { MASCOT_ALT, MASCOT_SRC } from '../../assets/mascot'
import { NO_SIGNAL, fetchFamilyNames, signInWithPin, type NameEntry, type NamesResult } from '../auth/pinLogin'
import { enablePasskey, passkeySupported, setPasskeyFlag } from '../auth/family'
import { promptFingerprint, unlockMode } from '../auth/biometric'
import { getMember } from '../auth/session'
import { Icon } from '../shell/Icon'
import SetPin from './SetPin'

/** Claiming a name from an invite link and setting the first PIN needs a server action the contract does not define yet (reported in the S6a lane `needs`).
 *  Until pin-login offers it there is NO live port: SignIn ignores a #join link and shows the ordinary sign-in, so joining works as before S6a
 *  (an admin or the invite sets the PIN, the person signs in with it). The e2e build (VITE_JOIN_STUB=1, test builds only) uses a stub that always accepts. */
export type JoinResult = { ok: true } | { ok: false; why: 'no_signal' | 'bad_invite' | 'taken' }
export type JoinPort = (o: { invite: string; handle: string; pin: string }) => Promise<JoinResult>
export const defaultJoinPort: JoinPort | null = import.meta.env.VITE_JOIN_STUB === '1' ? async () => ({ ok: true }) : null

const JOIN_COPY = {
  no_signal: NO_SIGNAL,
  bad_invite: 'This invite link is not working. Ask for a new one.',
  taken: 'That name already has a PIN. Go back and use Forgot PIN, or pick another name.'
} as const

/** After the PIN is set and the session exists: the fingerprint choice, once. Off = the "use fingerprint next time?" offer never shows for this person. */
export async function applyFingerChoice(want: boolean): Promise<void> {
  try {
    const pid = (await getMember().catch(() => null))?.personId
    if (!pid) return
    if (!want) { try { localStorage.setItem(`bantay.fp.asked.${pid}`, '1') } catch { /* private mode */ } return }
    if (Capacitor.isNativePlatform()) { if ((await promptFingerprint('Turn on fingerprint for Bantay')) === true) setPasskeyFlag(pid) }
    else await enablePasskey(pid)
  } catch { /* the PIN works either way */ }
}

/** Can this phone open Bantay with a fingerprint? (APK: the phone's sensor. Web: passkeys.) */
export async function fingerCapable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return passkeySupported()
  const m = await unlockMode({ passkeyFlag: false })
  return m === 'fingerprint' || m === 'enrol-first'
}

/** `start-who` (1 of 3) then `start-pin` (2 of 3). The third step is `start-done`, which Onboarding shows once the person is signed in. */
export default function JoinFlow({ invite, port, signIn = signInWithPin, onBack }: {
  invite: string; port: JoinPort; signIn?: (handle: string, pin: string) => Promise<string | null>; onBack: () => void
}) {
  const [names, setNames] = useState<NamesResult | 'loading'>('loading')
  const [who, setWho] = useState<NameEntry | null>(null)
  const [canFinger, setCanFinger] = useState(false)
  const load = () => { setNames('loading'); void fetchFamilyNames(invite).then(setNames) }
  useEffect(() => { load(); void fingerCapable().then(setCanFinger) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (pin: string, finger: boolean): Promise<string | null> => {
    if (!who) return JOIN_COPY.bad_invite
    const r = await port({ invite, handle: who.handle, pin })
    if (!r.ok) return JOIN_COPY[r.why]
    // The invite hash must be gone before the session exists: OnboardingGate skips start-done on any deep link.
    try { history.replaceState(null, '', location.pathname + location.search) } catch { /* no history */ }
    const e = await signIn(who.handle, pin)
    if (e) return e
    void applyFingerChoice(finger)
    return null // the auth change takes AuthGate to Onboarding (start-done)
  }

  if (who) return <SetPin name={who.first_name} step={{ n: 2, of: 3 }} canFinger={canFinger} onSubmit={submit} onBack={() => setWho(null)} />
  return (
    <div className="si-set">
      <span className="si-eyebrow">Step 1 of 3 · then Today</span>
      <div className="si-steps" aria-hidden="true"><i className="on" /><i /><i /></div>
      <div className="si-c">
        <img className="avatar mascot" src={MASCOT_SRC} alt={MASCOT_ALT} width={96} height={96} />
        <h1 className="pname">Is this you?</h1>
        <p className="si-hint">I am Jack Jack. You are invited to Family Bantay. Tap your name.</p>
      </div>
      {names === 'loading' ? <p className="si-hint" role="status">Looking for your family</p>
        : names.kind === 'ok' && names.names.length > 0 ? (
          <ul className="grp wl-list" aria-label="Who are you?">
            {names.names.map((n) => (
              <li key={n.handle}>
                <button type="button" className="wl-row" onClick={() => setWho(n)}>
                  <span className="avatar" aria-hidden="true">{(n.first_name.slice(0, 1) + n.initial).toUpperCase()}</span>
                  <span className="wl-name"><b>{n.initial ? `${n.first_name} ${n.initial}.` : n.first_name}</b></span>
                  <span className="wl-chev"><Icon name="chev" size={20} /></span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="si-hint" role="status">{names.kind === 'offline' ? NO_SIGNAL : 'This invite link is not working. Ask whoever sent it for a new one.'}</p>
            <button type="button" className="btn2" onClick={load}>Try again</button>
          </>
        )}
      <p className="si-hint si-c">Not on the list? Tell whoever sent you the link.</p>
      <button type="button" className="btn2" onClick={onBack}>Back to sign in</button>
    </div>
  )
}
