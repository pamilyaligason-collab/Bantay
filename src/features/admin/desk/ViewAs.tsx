import { useEffect, useRef, useState } from 'react'
import Avatar from '../Avatar'
import { day } from '../shared'
import { Empty, Skeleton, Tag } from './ui'
import { loadPreview, loadRoster, logViewAs, RELATION_TEXT, visibleTo, type Preview, type Visible, type ViewPerson } from './viewAsData'
import './members.css'

const words = (s: string) => s.replace(/_/g, ' ')

/** The phone's buttons, drawn disabled so the admin sees what a member can do and cannot press any of it. */
export const PHONE_ACTIONS = ['Log a reading', 'Take a dose', 'Add a medicine', 'Scan a paper'] as const

/** Presentational: everything arrives as props, so a test can render any member without a server. No inputs, no forms, no enabled buttons that change data. */
export function ViewAsPreview({ name, shown, hidden, selected, onSelect, preview, logged }: {
  name: string; shown: Visible[]; hidden: ViewPerson[]; selected: string | null; onSelect: (id: string) => void; preview: Preview | null; logged: boolean | null
}) {
  const cur = shown.find((v) => v.person.id === selected) ?? null
  return (
    <section className="va" aria-label={`Preview of what ${name} sees`}>
      <div className="va-banner" role="status">
        <b>Preview only.</b> This is an approximation of what {name} sees on their phone, worked out from the family links the admin can read. It is not their real session and
        the real rules (RLS) on the server decide. You cannot change anything here.
        {logged === false && <span className="va-warn"> This view could not be added to History.</span>}
        {logged === true && <span className="dk-sub"> This view is recorded in History (no health values).</span>}
      </div>
      <div className="va-grid">
        <nav className="va-people dk-card" aria-label={`People ${name} can see`}>
          <div className="dk-card-h"><h2>People {name} can see</h2><Tag>{shown.length}</Tag></div>
          <div className="dk-card-b">
            {shown.length === 0 ? <Empty>{name} cannot see anyone yet.</Empty> : (
              <ul className="mb-list">
                {shown.map((v) => (
                  <li key={v.person.id}>
                    <button className="va-person" aria-pressed={v.person.id === selected} onClick={() => onSelect(v.person.id)}>
                      <Avatar name={v.person.display_name} photoPath={v.person.photo_path} size={32} />
                      <span className="dk-grow"><b>{v.person.display_name}</b><span className="dk-sub va-rel">{RELATION_TEXT[v.relation]}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="dk-sub va-hidden" data-testid="va-hidden">{hidden.length === 0 ? 'Nobody is hidden from them.' : `Hidden from ${name}: ${hidden.map((p) => p.display_name).join(', ')}.`}</p>
          </div>
        </nav>
        <div className="va-phone dk-card" data-va-frame>
          <div className="dk-card-h"><h2>{cur ? cur.person.display_name : 'Nobody selected'}</h2>{cur && <Tag>{RELATION_TEXT[cur.relation]}</Tag>}</div>
          <div className="dk-card-b mb-stack">
            <div className="va-acts" data-va-actions aria-label="Phone actions, preview only">
              {PHONE_ACTIONS.map((a) => <button key={a} className="dk-b" disabled aria-disabled="true" title="Preview only">{a}</button>)}
            </div>
            {!cur ? <Empty>Pick a person on the left.</Empty> : !cur.records ? <Empty>{name} made this person but is not linked as a carer, so the phone shows the name and no records.</Empty> : !preview ? <Skeleton rows={4} /> : (
              <>
                <div className="mb-sec"><h3>Medicines</h3>
                  {preview.meds === null ? <p className="dk-sub">Could not load.</p> : preview.meds.length === 0 ? <p className="dk-sub">None listed.</p> : (
                    <ul className="mb-list">{preview.meds.map((m, i) => <li key={i}><b>{m.name}</b> <span className="dk-sub">{[m.strength, m.dose, m.as_needed ? 'as needed' : m.schedule.join(', ')].filter(Boolean).join(' · ')}</span></li>)}</ul>
                  )}
                </div>
                <div className="mb-sec"><h3>Latest readings</h3>
                  {preview.readings === null ? <p className="dk-sub">Could not load.</p> : preview.readings.length === 0 ? <p className="dk-sub">No readings.</p> : (
                    <ul className="mb-list">{preview.readings.map((r) => <li key={r.test}><b>{words(r.test)}</b> {r.value}{r.unit ? ` ${r.unit}` : ''} <span className="dk-sub">{day(r.taken_at)}</span></li>)}</ul>
                  )}
                </div>
                <div className="mb-sec"><h3>Records</h3>
                  {preview.docs === null ? <p className="dk-sub">Could not load.</p> : preview.docs.length === 0 ? <p className="dk-sub">No confirmed papers.</p> : (
                    <ul className="mb-list">{preview.docs.map((d) => <li key={d.id}><b>{d.title || words(d.kind)}</b> <span className="dk-sub">{words(d.kind)} · {day(d.doc_date)}</span></li>)}</ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Loads the roster, works out what `userId` can see, records the view once, and loads one person's data at a time. */
export default function ViewAs({ userId, personId, name }: { userId: string; personId: string; name: string }) {
  const [data, setData] = useState<ReturnType<typeof visibleTo> | null | undefined>(undefined) // undefined loading, null failed
  const [sel, setSel] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [logged, setLogged] = useState<boolean | null>(null)
  const sent = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(undefined); setSel(null)
    void loadRoster().then((r) => {
      if (!alive) return
      if (!r) return setData(null)
      const v = visibleTo(userId, r.people, r.carers)
      setData(v); setSel(v.shown[0]?.person.id ?? null)
    })
    return () => { alive = false }
  }, [userId])

  // One audit row per open, for the person being viewed as. StrictMode runs effects twice: the ref keeps it to one.
  useEffect(() => {
    if (sent.current === personId) return
    sent.current = personId
    setLogged(null)
    void logViewAs(personId).then(setLogged)
  }, [personId])

  const cur = data?.shown.find((v) => v.person.id === sel)
  useEffect(() => {
    setPreview(null)
    if (!sel || !cur?.records) return
    let alive = true
    void loadPreview(sel).then((p) => { if (alive) setPreview(p) })
    return () => { alive = false }
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) return <Skeleton rows={6} />
  if (data === null) return <Empty>The family links could not be loaded, so the preview cannot be built. Reload the page to try again.</Empty>
  return <ViewAsPreview name={name} shown={data.shown} hidden={data.hidden} selected={sel} onSelect={setSel} preview={preview} logged={logged} />
}
