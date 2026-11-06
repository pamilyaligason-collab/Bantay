import { useEffect, useMemo, useState } from 'react'
import FmAvatar from '../family/FmAvatar'
import { listPhotos } from '../family/memoriesApi'
import { listMessages } from '../family/messagesApi'
import { rollCall, useCheckInsLoaded } from '../family/roster'
import { useLinkedPeople, useWriterFlags } from '../family/useFamilyScope'
import { useActing } from '../viewas/viewAs'
import { properName } from './medName'
import { GroupedList, Row, Section } from '../look'
import './health.css'

const DAY = 86_400_000

/** Family health (read-only): who checked in, a neutral flag line per person, and online counts for Memories and messages. Writes live in Family.
 *  shortcut: flag lines, not numbers, for other people (reportData keeps numbers behind useReportAccess); upgrade when lane F's feed defines shared readings. */
export function FamilyHealthCard({ ids }: { ids: string[] }) {
  const linked = useLinkedPeople()
  const { acting } = useActing()
  const key = ids.join()
  const people = useMemo(() => linked.filter((p) => key.split(',').includes(p.id)), [linked, key]) // only you and the people you are linked to (D-109), and of those who the viewer (or the person being acted as) can see
  const last = useCheckInsLoaded()
  const flags = useWriterFlags(people) // flag lines only for you and the people you are a writer carer of (D-109)
  const [photos, setPhotos] = useState<number | null>(null) // null: offline or not set up, so no row
  const [msgs, setMsgs] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    void listPhotos(12).then((r) => { if (live) setPhotos(r.ok ? r.data.length : null) }).catch(() => undefined)
    void listMessages(40).then((r) => { if (live) setMsgs(r.ok ? r.data.filter((m) => Date.now() - Date.parse(m.createdAt) < DAY).length : null) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  if (people.length < 2) return null
  const rc = last ? rollCall(people, last) : null
  const flagged = people.filter((p) => flags[p.id])
  return (
    <Section title="Family health" link={{ href: '#family', label: 'All updates' }} testId="family-health">
      <div className="card fh">
        <div className="fh-top">
          <span className="fh-av">{people.slice(0, 3).map((p) => <FmAvatar key={p.id} name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={32} />)}</span>
          <b className="fh-line">{rc ? `${rc.ok} of ${rc.total} checked in today` : 'Checking in...'}</b>
        </div>
        <div className="fh-acts">
          {acting ? <span className="sub fh-share">View only</span> : <a className="btn2 fh-share" href="#family/messages">Share yours</a>}
        </div>
        {(flagged.length > 0 || !!photos || !!msgs) && (
          <GroupedList icons>
            {flagged.map((p) => <Row key={p.id} avatar={<FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={32} />} title={properName(p.name)} sub={flags[p.id]} href={`#family/people/${p.id}`} />)}
            {photos != null && photos > 0 && <Row icon="heart" tint="amber" title="Memories" sub="Recent photos" href="#family/memories" />}
            {msgs != null && msgs > 0 && <Row icon="msg" tint="blue" title={`${msgs} ${msgs === 1 ? 'message' : 'messages'} today`} href="#family/messages" />}
          </GroupedList>
        )}
      </div>
    </Section>
  )
}
