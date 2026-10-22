import { useEffect, useRef, useState } from 'react'
import { GUIDE } from '../features/health/ranges'
import { formatLabValue, plainDate, providerName } from '../lib/labFormat'
import { testLabel, useHealthData } from '../features/records/useHealthData'
import { useConfirmedDocs, useConfirmedMedicines, useQueue } from '../features/records/useRecordsServer'
import { ConfirmFlow, firstName, KIND } from '../features/records/ConfirmSheet'
import { RecordDetail } from '../features/records/RecordDetail'
import { PersonChips } from '../features/records/PersonChips'
import { MedicineLines } from '../features/records/MedicineLines'
import { useScanProgress } from '../features/scan/useScanProgress'

/** Test picker: a button that opens a short list of 48px choices (the native select looked unstyled and tiny on a phone). */
function TestPicker({ tests, picked, onPick }: { tests: string[]; picked: string; onPick(t: string): void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const out = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', k)
    document.addEventListener('mousedown', out)
    root.current?.querySelector<HTMLElement>('.tp-opt[aria-pressed="true"], .tp-opt')?.focus() // move focus into the list
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('mousedown', out) }
  }, [open])
  return (
    <div className="tp" ref={root}>
      <button type="button" className="tp-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tp-k">Test</span>
        <span className="tp-v">{testLabel(picked, GUIDE)}</span>
        <span className="tp-chev" aria-hidden="true" data-open={open} />
      </button>
      {open && (
        <div className="tp-list" role="group" aria-label="Choose a test">
          {tests.map((t) => (
            <button key={t} type="button" aria-pressed={t === picked} className="tp-opt" onClick={() => { onPick(t); setOpen(false) }}>
              {testLabel(t, GUIDE)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Only a repeat of the same document id collapses; two distinct confirmed documents always stay openable. */
export const dedupeDocs = <T extends { doc: { id: string } }>(docs: T[]): T[] => {
  const seen = new Set<string>()
  return docs.filter((x) => { if (seen.has(x.doc.id)) return false; seen.add(x.doc.id); return true })
}

export default function Records() {
  const { ready, people, member, ownId, personId, setPersonId, readings, consults, reload } = useHealthData()
  const queue = useQueue()
  const [ver, setVer] = useState(0)
  const docs = useConfirmedDocs(personId, ver)
  const medicines = useConfirmedMedicines(personId, ver)
  const toCheck = queue.byPerson[personId] ?? 0 // ponytail: rows of a person missing from the local people list have no chip; add when sync can leave that gap
  const { uploading, reading } = useScanProgress(personId, ver)
  const [sheet, setSheet] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [test, setTest] = useState('')
  const tests = [...new Set(readings.map((r) => r.test))].sort()
  const count = (t: string) => readings.filter((r) => r.test === t).length
  const picked = test && tests.includes(test) ? test : ([...tests].sort((a, b) => count(b) - count(a))[0] ?? '') // default: the test with the most results, so the trend is a line
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
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={queue.byPerson} onPick={setPersonId} />
      {queue.error && member?.role === 'admin' && (
        <div className="grp">
          <div className="row">
            <span className="grow">Could not load records to check. Try again.</span>
            <button type="button" className="btn2" onClick={queue.refresh}>Try again</button>
          </div>
        </div>
      )}
      {uploading + reading > 0 && (
        <div className="grp">
          <div className="row" role="status" data-testid="scan-progress">
            <span className="grow">
              {[uploading > 0 && `Uploading ${uploading}`, reading > 0 && `Reading ${reading}`].filter(Boolean).join(' · ')}
              <span className="sub">Scanned papers. They show up under To check when they are ready.</span>
            </span>
          </div>
        </div>
      )}
      {toCheck > 0 && (
        <div className="grp">
          <button className="row" onClick={() => setSheet(true)}>
            <span className="grow">
              <span aria-hidden="true">To check</span>
              <span className="rx-sr">To check ({toCheck})</span>
              <span className="sub">{toCheck === 1 ? '1 imported result is' : `${toCheck} imported results are`} waiting for you. Open one file, check it, and confirm all of it at once.</span>
            </span>
            <span className="rx-count" aria-hidden="true">{toCheck}</span>
            <span className="chev" aria-hidden="true">&rsaquo;</span>
          </button>
        </div>
      )}
      {sheet && <ConfirmFlow people={people} personId={personId} checkedDocs={docs.length} onClose={() => setSheet(false)} onChanged={changed} />}
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
              <TestPicker tests={tests} picked={picked} onPick={setTest} />
              {series.length > 0 && <p className="sub" style={{ margin: '8px 0 0' }}>{series.length === 1 ? '1 result' : `Last ${series.length} results`}</p>}
              {series.length < 2 && <p className="sub">Add one more result to see a trend line.</p>}
              <div ref={box} role="img" aria-label={`Trend of ${testLabel(picked, GUIDE)} over time`} style={{ overflow: 'hidden', minHeight: 150 }} />
            </div>
          </section>
          <section aria-labelledby="tl">
            <h2 className="hd" id="tl">Timeline</h2>
            <div className="grp" data-testid="timeline">
              {dates.map((d) => (
                <div className="row" key={d} style={{ alignItems: 'flex-start' }}>
                  <span className="sub" style={{ width: 104, flex: 'none' }}>{plainDate(d)}</span>
                  <span className="grow">
                    {day(d).consults.map((c) => (
                      <span key={`c${c.id}`}>
                        Doctor visit{c.doctor ? `: ${providerName(c.doctor)}` : ''}
                        {c.reason && <span className="sub" style={{ display: 'block' }}>{c.reason}</span>}
                      </span>
                    ))}
                    {dedupeDocs(day(d).docs).map((x) => (
                      <button key={x.doc.id} className="rx-btn" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setDetailId(x.doc.id)}>
                        {KIND[x.doc.kind] ?? 'Document'}{x.doc.facility ? `, ${providerName(x.doc.facility)}` : ''}
                      </button>
                    ))}
                    {day(d).tests.map((r) => (
                      <span key={`r${r.id}`}>
                        {testLabel(r.test, GUIDE)}: {formatLabValue(r.value, r.unit)}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {medicines && medicines.length > 0 && (
        <section aria-labelledby="rxm">
          <h2 className="hd" id="rxm">Medicines from prescriptions</h2>
          <MedicineLines items={medicines} />
        </section>
      )}
    </>
  )
}
