import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Carousel, Section, Skeleton } from '../look'
import { useActing } from '../viewas/viewAs'
import { PersonCard } from './PersonCard'
import { useFamilyPeople, type FamilyPerson } from './roster'
import type { useFocuses } from './useFocuses'
import './family.css'
import './v13-family.css'

/** Today (board): "N of M checked in" and a carousel of person cards sorted red first. */
export function TodayCarousel({ people, fx }: { people: FamilyPerson[]; fx: ReturnType<typeof useFocuses> }) {
  const { people: all } = useFamilyPeople()
  const acting = useActing()
  const { loaded: ready, items, rollOk } = fx
  const [note, setNote] = useState('')
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 3500); return () => clearTimeout(t) }, [note])
  const me = all.find((p) => p.isMe)
  const meta = !ready ? ' ' : people.length ? `${rollOk} of ${people.length} checked in` : 'Nobody yet'
  return (
    <Section title="Today" meta={meta} testId="facesrow">
      {!ready ? (
        <div aria-busy="true"><Skeleton lines={3} /><p className="sub">Loading your family…</p></div>
      ) : people.length === 0 ? (
        <p className="sub fm-empty">Your family shows here after the app has synced once. Connect to the internet and open the app.</p>
      ) : (
        <Carousel label="Family roll call">
          {items.map((it) => <PersonCard key={it.person.id} item={it} selfName={me?.name ?? ''} onNote={setNote} />)}
        </Carousel>
      )}
      {acting.acting && <p className="sub">Showing only who {acting.name || 'they'} can see.</p>}
      {note && createPortal(<div className="toast" role="status">{note}</div>, document.querySelector('.bt') ?? document.body)}
    </Section>
  )
}
