import { rollCall, useCheckIns, useFamilyPeople } from '../family/roster'
import { useOthers } from './useOthers'

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** Top of Today: the big I'm OK button. Once this person has checked in today it becomes a calm confirmation:
 *  when, how many of the family are OK, and a link to see who. Both numbers come from the same live queries as People. */
export default function GreetingBand({ onOk }: { onOk: () => void }) {
  const { selfId } = useFamilyPeople()
  const last = useCheckIns()
  const { others } = useOthers()
  const { ok, total } = rollCall(others, last) // the others only, the same count as the family line
  const mine = selfId && last[selfId] ? new Date(last[selfId]!) : null
  const done = mine && !Number.isNaN(mine.getTime()) && sameDay(mine, new Date())
  if (done) {
    return (
      <section className="td-greet td-checked" aria-label="Check in">
        <span className="td-tick" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div className="td-grow">
          <b>You checked in <span className="td-nowrap">{mine.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></b>
          <span className="td-sub td-checked-n" role="status">{total > 0 ? `${ok} of ${total} others OK today` : 'Your family can see it'}</span>
        </div>
        <a className="td-link" href="#family">See who</a>
      </section>
    )
  }
  return (
    <section className="td-greet" aria-label="Check in">
      <button type="button" className="td-okbtn" onClick={onOk}>I&apos;m OK</button>
      {total > 0 && <p className="td-sub td-greet-n" role="status">{ok} of {total} others checked in today</p>}
    </section>
  )
}
