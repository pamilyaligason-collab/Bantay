import { useEffect, useState } from 'react'
import { faceName } from './FacesRow'
import { CarerCards } from './CarerCards'
import { messagePrefill } from './Messages'
import { useFamilyPeople } from './roster'
import './family.css'

/** "Needs you now" (F-12, P-4): the carer cards (missed doses with their own actions, "Still taking it?" asks, a phone that may miss alarms, "not feeling well") directly under the ID card.
 *  CarerCards draws nothing when it has nothing, so with no items this component draws nothing at all. A Message button opens the one family chat with "@name " ready. */
export default function NeedYouNow() {
  const { people } = useFamilyPeople()
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(t)
  }, [note])
  const talk = (personId: string) => {
    const p = people.find((x) => x.id === personId)
    if (p && !p.isMe) messagePrefill.text = `@${faceName(p.name)} `
    location.hash = 'family/messages'
  }
  return (
    <>
      <CarerCards onMessage={talk} onPhones={() => { location.hash = 'me/phone' }} onNote={setNote} />
      {note && <div className="toast" role="status">{note}</div>}
    </>
  )
}
