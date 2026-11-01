import { useEffect, useRef, useState } from 'react'
import { Carousel, JackArt, Section, Skeleton } from '../look'
import { Icon } from '../shell/Icon'
import { checkIn, FAIL_TEXT } from '../today/actions'
import { useActing } from '../viewas/viewAs'
import { PersonCard } from './PersonCard'
import { checkInLabel, useCheckInsLoaded, useFamilyPeople, type FamilyPerson } from './roster'
import { useSosActive } from './sosActive'
import type { useFocuses } from './useFocuses'
import './family.css'
import './v13-family.css'

/** Today (board): "N of M checked in", the I'm OK button (moved here from the old Faces card, same words and toast), and a carousel of person cards sorted red first. */
export function TodayCarousel({ people, fx }: { people: FamilyPerson[]; fx: ReturnType<typeof useFocuses> }) {
  const { people: all, selfId } = useFamilyPeople()
  const acting = useActing()
  const sos = useSosActive()
  const loaded = useCheckInsLoaded()
  const { loaded: ready, items, rollOk } = fx
  const [okAt, setOkAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const head = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 4000); return () => clearTimeout(t) }, [note])
  useEffect(() => { if (okAt) head.current?.focus() }, [okAt]) // the button is gone now: keep focus on the header
  const selfAt = selfId && loaded && checkInLabel(loaded[selfId]).ok ? checkInLabel(loaded[selfId]).text.replace(/^OK /, '') : null
  const doneAt = acting.acting ? null : okAt ?? selfAt
  const imOk = async () => {
    const r = await checkIn()
    if (r === 'ok') setOkAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) // only after the write succeeded
    setNote(r === 'ok' ? 'The family can see you are OK.' : FAIL_TEXT[r])
  }
  const me = all.find((p) => p.isMe)
  const meta = !ready ? ' ' : people.length ? `${rollOk} of ${people.length} checked in` : 'Nobody yet'
  return (
    <Section title="Today" meta={meta} testId="facesrow">
      <div className="td-h" ref={head} tabIndex={-1}>
        {acting.acting ? (
          <button type="button" className="pill fm2-ok" disabled aria-label="I'm OK, view only"><Icon name="lock" size={20} />View only</button>
        ) : doneAt ? (
          <span className="fm2-okwrap"><b className="fm-okdone"><Icon name="check" size={20} />You're OK · {doneAt}</b>{okAt && !sos && <JackArt name="well-done" size={56} decorative />}</span>
        ) : (
          <button type="button" className="pill primary fm2-ok" onClick={() => void imOk()} disabled={!selfId}><Icon name="check" size={20} />I'm OK</button>
        )}
      </div>
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
      {note && <div className="toast" role="status">{note}</div>}
    </Section>
  )
}
