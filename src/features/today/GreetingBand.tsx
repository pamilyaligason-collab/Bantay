import { CountUp } from '../look'
import { rollCall, useCheckIns, useFamilyPeople } from '../family/roster'

/** Top of Today: one big I'm OK button and how many of the family have checked in today. */
export default function GreetingBand({ onOk }: { onOk: () => void }) {
  const { people } = useFamilyPeople()
  const last = useCheckIns()
  const { ok, total } = rollCall(people, last)
  return (
    <section className="td-greet" aria-label="Check in">
      <button type="button" className="td-okbtn" onClick={onOk}>I&apos;m OK</button>
      {total > 0 && <p className="td-sub td-greet-n"><CountUp to={ok} /> of {total} family checked in today</p>}
    </section>
  )
}
