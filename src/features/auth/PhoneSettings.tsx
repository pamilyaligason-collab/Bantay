import { useEffect, useState } from 'react'
import { supabase } from './client'
import { enablePasskey, forgetPhone, hasPasskeyFlag, loadFamily, passkeySupported } from './family'
import { getMember, signOut } from './session'

/** Family > This phone: fingerprint or face sign-in, switch person, forget this phone. Renders nothing when auth is not configured. */
export function PhoneSettings() {
  const [on, setOn] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [who, setWho] = useState('')
  useEffect(() => {
    void getMember().then(async (m) => {
      if (!m?.personId) return
      if (hasPasskeyFlag(m.personId)) setOn(true)
      const row = await supabase?.from('people').select('display_name').eq('id', m.personId).maybeSingle()
      setWho(row?.data?.display_name ?? loadFamily().find((f) => f.personId === m.personId)?.displayName ?? '')
    })
  }, [])
  if (!supabase) return null

  const ready = passkeySupported()
  const turnOn = async () => {
    setBusy(true)
    const m = await getMember()
    const e = m?.personId ? await enablePasskey(m.personId) : 'Not available on this phone yet'
    setNote(e ?? 'Fingerprint or face sign-in is on for this phone.')
    if (!e) setOn(true)
    setBusy(false)
  }
  const forget = async () => { forgetPhone(); await signOut() }

  return (
    <section aria-labelledby="ph-h">
      <h2 id="ph-h" className="hd">This phone</h2>
      {who && <p className="sec">Signed in as {who}</p>}
      <div className="grp">
        <button className="row" disabled={busy || on || !ready} onClick={turnOn}>
          {on ? 'Fingerprint or face sign-in is on' : 'Turn on fingerprint or face sign-in'}
        </button>
        <button className="row" onClick={() => signOut()}>Not you? Switch person</button>
        <button className="row" onClick={forget}>Forget this phone</button>
      </div>
      {!ready && <p className="sec">Not available on this phone yet.</p>}
      {note && <p className="sec" role="status">{note}</p>}
    </section>
  )
}
