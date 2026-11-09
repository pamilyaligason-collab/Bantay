import { useFamilyPeople } from './roster'
import Messages from './Messages'
import { ReachList } from './ReachList'

/** Family > Messages (S28, D-168): a Messenger and a WhatsApp shortcut for each person first. The feed below is read only: Bantay's own alerts and check-ins. Talking happens in the apps people already use. */
export default function FamilyMessages() {
  const { people } = useFamilyPeople()
  return (
    <>
      <ReachList people={people.filter((p) => p.id)} />
      <h2 className="hd cd-title" id="fm-alerts-h">Alerts and check-ins</h2>
      <p className="sub cd-meta">Bantay's alerts and check-ins from your family. To chat, use Messenger or WhatsApp above.</p>
      <Messages people={people} />
    </>
  )
}
