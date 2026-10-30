import { useState } from 'react'
import { supabase } from '../auth/client'
import { clearLastPerson, enablePasskey, forgetPhone, passkeySupported } from '../auth/family'
import { signOut } from '../auth/session'
import { useActing } from '../viewas/viewAs'
import Group, { NavRow } from './Group'
import { useAccount } from './useAccount'

/** Settings > Sign-in (#me/signin): fingerprint or face, Switch person, Forget this phone. Off with "View only" while acting. */
export default function SigninGroup() {
  const { acting } = useActing()
  const { member, passkey, setPasskey } = useAccount()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const turnOn = async () => {
    setBusy(true)
    const e = member?.personId ? await enablePasskey(member.personId) : 'Not available on this phone yet'
    setNote(e ?? 'Fingerprint or face sign-in is on for this phone.')
    if (!e) setPasskey(true)
    setBusy(false)
  }
  return (
    <Group title="Sign-in" testId="settings-signin">
      <div className="sh-card sh-list st-list">
        {supabase ? (
          <>
            {passkeySupported() && !passkey && <NavRow icon="fp" title="Turn on fingerprint or face sign-in" onClick={() => { if (!busy) void turnOn() }} locked={acting} />}
            {passkey && <div className="st-row"><span className="sh-grow"><b>Fingerprint or face sign-in is on</b></span></div>}
            <NavRow icon="users" title="Not you? Switch person" onClick={() => { clearLastPerson(); void signOut() }} locked={acting} />
            <NavRow icon="shield" title="Forget this phone" onClick={() => { forgetPhone(); void signOut() }} locked={acting} />
          </>
        ) : <div className="st-row"><span className="sh-grow"><b>Sign-in is not set up on this copy of the app</b></span></div>}
      </div>
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}
    </Group>
  )
}
