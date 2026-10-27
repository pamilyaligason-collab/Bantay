import { useCallback, useEffect, useState } from 'react'
import { initialsOf } from '../auth/family'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useSelfPersonId } from '../setup/useProfile'
import { myViewers, setShare, shareCopy, type Viewer } from './api'
import { ShareSheet } from './ShareSheet'
import '../shell/shell.css'
import './sharing.css'

export const SHARING_INTRO = 'Only you, the family admins, and the people you share with can see your records.'

export const ADMIN_NOTE = 'The family admins can set who sees your records. You will be told, and you can stop it here.'

/** Me > Privacy > "Who can see my records" (#sharing, canvas boards 1b and 1c). The list lives on the server, so it is the same on every phone. */
export function SharingScreen() {
  const personId = useSelfPersonId()
  const [viewers, setViewers] = useState<Viewer[] | null | undefined>(undefined) // undefined = loading, null = could not load
  const [sheet, setSheet] = useState(false)
  const [asking, setAsking] = useState<string | null>(null) // carerUserId waiting for "Stop sharing?" to be confirmed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(() => { void myViewers().then(setViewers) }, [])
  useEffect(load, [load])

  const stop = async (v: Viewer) => {
    if (!personId) return
    setBusy(true); setErr('')
    const r = await setShare(personId, v.carerUserId, false)
    setBusy(false); setAsking(null)
    if (r === 'offline' || r === 'refused' || r === 'limit') setErr(shareCopy(r))
    load()
  }

  return (
    <div className="sh sh-me">
      <SubHeader title="Who can see my records" backHref="#privacy" backLabel="Back to Privacy" />
      <div className="sh-card sh-row sg-intro">
        <Icon name="lock" size={22} />
        <span className="sh-grow">{SHARING_INTRO}</span>
      </div>

      <div className="sh-sech"><b>Shared with</b></div>
      <div className="sh-card sh-list">
        {viewers === undefined ? <div><span className="sh-sub" role="status">Loading.</span></div>
          : viewers === null ? <div><span className="sh-grow sh-sub" role="alert">{shareCopy('offline')}</span><button type="button" className="sh-pill sh-ghost sh-small" onClick={() => { setViewers(undefined); load() }}>Try again</button></div>
          : viewers.length === 0 ? <div><span className="sh-sub">You have not shared with anyone yet.</span></div>
          : viewers.map((v) => (
            <div key={v.carerUserId}>
              <span className="sh-av">{initialsOf(v.displayName)}</span>
              <span className="sh-grow">
                <b>{v.displayName}</b>
                <span className={`sh-sub sh-blk${v.pending ? ' sg-wait' : ''}`}>
                  {v.pending ? `${v.addedByAdmin ? 'An admin offered this. ' : ''}Waiting for ${v.displayName} to accept` : v.canWrite ? 'Carer · gets missed-dose alerts' : 'Can see your records'}{v.addedByAdmin && !v.pending ? ' · added by an admin' : ''}
                </span>
              </span>
              {asking === v.carerUserId ? (
                <span className="sg-btns">
                  <button type="button" className="sh-pill sg-danger sh-small" disabled={busy} onClick={() => void stop(v)}>Stop sharing</button>
                  <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => setAsking(null)}>Keep</button>
                </span>
              ) : v.pending ? (
                <button type="button" className="sh-pill sh-ghost sh-small" disabled={busy} aria-label={`Cancel the offer to ${v.displayName}`} onClick={() => void stop(v)}>Cancel</button>
              ) : (
                <button type="button" className="sh-pill sh-ghost sh-small" aria-label={`Stop sharing with ${v.displayName}`} onClick={() => setAsking(v.carerUserId)}>Stop</button>
              )}
            </div>
          ))}
      </div>
      {err && <p className="sh-sub sh-note" role="alert">{err}</p>}

      <button type="button" className="sh-pill sh-primary sh-block" disabled={!personId} onClick={() => setSheet(true)} aria-haspopup="dialog"><Icon name="plus" size={20} />Share with someone</button>
      {personId === null && <p className="sh-sub sh-note">Sharing is for people with their own page in Bantay.</p>}

      <p className="sh-sub sh-note">{ADMIN_NOTE}</p>
      <p className="sh-sub sh-note">Saved on the server, so it is the same on every phone.</p>

      {sheet && personId && <ShareSheet personId={personId} onClose={() => setSheet(false)} onSent={() => { setSheet(false); load() }} />}
    </div>
  )
}

export default SharingScreen
