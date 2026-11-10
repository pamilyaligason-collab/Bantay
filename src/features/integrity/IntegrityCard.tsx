import { Card, join, useSource } from '../admin/desk/Home'
import { useDeskPeople } from '../admin/desk/people'
import { Empty, Tag } from '../admin/desk/ui'
import { findingLine, integrityStatus, KIND_LABEL, LIST_MAX, loadIntegrity } from './integrityApi'
import '../admin/desk/system.css'

const WORD = { ok: 'OK', warn: 'Check', bad: 'Problem', plain: '' } as const
const clock = (iso: string) => new Date(iso).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

/** System health: the latest integrity-check run and the open findings. The list is a read-only worklist; fixing a record is done in Records, never from here. */
export default function IntegrityCard({ tick }: { tick: number }) {
  const snap = useSource(loadIntegrity, tick)
  const people = useDeskPeople()
  const st = integrityStatus(snap.data)
  const name = (id: string | null) => (id ? people.people?.find((p) => p.id === id)?.display_name ?? 'Unknown person' : 'No person')
  const d = snap.data
  const sum = d?.run?.summary
  return (
    <Card id="sy-int" title="Data integrity check" cls="dk-s12" src={join(snap)}>
      {d && !d.available && <div className="dk-card-b"><Empty>Not available yet. It starts once the integrity check is switched on.</Empty></div>}
      {d?.available && (
        <>
          <ul className="sy-list">
            <li className="sy-ln">
              <span className={`sy-dot ${st.tone}`} aria-hidden="true" />
              <div className="sy-grow">
                <b>{d.run ? `Last check ${clock(d.run.ran_at)}` : 'Every record, every night'}</b>
                <div className="sy-sub">
                  {sum && typeof sum.checked === 'number' ? `${sum.checked.toLocaleString('en-PH')} records checked · ${sum.dupes ?? 0} possible duplicates · ${sum.impossible ?? 0} cannot be right · ${sum.mismatched ?? 0} unit or total mismatches` : 'Looks for duplicates, impossible values, wrong units and day totals that disagree. It only reports; it never changes a record.'}
                </div>
              </div>
              <span className={`sy-st ${st.tone}`}>{WORD[st.tone] && <span className="wa-sr">{WORD[st.tone]}: </span>}{st.text}</span>
            </li>
          </ul>
          {d.findings.length === 0 ? <div className="dk-card-b"><Empty>{d.run ? 'No open findings.' : 'Nothing yet.'}</Empty></div> : (
            <ul className="sy-list" aria-label="Open findings">
              {d.findings.map((f) => {
                const l = findingLine(f)
                return (
                  <li key={f.id} className="sy-ln">
                    <Tag tone={f.kind === 'impossible' ? 'bad' : 'warn'}>{KIND_LABEL[f.kind]}</Tag>
                    <div className="sy-grow"><b>{l.title}</b><div className="sy-sub">{name(f.person_id)} · {l.note}</div></div>
                  </li>
                )
              })}
            </ul>
          )}
          {d.open > d.findings.length && <p className="sy-foot">Showing the first {LIST_MAX} of {d.open}.</p>}
        </>
      )}
    </Card>
  )
}
