import { useEffect, useState } from 'react'
import { MoreGrid, Section } from '../look'
import { Icon } from '../shell/Icon'
import FmAvatar from './FmAvatar'
import { FaceGlyph, faceName, faceStatus, lastCheckInWords } from './FacesRow'
import { messagePrefill } from './Messages'
import { messengerHref, whatsappHref } from './messagesLogic'
import { FocusActions } from './PersonCard'
import { placeSub } from './placeAge'
import type { Place } from './placeApi'
import { useWriterFlags } from './useFamilyScope'
import { checkInLabel, useCheckInsLoaded, type FamilyPerson } from './roster'
import type { PersonFocus } from './useFocuses'
import './v13-family.css'

const SHOWN = 4 // S25 (D-156): a 2-column grid of four cards, then Show more
const TODAY_KINDS = new Set(['missed', 'questions', 'due', 'unwell']) // focus lines worth a second status line (check-in and place already have their own)

/** People (board): you and the people you are linked to, each with their last check-in and one status word (colour is the Row tint on the avatar ring; the word is always there). The flag word (a high reading, a missed medicine) shows only for you and for people you are a writer carer of (D-109); a read-only link gets the check-in alone. The place line (D-136) shows only when `places` is passed (flag bantay.flag.places). Who is shown here is unchanged (D-109).
 *  S25: a 2-column grid of person cards (no side swipe), four first with anyone flagged or not checked in leading, then Show more; an Add card ends the section.
 *  S26 (D-168): the card also carries today's status that the Family "Today" list used to show. `focus` is only you and the people you care for (D-109), so a view-only person never gains a line: it says what needs a look ("Missed a medicine") and, for a carer, the one-tap Mark taken / Answer. Message always; Messenger and WhatsApp only when that person has a saved handle or number. */
export function PeopleList({ people, places, focus = [], selfName = '' }: { people: FamilyPerson[]; places?: Place[] | null; focus?: PersonFocus[]; selfName?: string }) {
  const loaded = useCheckInsLoaded()
  const flags = useWriterFlags(people)
  const [note, setNote] = useState('')
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 3500); return () => clearTimeout(t) }, [note])
  const now = Date.now()
  if (!loaded || people.length === 0) return null
  const flagged = (id: string) => faceStatus({ known: true, checkedIn: true, flag: flags[id] ?? null }).kind === 'look' // the one flag test (faceStatus, via bubbleStatus): the up-to-date line is not a flag
  const ordered = [...people].sort((a, b) => Number(checkInLabel(loaded[a.id]).ok && !flagged(a.id)) - Number(checkInLabel(loaded[b.id]).ok && !flagged(b.id))) // anyone flagged or not checked in leads, so the fold never hides them
  const talk = (p: FamilyPerson) => { messagePrefill.text = `@${faceName(p.name)} `; location.hash = 'family/messages' }
  return (
    <Section title="People" testId="people">
      <MoreGrid label="People" testId="people-list" step={SHOWN} tail={<a className="pp-card pp-add" href="#me/family" data-testid="people-add"><Icon name="plus" size={28} /><b>Add a person</b></a>}>
        {ordered.map((p) => {
          const c = checkInLabel(loaded[p.id])
          const place = places?.find((x) => x.personId === p.id)
          const s = faceStatus({ known: true, checkedIn: c.ok, flag: flags[p.id] ?? null })
          const item = focus.find((i) => i.person.id === p.id)
          const today = item && TODAY_KINDS.has(item.focus.kind) ? item.focus.line : null
          const name = p.isMe ? 'You' : faceName(p.name)
          const mess = messengerHref(p.messenger)
          const wa = whatsappHref(p.phone)
          return (
            <div key={p.id} className="pp-card" data-testid="people-row">
              <a className="pp-main" href={`#family/people/${p.id}`}>
                <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={44} />
                <b className="rw-title">{name}</b>
                <span className="sub">{place ? `${lastCheckInWords(loaded[p.id])} · Place ${placeSub(place, now)}` : lastCheckInWords(loaded[p.id])}</span>
                {today && <span className="sub pp-today" data-testid="pp-today">{today}</span>}
                <span className="pp-st" data-k={s.kind}><FaceGlyph kind={s.kind} />{s.kind === 'look' ? (flags[p.id] ?? s.word) : s.word}</span>
              </a>
              {item && <FocusActions item={item} selfName={selfName} onNote={setNote} />}
              {!p.isMe && (
                <div className="pp-reach" role="group" aria-label={`Message ${name}`}>
                  <button type="button" className="pc-btn" onClick={() => talk(p)}>Message</button>
                  {mess && <a className="pc-btn" href={mess.href} target="_blank" rel="noreferrer">{mess.label}</a>}
                  {wa && <a className="pc-btn" href={wa.href} target="_blank" rel="noreferrer">{wa.label}</a>}
                </div>
              )}
            </div>
          )
        })}
      </MoreGrid>
      {note && <div className="toast" role="status">{note}</div>}
    </Section>
  )
}
