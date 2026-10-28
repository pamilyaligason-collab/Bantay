import { useFamilyPeople, type FamilyPerson } from './roster'
import Messages from './Messages'

const NOBODY: FamilyPerson = { id: '', name: 'You', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true }

/** Family > Messages: the one family thread, drawn in the page instead of a sheet. */
export default function FamilyMessages() {
  const { people } = useFamilyPeople()
  return <Messages inline who={people.find((p) => p.isMe) ?? NOBODY} people={people} nudge={null} onClose={() => undefined} onOpenPage={() => undefined} />
}
