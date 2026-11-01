import { useEffect, useState } from 'react'
import { GroupedList, Row, Section } from '../look'
import { useQueue } from '../records/useRecordsServer'
import { useKv } from '../shell/useKv'
import { dayKey } from './events'
import { familyFeedOn } from './flags'
import { listMessages, type Msg } from './messagesApi'
import { messagesPreview } from './messagesPreview'
import { dayRows, groupPlan, progressOf } from './planList'
import { useFamilyPeople } from './roster'
import { usePlan } from './usePlan'
import './v13-family.css'

export const SEEN = 'family.msgs.seen' // kv: ISO time the family chat was last opened on this phone

const planSub = (rows: ReturnType<typeof dayRows>) => {
  const prog = progressOf(rows)
  return prog.total > 0 ? `${prog.done} of ${prog.total} done today` : rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'thing' : 'things'} today` : 'Nothing planned'
}

/** Together (board): Plan and calendar, Messages, Papers, Memories as one grouped list, each with a live word. */
export function TogetherList() {
  const { people } = useFamilyPeople()
  const { tasks, events, notes } = usePlan()
  const queue = useQueue()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [seen, , seenLoaded] = useKv<string | null>(SEEN, null)
  useEffect(() => {
    let live = true
    void listMessages(20).then((r) => { if (live && r.ok) setMsgs(r.data) })
    return () => { live = false }
  }, [])
  const now = new Date()
  const plan = planSub(dayRows(groupPlan(tasks, events, notes, now), dayKey(now), now))
  const m = messagesPreview(msgs, people, seenLoaded ? seen : new Date().toISOString())
  return (
    <Section title="Together" link={familyFeedOn() ? { href: '#family/feed', label: 'Updates' } : undefined} testId="together">
      <GroupedList icons label="Together" testId="together-list">
        <Row icon="calendar" tint="green" title="Plan and calendar" sub={plan} href="#family/plan" testId="planrow" />
        <Row icon="msg" tint="blue" title="Messages" sub={m.sub} badge={m.unread} href="#family/messages" testId="msgs" />
        <Row icon="file" tint="purple" title="Papers" sub={queue.count > 0 ? `${queue.count} to confirm` : 'Nothing waiting'} href="#family/papers" testId="papersrow" />
        <Row icon="photo" tint="amber" title="Memories" sub="Family photos, kept private" href="#family/memories" testId="memoriesrow" />
      </GroupedList>
    </Section>
  )
}
