import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { initialsOf } from '../auth/family'
import { useCarerIds } from '../family/CarerCards'
import { getMember } from '../auth/session'
import { shortName } from '../inbox/build'
import { usePeople } from '../records/useRecordsServer'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useSelfPerson } from '../setup/useProfile'
import { NOT_OWNER, personViewers, setShare, shareCopy, type Viewer } from './api'
import OwnerList from './OwnerList'
import { ShareSheet } from './ShareSheet'
import '../shell/shell.css'
import './sharing.css'

export const SHARING_INTRO = 'Only you, the family owner, and the people you or the family owner share with can see your records.'
export const OWNER_LINE = "The family owner can see everyone's records."

export const NO_PAGE = 'Sharing is for people with their own page in Bantay.'

/** Me > Privacy > "Who can see my records" (#sharing, board D109Mine), and the same list for another person (#sharing/<personId>, board D109Person; the family owner, or a writer carer of that person).
 *  The list lives on the server, so it is the same on every phone. Links apply at once: there is no accept step. */
export function SharingScreen({ person }: { person?: string | null }) {
  const { id: selfId, ready } = useSelfPerson()
  const people = usePeople()
  const carerIds = useCarerIds()
  const target = person || selfId
  const mine = !person || person === selfId
  const [owner, setOwner] = useState<boolean | null>(null) // null = not asked yet
  useEffect(() => {
    if (mine) return
    let live = true
    void getMember().catch(() => null).then((m) => { if (live) setOwner(m?.isOwner === true) }) // any error reads as not the owner (fails closed)
    return () => { live = false }
  }, [mine])
  const allowed = mine || owner === true || (!!person && carerIds.includes(person)) // the server is the real check: a refusal shows the refused copy
  const name = shortName(people.find((p) => p.id === target)?.name) ?? 'this person'
  const [viewers, setViewers] = useState<Viewer[] | null | 'refused' | undefined>(undefined) // undefined = loading, null = could not load, 'refused' = the server said no
  const [sheet, setSheet] = useState(false)
  const [asking, setAsking] = useState<string | null>(null) // carerUserId waiting for "Stop sharing?" to be confirmed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(() => { if (target && allowed) void personViewers(target).then(setViewers) }, [target, allowed])
  useEffect(load, [load])

  const stop = async (v: Viewer) => {
    if (!target) return
    setBusy(true); setErr('')
    const r = await setShare(target, v.carerUserId, false)
    setBusy(false); setAsking(null)
    if (r === 'offline' || r === 'refused' || r === 'limit') setErr(shareCopy(r))
    load()
  }

  const head = mine
    ? <SubHeader title="Who can see my records" backHref="#privacy" backLabel="Back to Privacy" />
    : <SubHeader title={`Who can see ${name}'s records`} backHref={owner === true ? '#sharing/all' : '#family'} backLabel={owner === true ? 'Back to Who sees whom' : 'Back to Family'} />
  if (mine && !target) { // signed in with no person row: nothing to list, and not "loading" once the lookup is done
    return (
      <div className="sh sh-me">
        {head}
        <p className="sh-sub sh-note" role={ready ? undefined : 'status'}>{ready ? NO_PAGE : 'Loading.'}</p>
      </div>
    )
  }
  if (!allowed) {
    const asking = owner === null
    return (
      <div className="sh sh-me">
        {head}
        <p className="sh-sub sh-note" role={asking ? 'status' : 'alert'}>{asking ? 'Loading.' : NOT_OWNER}</p>
      </div>
    )
  }
  return (
    <div className="sh sh-me">
      {head}
      {mine && (
        <div className="sh-card sh-row sg-intro">
          <Icon name="lock" size={22} />
          <span className="sh-grow">{SHARING_INTRO}<span className="sh-sub sh-blk">{OWNER_LINE}</span></span>
        </div>
      )}

      <div className="sh-sech"><b>{mine ? 'Shared with' : 'Can see'}</b></div>
      <div className="sh-card sh-list">
        {viewers === undefined ? <div><span className="sh-sub" role="status">Loading.</span></div>
          : viewers === 'refused' ? <div><span className="sh-grow sh-sub" role="alert">{shareCopy('refused')}</span></div>
          : viewers === null ? <div><span className="sh-grow sh-sub" role="alert">{shareCopy('offline')}</span><button type="button" className="sh-pill sh-ghost sh-small" onClick={() => { setViewers(undefined); load() }}>Try again</button></div>
          : viewers.length === 0 ? <div><span className="sh-sub">{mine ? 'You have not shared with anyone yet.' : 'Nobody else can see these records.'}</span></div>
          : viewers.map((v) => (
            <div key={v.carerUserId}>
              <span className="sh-av">{initialsOf(v.displayName)}</span>
              <span className="sh-grow">
                <b>{v.displayName}</b>
                <span className="sh-sub sh-blk">
                  {v.canWrite ? 'Carer · gets missed-dose alerts' : mine ? 'Can see your records' : 'Can see the records'}{mine && v.addedByAdmin ? ' · added by the family owner' : ''}
                </span>
              </span>
              {asking === v.carerUserId ? (
                <span className="sg-btns">
                  <button type="button" className="sh-pill sg-danger sh-small" disabled={busy} onClick={() => void stop(v)}>Stop sharing</button>
                  <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => setAsking(null)}>Keep</button>
                </span>
              ) : !mine && v.canWrite ? null : ( // a carer is changed on the web admin page, not here
                <button type="button" className="sh-pill sh-ghost sh-small" aria-label={`Stop sharing with ${v.displayName}`} onClick={() => setAsking(v.carerUserId)}>Stop</button>
              )}
            </div>
          ))}
      </div>
      {err && <p className="sh-sub sh-note" role="alert">{err}</p>}

      {viewers !== 'refused' && <button type="button" className="sh-pill sh-primary sh-block" onClick={() => setSheet(true)} aria-haspopup="dialog"><Icon name="plus" size={20} />{mine ? 'Share with someone' : 'Allow someone'}</button>}

      {mine ? (
        <p className="sh-sub sh-note">Sharing works at once, with no accept step. You can stop it any time. The family owner can add it back, and you are told again.</p>
      ) : (
        <>
          <p className="sh-sub sh-note">Allowing works at once: medicines, doses, readings, papers, check-ins, food and phone health. Never ID cards. Their phone updates the next time it syncs.</p>
          <p className="sh-sub sh-note">If {name} has no login, {name}'s carers are told instead. A carer who keeps the records cannot be removed here.</p>
        </>
      )}
      <p className="sh-sub sh-note">Saved on the server, so it is the same on every phone.</p>

      {sheet && target && <ShareSheet personId={target} own={mine} name={name} onClose={() => setSheet(false)} onSent={() => { setSheet(false); load() }} />}
    </div>
  )
}

const onHash = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb) }

/** The #sharing route: #sharing is my own list, #sharing/all the owner list, #sharing/<personId> one person's list. */
export default function SharingRoute() {
  const hash = useSyncExternalStore(onHash, () => location.hash)
  const rest = hash.replace(/^#sharing\/?/, '')
  if (rest === 'all') return <OwnerList />
  let id: string | null = null
  try { id = rest ? decodeURIComponent(rest) : null } catch { id = null } // a broken escape falls back to my own list
  return <SharingScreen person={id} />
}
