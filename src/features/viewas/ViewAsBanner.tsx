import { liveQuery } from 'dexie'
import { useEffect, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { getAccessToken, onAuthChange } from '../auth/session'
import { hdb } from '../records/store'
import { exitActing, useActing, useActingCan, useActorName } from './viewAs'
import './viewas.css'

/** true while the SOS screen (a portal on document.body, sos/SosScreen.tsx) covers the page. */
function useSosScreenUp(): boolean {
  const [up, setUp] = useState(false)
  useEffect(() => {
    const look = () => setUp(!!document.querySelector('.sos-bare'))
    look()
    const mo = new MutationObserver(look)
    mo.observe(document.body, { childList: true })
    return () => mo.disconnect()
  }, [])
  return up
}

/** "Viewing as Mama · Back to me" bar under the offline bar (C-9, D-99): amber, on every screen, with the one reason line when a control is locked.
 *  On the SOS screen a copy is drawn above it saying the SOS is the admin's own (W-47); SOS itself always acts as the signed-in person. */
export default function ViewAsBanner(): ReactElement | null {
  const { acting, personId, name } = useActing()
  const can = useActingCan()
  const actor = useActorName()
  const sos = useSosScreenUp()

  // Sign-out clears it (S16 hook line). onAuthChange also fires on token refresh, so only a missing session exits.
  useEffect(() => onAuthChange(() => { void getAccessToken().then((t) => { if (!t) { exitActing(); void import('../today/actions').then((a) => a.clearUnsentMood()).catch(() => undefined) } }, () => undefined) }), [])
  // The viewed person leaving this phone's people (archived, removed, erased) exits automatically (r-2).
  useEffect(() => {
    if (!personId) return
    const sub = liveQuery(() => hdb.people.get(personId)).subscribe({ next: (p) => { if (!p) exitActing() }, error: () => undefined })
    return () => sub.unsubscribe()
  }, [personId])

  if (!acting) return null
  const back = () => { exitActing(); const h = location.hash.split('?')[0]!; if (h.endsWith(`/member/${personId}`) || h === `#sharing/${personId}`) location.hash = '#today' } // a page of that person (member page, their sharing list) has nothing to show without them
  const line = can?.log ? `You can log for ${name}. Entries show you logged them.` : `Look only. ${can?.reason ?? ''}`.trim()
  const bar = (cls: string, note: string | null) => (
    <div className={cls} role="status" data-testid="viewas-bar">
      <div className="va-row"><b>Viewing as {name}</b><button type="button" className="va-exit" onClick={back}>Back to me</button></div>
      {note && <p className="va-note">{note}</p>}
    </div>
  )
  return (
    <>
      {bar('va-bar', line)}
      {sos && createPortal(bar('va-bar va-sos', `This SOS is from ${actor}, not ${name}.`), document.body)}
    </>
  )
}
