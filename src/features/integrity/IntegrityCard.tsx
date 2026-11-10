import { useEffect, useState } from 'react'
import { Card, join, useSource } from '../admin/desk/Home'
import { useDeskPeople } from '../admin/desk/people'
import { Empty, Tag } from '../admin/desk/ui'
import { findingLine, integrityStatus, KIND_LABEL, KIND_ORDER, loadIntegrity, loadMore, PAGE_SIZE, type Finding, type Kind } from './integrityApi'
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
  const [more, setMore] = useState<Partial<Record<Kind, Finding[]>>>({})
  const [busy, setBusy] = useState<Kind | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setMore({}); setFailed(false) }, [d]) // a fresh load starts the lists over
  const showMore = async (k: Kind, lastId: number) => {
    setBusy(k)
    const r = await loadMore(k, lastId)
    setBusy(null)
    if (r.ok) { setFailed(false); setMore((m) => ({ ...m, [k]: [...(m[k] ?? []), ...r.data.filter((x) => !(m[k] ?? []).some((y) => y.id === x.id))] })) } else setFailed(true)
  }
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
                  {sum && typeof sum.checked === 'number' ? `${sum.checked.toLocaleString('en-PH')} records checked · ${sum.dupes ?? 0} extra duplicate rows (in ${d.counts.duplicate} groups) · ${sum.impossible ?? 0} cannot be right · ${sum.mismatched ?? 0} unit or total mismatches` : 'Looks for duplicates, impossible values, wrong units and day totals that disagree. It only reports; it never changes a record.'}
                </div>
              </div>
              <span className={`sy-st ${st.tone}`}>{WORD[st.tone] && <span className="wa-sr">{WORD[st.tone]}: </span>}{st.text}</span>
            </li>
          </ul>
          {d.open === 0 ? <div className="dk-card-b"><Empty>{d.run ? 'No open findings.' : 'Nothing yet.'}</Empty></div> : (
            <>
              <p className="sy-foot">{KIND_ORDER.filter((k) => d.counts[k] > 0).map((k) => `${KIND_LABEL[k]} ${d.counts[k].toLocaleString('en-PH')}`).join(' · ')}</p>
              {KIND_ORDER.filter((k) => d.counts[k] > 0).map((k) => {
                const rows = [...d.byKind[k], ...(more[k] ?? [])]
                const left = d.counts[k] - rows.length
                return (
                  <section key={k} aria-labelledby={`sy-int-${k}`}>
                    <h3 id={`sy-int-${k}`} className="sy-foot">{KIND_LABEL[k]} ({d.counts[k].toLocaleString('en-PH')})</h3>
                    <ul className="sy-list" aria-labelledby={`sy-int-${k}`}>
                      {rows.map((f) => {
                        const l = findingLine(f)
                        return (
                          <li key={f.id} className="sy-ln">
                            <Tag tone={f.kind === 'impossible' ? 'bad' : 'warn'}>{KIND_LABEL[f.kind]}</Tag>
                            <div className="sy-grow"><b>{l.title}</b><div className="sy-sub">{name(f.person_id)} · {l.note}</div></div>
                          </li>
                        )
                      })}
                    </ul>
                    {left > 0 && <p className="sy-foot"><button type="button" className="dk-b" disabled={busy === k} onClick={() => void showMore(k, rows[rows.length - 1]!.id)}>Show more {KIND_LABEL[k].toLowerCase()} ({Math.min(left, PAGE_SIZE)} of {left.toLocaleString('en-PH')} left)</button></p>}
                  </section>
                )
              })}
              {failed && <p className="sy-foot" role="status">Could not load more. Try again.</p>}
            </>
          )}
        </>
      )}
    </Card>
  )
}
