import { rollCall, useCheckIns, useFamilyPeople } from '../family/roster'
import { useOthers } from './useOthers'

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** The big I'm OK button. Once this person has checked in today the whole card is hidden (nothing left to ask). The count comes from the same live queries as People. */
export default function GreetingBand({ onOk }: { onOk: () => void }) {
  const { selfId } = useFamilyPeople()
  const last = useCheckIns()
  const { others } = useOthers()
  const { ok, total } = rollCall(others, last) // the others only, the same count as the family line
  const mine = selfId && last[selfId] ? new Date(last[selfId]!) : null
  const done = mine && !Number.isNaN(mine.getTime()) && sameDay(mine, new Date())
  if (done) return null // already checked in today: nothing to ask. Family sees the check-in on the Family tab
  return (
    <section className="td-greet" aria-label="Check in">
      <button type="button" className="td-okbtn" onClick={onOk}>I&apos;m OK</button>
      {total > 0 && <p className="td-sub td-greet-n" role="status">{ok} of {total} others checked in today</p>}
    </section>
  )
}
