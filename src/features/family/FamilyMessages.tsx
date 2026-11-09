import { useFamilyPeople, type FamilyPerson } from './roster'
import Messages from './Messages'
import { ReachList } from './ReachList'

const NOBODY: FamilyPerson = { id: '', name: 'You', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true }

/** Family > Messages (S28, D-168): a Messenger and a WhatsApp shortcut for each person first. The in-app family thread stays below for Bantay's own alerts and check-ins; talk happens in the apps people already use. */
export default function FamilyMessages() {
  const { people } = useFamilyPeople()
  return (
    <>
      <ReachList people={people.filter((p) => p.id)} />
      <h2 className="hd cd-title" id="fm-alerts-h">Alerts and check-ins</h2>
      <p className="sub cd-meta">The shared family thread inside Bantay, for alerts and check-ins. To chat, use Messenger or WhatsApp above.</p>
      <Messages inline who={people.find((p) => p.isMe) ?? NOBODY} people={people} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />
    </>
  )
}
