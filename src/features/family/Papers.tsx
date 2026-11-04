import Records from '../../screens/Records'
import { useQueue } from '../records/useRecordsServer'
import { SubHeader } from '../shell/SubHeader'
import { queueKicker } from './queueWords'
import './family.css'

/** Papers at #family/papers (D-100): the records screen moved here from Health, under a Back-to-Family header. The trust line stays (W-42). */
export default function Papers() {
  const queue = useQueue()
  return (
    <>
      <SubHeader title="Papers" backHref="#family" backLabel="Back to Family" />
      <p className="sub fm2-trust">Read by Bantay, checked by a person</p>
      {queue.count > 0 && <p className="sub" data-testid="papers-kicker">{queueKicker(queue)}</p>}
      <Records />
    </>
  )
}
