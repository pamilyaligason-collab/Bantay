import { useCallback, useEffect, useState } from 'react'
import { initialsOf } from '../auth/family'
import { getMember } from '../auth/session'
import { GroupedList, Row } from '../look'
import { usePeople } from '../records/useRecordsServer'
import { SubHeader } from '../shell/SubHeader'
import { useSelfPersonId } from '../setup/useProfile'
import { NOT_OWNER, shareCopy, shareCounts } from './api'
import '../shell/shell.css'
import './sharing.css'

/** Me > Family and sharing > "Who sees whom" (#sharing/all, board D109Owner): the family owner's list of people with how many can see each. A tap opens that person's list.
 *  The counts leave out the owner's own links: the owner sees everyone without one, so "Only you" means no one else. */
export function OwnerList() {
  const selfId = useSelfPersonId()
  const people = usePeople()
  const [owner, setOwner] = useState<{ userId: string } | false | null>(null) // null = not asked yet
  const [counts, setCounts] = useState<Map<string, number> | null | undefined>(undefined) // undefined = loading, null = could not load
  useEffect(() => {
    let live = true
    void getMember().catch(() => null).then((m) => { if (live) setOwner(m?.isOwner === true ? { userId: m.userId } : false) }) // any error reads as not the owner (fails closed)
    return () => { live = false }
  }, [])
  const ownerId = owner ? owner.userId : null
  const load = useCallback(() => { if (ownerId) void shareCounts(ownerId).then(setCounts) }, [ownerId])
  useEffect(load, [load])

  const rows = people.filter((p) => p.id !== selfId && p.kind !== 'shared').sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="sh sh-me">
      <SubHeader title="Who sees whom" backHref="#me/family" backLabel="Back to Family and sharing" />
      {owner === null ? <p className="sh-sub sh-note" role="status">Loading.</p>
        : !owner ? <p className="sh-sub sh-note" role="alert">{NOT_OWNER}</p>
        : (
          <>
            <p className="sh-note">You can see everyone. The app opens on your own page.</p>
            {counts === null ? <p className="sh-sub sh-note" role="alert">{shareCopy('offline')} <button type="button" className="sh-pill sh-ghost sh-small" onClick={() => { setCounts(undefined); load() }}>Try again</button></p>
              : counts === undefined ? <p className="sh-sub sh-note" role="status">Loading.</p>
              : (
                <GroupedList label="People" testId="owner-list">
                  {rows.map((p) => {
                    const n = counts.get(p.id) ?? 0
                    return <Row key={p.id} avatar={initialsOf(p.name)} title={p.name} value={n === 0 ? 'Only you' : `${n} can see`} href={`#sharing/${encodeURIComponent(p.id)}`} chev />
                  })}
                </GroupedList>
              )}
            <p className="sh-sub sh-note">Changes apply at once. A person with a login is told and can stop it. For someone with no login, the new viewer and the carers are told.</p>
          </>
        )}
    </div>
  )
}

export default OwnerList
