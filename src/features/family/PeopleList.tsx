import { useState } from 'react'
import { GroupedList, Row, Section } from '../look'
import FmAvatar from './FmAvatar'
import { faceName, faceStatus, lastCheckInWords } from './FacesRow'
import { placeSub } from './placeAge'
import type { Place } from './placeApi'
import { useWriterFlags } from './useFamilyScope'
import { checkInLabel, useCheckInsLoaded, type FamilyPerson } from './roster'
import './v13-family.css'

const SHOWN = 3 // the board shows three, then "See all" (F3)

/** People (board): you and the people you are linked to, each with their last check-in and one status word (colour is the Row tint on the avatar ring; the word is always there). The flag word (a high reading, a missed medicine) shows only for you and for people you are a writer carer of (D-109); a read-only link gets the check-in alone. The place line (D-136) shows only when `places` is passed (flag bantay.flag.places). Who is shown here is unchanged (D-109); only the fold is new: three first, anyone flagged or not checked in leading, then See all with the count. */
export function PeopleList({ people, places }: { people: FamilyPerson[]; places?: Place[] | null }) {
  const loaded = useCheckInsLoaded()
  const flags = useWriterFlags(people)
  const [all, setAll] = useState(false)
  const now = Date.now()
  if (!loaded || people.length === 0) return null
  const flagged = (id: string) => faceStatus({ known: true, checkedIn: true, flag: flags[id] ?? null }).kind === 'look' // the one flag test (faceStatus, via bubbleStatus): the up-to-date line is not a flag
  const ordered = [...people].sort((a, b) => Number(checkInLabel(loaded[a.id]).ok && !flagged(a.id)) - Number(checkInLabel(loaded[b.id]).ok && !flagged(b.id))) // anyone flagged or not checked in leads, so the fold never hides them
  return (
    <Section title="People" testId="people">
      <GroupedList label="People" testId="people-list">
        {(all ? ordered : ordered.slice(0, SHOWN)).map((p) => {
          const c = checkInLabel(loaded[p.id])
          const place = places?.find((x) => x.personId === p.id)
          const s = faceStatus({ known: true, checkedIn: c.ok, flag: flags[p.id] ?? null })
          return <Row key={p.id} testId="people-row" avatar={<FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={36} />} title={p.isMe ? 'You' : faceName(p.name)} sub={place ? `${lastCheckInWords(loaded[p.id])} · Place ${placeSub(place, now)}` : lastCheckInWords(loaded[p.id])} value={s.kind === 'look' ? (flags[p.id] ?? s.word) : s.word} href={`#family/people/${p.id}`} />
        })}
      </GroupedList>
      {people.length > SHOWN && <button type="button" className="pl-more press" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Fewer' : `See all (${people.length})`}</button>}
    </Section>
  )
}
