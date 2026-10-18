import { useEffect, useRef, useState } from 'react'
import { GUIDE } from '../features/health/ranges'
import { testLabel, useHealthData } from '../features/records/useHealthData'
import { useConfirmedDocs, usePeople, useQueue } from '../features/records/useRecordsServer'
import { ConfirmFlow, firstName, KIND } from '../features/records/ConfirmSheet'
import { RecordDetail } from '../features/records/RecordDetail'

export default function Records() {
  const { ready, people: stored, personId, readings, consults, reload } = useHealthData()
  const people = usePeople(stored)
  const queue = useQueue()
  const [ver, setVer] = useState(0)
  const docs = useConfirmedDocs(personId, ver)
  const [sheet, setSheet] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [test, setTest] = useState('')
  const tests = [...new Set(readings.map((r) => r.test))].sort()
  const picked = test && tests.includes(test) ? test : (tests[0] ?? '')
  const series = readings.filter((r) => r.test === picked)
  const signature = series.map((r) => `${r.id}:${r.takenAt}:${r.value}`).join('|')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el || series.length === 0) return
    let chart: { destroy(): void; setSize(o: { width: number; height: number }): void } | undefined
    let live = true
    const ro = new ResizeObserver(() => chart?.setSize({ width: Math.max(el.clientWidth, 200), height: 150 }))
    ro.observe(el)
    // uPlot touches matchMedia at import, so load it only when a chart is drawn.
    import('../features/records/trend').then((m) => {
      if (!live) return
      el.innerHTML = ''
      chart = m.trendChart(el, series, Math.max(el.clientWidth, 200))
    })
    return () => {
      live = false
      ro.disconnect()
      chart?.destroy()
    }
  }, [picked, signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const docFiles = new Set(docs.flatMap((d) => d.files.map((f) => f.drive_file_id)))
  const shown = readings.filter((r) => !(r.sourceFileId && docFiles.has(r.sourceFileId))) // those appear under their document
  const days = new Map<string, { tests: typeof readings; consults: typeof consults; docs: typeof docs }>()
  const day = (d: string) => days.get(d) ?? { tests: [], consults: [], docs: [] }
  for (const r of shown) days.set(r.takenAt.slice(0, 10), { ...day(r.takenAt.slice(0, 10)), tests: [...day(r.takenAt.slice(0, 10)).tests, r] })
  for (const c of consults) days.set(c.takenAt.slice(0, 10), { ...day(c.takenAt.slice(0, 10)), consults: [...day(c.takenAt.slice(0, 10)).consults, c] })
  for (const d of docs) { const k = d.doc.doc_date ?? d.doc.confirmed_at?.slice(0, 10) ?? 'Undated'; days.set(k, { ...day(k), docs: [...day(k).docs, d] }) }
  const dates = [...days.keys()].sort().reverse()
  const detail = docs.find((d) => d.doc.id === detailId)
  if (detail) return <RecordDetail bundle={detail} who={firstName(people.find((p) => p.id === detail.doc.person_id)?.name)} onBack={() => setDetailId(null)} />
  const changed = () => { reload(); queue.refresh(); setVer((v) => v + 1) }

  return (
    <>
      {queue.error && (
        <div className="grp">
          <div className="row">
            <span className="grow">Could not load records to check. Try again.</span>
            <button type="button" className="btn2" onClick={queue.refresh}>Try again</button>
          </div>
        </div>
      )}
      {queue.count > 0 && (
        <div className="grp">
          <button className="row" onClick={() => setSheet(true)}>
            <span className="grow">
              To check ({queue.count})
              <span className="sub">Imported results waiting for you to confirm.</span>
            </span>
            <span className="chev" aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      )}
      {sheet && <ConfirmFlow people={people} onClose={() => setSheet(false)} onChanged={changed} />}
      {ready && dates.length === 0 ? (
        <div className="grp">
          <div className="row">
            <span className="grow">
              No records yet
              <span className="sub">Confirmed lab results and doctor visits will appear here, newest first.</span>
            </span>
          </div>
        </div>
      ) : (
        <>
          <section aria-labelledby="trend">
            <h2 className="hd" id="trend">Trend</h2>
            <div className="grp" style={{ padding: 16 }}>
              <label className="sub">
                Test{' '}
                <select value={picked} onChange={(e) => setTest(e.target.value)} style={{ font: 'inherit', minHeight: 44 }}>
                  {tests.map((t) => (
                    <option key={t} value={t}>
                      {testLabel(t, GUIDE)}
                    </option>
                  ))}
                </select>
              </label>
              {series.length < 2 && <p className="sub">Add one more result to see a trend line.</p>}
              <div ref={box} role="img" aria-label={`Trend of ${testLabel(picked, GUIDE)} over time`} style={{ overflow: 'hidden', minHeight: 150 }} />
            </div>
          </section>
          <section aria-labelledby="tl">
            <h2 className="hd" id="tl">Timeline</h2>
            <div className="grp" data-testid="timeline">
              {dates.map((d) => (
                <div className="row" key={d} style={{ alignItems: 'flex-start' }}>
                  <span className="sub" style={{ width: 92, flex: 'none' }}>{d}</span>
                  <span className="grow">
                    {day(d).consults.map((c) => (
                      <span key={`c${c.id}`}>
                        Doctor visit{c.doctor ? `: ${c.doctor}` : ''}
                        {c.reason && <span className="sub">{c.reason}</span>}
                      </span>
                    ))}
                    {day(d).docs.map((x) => (
                      <button key={x.doc.id} className="rx-btn" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setDetailId(x.doc.id)}>
                        {KIND[x.doc.kind] ?? 'Document'}{x.doc.facility ? `, ${x.doc.facility}` : ''}
                      </button>
                    ))}
                    {day(d).tests.map((r) => (
                      <span key={`r${r.id}`}>
                        {testLabel(r.test, GUIDE)}: {r.value} {r.unit}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}
