import { useEffect, useState } from 'react'
import { listDrafts } from '../records/api'
import { papersLine, progressPct } from '../records/papers'
import { useConfirmedDocs } from '../records/useRecordsServer'
import { useMedications } from './useMedications'
import { useVisits } from './useVisits'
import { refillLine, stockRows } from './stock'
import { nextVisitLine } from './visits'
import './m7a.css'

function Row({ href, title, sub, extra }: { href: string; title: string; sub?: string; extra?: React.ReactNode }) {
  return (
    <a className="row hl-row" href={href}>
      <span className="grow"><b>{title}</b>{sub && <span className="sub">{sub}</span>}</span>
      {extra}
      <span className="hl-go" aria-hidden="true">&rsaquo;</span>
    </a>
  )
}

/** Confirmed papers over all papers (confirmed + waiting to be checked). Offline or signed out: the confirmed copy on this phone, no waiting count. */
function usePapers(personId: string) {
  const confirmed = useConfirmedDocs(personId).length
  const [drafts, setDrafts] = useState(0)
  useEffect(() => {
    if (!personId) return
    let live = true
    void listDrafts(personId).then((r) => { if (live) setDrafts(r.ok ? r.data.filter((b) => b.doc.status === 'draft').length : 0) }).catch(() => undefined)
    return () => { live = false }
  }, [personId])
  return { checked: confirmed, total: confirmed + drafts }
}

/** Learn, Refills, Doctor visits and Papers: the doors from the Health overview to the rest of the tab. */
export function HealthLinks({ personId }: { personId: string }) {
  const meds = useMedications(personId)
  const visits = useVisits(personId)
  const papers = usePapers(personId)
  const low = stockRows(meds, personId, new Date())[0]
  const visit = nextVisitLine(visits)
  return (
    <>
      <section aria-labelledby="hl-learn">
        <h2 className="hd" id="hl-learn">Learn</h2>
        <div className="hl-learn">
          <a href="#health/library" className="hl-card"><b>Health library</b><span className="sub">Plain summaries</span></a>
          <a href="#health/videos" className="hl-card"><b>Videos</b><span className="sub">Short and checked</span></a>
          <a href="#health/body" className="hl-card"><b>Your body</b><span className="sub">How it works</span></a>
        </div>
      </section>
      <div className="grp hl-list">
        <Row href="#health/refill" title="Refills" sub={low ? `${low.name}: ${refillLine(low.days, low.by)}` : 'See how many days of medicine are left'} />
        <Row href="#health/visits" title="Doctor visits" sub={visit ? `${visit.text} · ${visit.sub}` : 'Next visit, what to bring, summary for the doctor'} />
        <Row
          href="#health/papers"
          title={`Papers · ${papersLine(papers.checked, papers.total)}`}
          sub="Lab results and prescriptions. Add one with a photo or PDF."
          extra={papers.total > 0 ? <span className="hl-ring" role="img" aria-label={`${progressPct(papers.checked, papers.total)} percent checked`} style={{ ['--p' as string]: `${progressPct(papers.checked, papers.total)}%` }} /> : null}
        />
      </div>
    </>
  )
}
