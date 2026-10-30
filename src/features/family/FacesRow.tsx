import { useEffect, useRef, useState } from 'react'
import { JackArt, Skeleton } from '../look'
import { Icon } from '../shell/Icon'
import { checkIn, FAIL_TEXT } from '../today/actions'
import { useActing, useViewedVisibleIds } from '../viewas/viewAs'
import FmAvatar from './FmAvatar'
import { bubbleStatus } from './messagesLogic'
import { messagePrefill } from './Messages'
import { checkInLabel, rollCall, useCheckInsLoaded, useFamilyPeople, type FamilyPerson } from './roster'
import { useFlagLines, useReportAccess } from './reportData'
import { useSosActive } from './sosActive'
import Sheet from './Sheet'
import './family.css'

/** The words under a picture: today's check-in ("OK 7:40 AM"), else when they were last OK ("Last OK yesterday", "Last OK 3 days ago", "Last OK 12 Oct"), else "No check-in yet". */
export function lastCheckInWords(iso: string | undefined, now: Date = new Date()): string {
  const t = iso ? new Date(iso) : null
  if (!t || Number.isNaN(t.getTime())) return 'No check-in yet'
  const today = checkInLabel(iso, now)
  if (today.ok) return today.text
  const day = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
  const n = day(now) - day(t)
  if (n < 1) return 'No check-in yet' // a time in the future is not a check-in
  if (n === 1) return 'Last OK yesterday'
  return n < 7 ? `Last OK ${n} days ago` : `Last OK ${t.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getMonth()]}`
}

const TITLES = new Set(['ate', 'kuya', 'ditse', 'manang', 'manong'])
/** The short name under a face: "Papa Ben" is Papa, but "Ate Joy" keeps both words ("Ate" alone names nobody). */
export function faceName(name: string): string {
  const [a, b] = name.trim().split(/\s+/)
  return !a ? name : b && TITLES.has(a.toLowerCase()) ? `${a} ${b}` : a
}

export type FaceKind = 'ok' | 'look' | 'none'
/** Colour plus shape plus word (D-96): ring colour and corner glyph come from this one answer. Before the first read (`known` false) nobody is OK or flagged. */
export function faceStatus(i: { known: boolean; checkedIn: boolean; flag: string | null }): { kind: FaceKind; word: string } {
  if (!i.known) return { kind: 'none', word: 'No news' }
  const b = bubbleStatus({ checkedIn: i.checkedIn, flag: i.flag })
  return b.key === 'ok' ? { kind: 'ok', word: 'OK today' } : b.key === 'look' ? { kind: 'look', word: 'Needs a look' } : { kind: 'none', word: 'No news' }
}

const GLYPH: Record<FaceKind, 'check' | 'warn' | 'clock'> = { ok: 'check', look: 'warn', none: 'clock' }
/** The 16 px line glyph inside the corner dot (and the legend), from the shared icon set (ICON-JACK-AUDIT I7, F11). "No news" is a clock until the set has a minus (needs L9). */
export function FaceGlyph({ kind }: { kind: FaceKind }) {
  return <i className="fm2-gl" data-k={kind} aria-hidden="true"><Icon name={GLYPH[kind]} size={16} /></i>
}

/** Faces of the family with a status ring and a corner glyph, a legend, and the small I'm OK button (D-100, R8). Tap a face: See their stats (only when this person may read them) or Send a message. */
export default function FacesRow() {
  const { people: all, selfId } = useFamilyPeople()
  const visible = useViewedVisibleIds()
  const acting = useActing()
  const sos = useSosActive()
  const people = visible ? all.filter((p) => visible.has(p.id)) : all // while acting: only who the viewed person can see (fails closed)
  const loaded = useCheckInsLoaded()
  const last = loaded ?? {}
  const flags = useFlagLines(people)
  const rc = rollCall(people, last)
  const [okAt, setOkAt] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [pick, setPick] = useState<FamilyPerson | null>(null)
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

  return (
    <section className="card fm2-faces" data-testid="facesrow" aria-label="Everyone today">
      <div className="fm2-fh" ref={head} tabIndex={-1}>
        <div className="fm2-fh-t">
          <b>Everyone today</b>
          <span className="sub">{loaded === null ? ' ' : rc.total ? `${rc.ok} of ${rc.total} OK` : 'Nobody has checked in yet'}</span>
        </div>
        {acting.acting ? (
          <button type="button" className="pill fm2-ok" disabled aria-label="I'm OK, view only"><Icon name="lock" size={20} />View only</button>
        ) : doneAt ? (
          <span className="fm2-okwrap"><b className="fm-okdone"><Icon name="check" size={20} />You're OK · {doneAt}</b>{okAt && !sos && <JackArt name="well-done" size={56} decorative />}</span>
        ) : (
          <button type="button" className="pill primary fm2-ok" onClick={() => void imOk()} disabled={!selfId}><Icon name="check" size={20} />I'm OK</button>
        )}
      </div>

      {loaded === null ? (
        <div aria-busy="true"><Skeleton lines={2} /><p className="sub fm-key">Loading your family…</p></div>
      ) : people.length === 0 ? (
        <p className="sub fm-empty">Your family shows here after the app has synced once. Connect to the internet and open the app.</p>
      ) : (
        <>
          <ul className="fm2-faces-row" data-no-swipe aria-label="Family roll call">
            {people.map((p) => {
              const c = checkInLabel(last[p.id])
              const s = faceStatus({ known: true, checkedIn: c.ok, flag: flags[p.id] ?? null })
              const words = s.kind === 'ok' ? c.text : s.kind === 'look' ? (flags[p.id] ?? s.word) : lastCheckInWords(last[p.id])
              return (
                <li key={p.id}>
                  <button type="button" className="fm2-face press" data-k={s.kind} onClick={() => setPick(p)} aria-label={`${p.name}${p.isMe ? ' (you)' : ''}, ${c.text}, ${s.word}${flags[p.id] ? `, ${flags[p.id]}` : ''}. Open`}>
                    <span className="fm2-ring" data-testid="face-ring" data-k={s.kind}>
                      <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={48} />
                      <span className="fm2-dot" data-testid="bubble-badge" data-k={s.kind}><FaceGlyph kind={s.kind} /></span>
                    </span>
                    <b>{p.isMe ? 'You' : faceName(p.name)}</b>
                    <span className="st" data-testid={s.kind === 'look' && flags[p.id] ? 'flag-line' : undefined}>{words}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="fm2-leg" aria-label="Legend">
            <span data-k="ok"><FaceGlyph kind="ok" />OK today</span>
            <span data-k="look"><FaceGlyph kind="look" />Needs a look</span>
            <span data-k="none"><FaceGlyph kind="none" />No news</span>
          </p>
          {acting.acting && <p className="sub">Showing only who {acting.name || 'they'} can see.</p>}
        </>
      )}
      {pick && <FaceSheet person={pick} onClose={() => setPick(null)} />}
      {note && <div className="toast" role="status">{note}</div>}
    </section>
  )
}

/** The two things you can do with a face. "See their stats" only when this phone may read that person's records (the same rule as their page). */
function FaceSheet({ person, onClose }: { person: FamilyPerson; onClose: () => void }) {
  const access = useReportAccess(person.id)
  const name = faceName(person.name)
  return (
    <Sheet title={person.isMe ? 'You' : name} onClose={onClose}>
      <div className="fm2-sheet-acts">
        {access === true && <a className="btn2" href={`#family/people/${person.id}`} onClick={onClose}><Icon name="heart" size={20} />See their stats</a>}
        <a className="btn" href="#family/messages" onClick={() => { if (!person.isMe) messagePrefill.text = `@${name} `; onClose() }}><Icon name="msg" size={20} />Send a message</a>
      </div>
    </Sheet>
  )
}
