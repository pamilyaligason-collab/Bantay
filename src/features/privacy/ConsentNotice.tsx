import { useEffect, useState } from 'react'
import { useSelfPersonId } from '../setup/useProfile'
import { ensureConsent } from './consent'
import './privacy.css'

/** Q37: the one-line notice shown right after an existing member's consent was recorded on first open. Renders nothing otherwise.
 *  Mounted in Me; the backfill itself runs here, so it happens the first time any screen with this notice opens. */
export function ConsentNotice() {
  const personId = useSelfPersonId()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!personId) return
    let live = true
    void ensureConsent(personId).then((c) => { if (live && c.backfilled) setShown(true) })
    return () => { live = false }
  }, [personId])
  if (!shown) return null
  return (
    <p className="pv-notice" role="status">
      Bantay now keeps a note of when you agreed to share your health records with your family. <a href="#privacy">See Privacy</a>
    </p>
  )
}
