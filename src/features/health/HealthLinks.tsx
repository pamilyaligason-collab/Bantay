import { useEffect, useState } from 'react'
import { listDrafts } from '../records/api'
import { papersLine, progressPct } from '../records/papers'
import { useConfirmedDocs } from '../records/useRecordsServer'
import { Icon, type IconName } from '../shell/Icon'
import { prefersReducedMotion } from '../look/useReducedMotion'
import { videosAvailable } from './library/videosLogic'
import { useMedications } from './useMedications'
import { useVisits } from './useVisits'
import { refillLine, stockRows } from './stock'
import { nextVisitLine } from './visitsLogic'
import './health.css'
import './m7a.css' // .hl-ring

type Tile = { key: string; icon: IconName; label: string; sub: string; href?: string; to?: string; pct?: number }

function Door({ t }: { t: Tile }) {
  const body = (
    <>
      <Icon name={t.icon} tone="vitals" boxed />
      <span className="hb-l">{t.label}</span>
      <span className="hb-s">{t.sub}</span>
      {t.pct !== undefined && <span className="hl-ring" role="img" aria-label={`${t.pct} percent checked`} style={{ ['--p' as string]: `${t.pct}%` }} />}
    </>
  )
  if (t.href) return <a className="hb-tile press" href={t.href} data-browse={t.key}>{body}</a>
  // Readings and Labs have no route of their own: they scroll to their section above.
  const go = () => document.getElementById(t.to ?? '')?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  return <button type="button" className="hb-tile press" data-browse={t.key} onClick={go}>{body}</button>
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

/** Browse: the one grid of doors from the Health overview to the rest of the tab (Apple Health pattern: Summary above, Browse below).
 *  `jump` says which in-page sections exist, so Readings and Labs are only offered when there is something to scroll to. */
export function HealthLinks({ personId, jump }: { personId: string; jump: { readings: boolean; labs: boolean } }) {
  const meds = useMedications(personId)
  const visits = useVisits(personId)
  const papers = usePapers(personId)
  const low = stockRows(meds, personId, new Date())[0]
  const visit = nextVisitLine(visits)
  const tiles: Tile[] = [
    { key: 'body', icon: 'lungs', label: 'Body', sub: 'How each part works', href: '#health/body' },
    { key: 'meds', icon: 'pill', label: 'Medicines', sub: 'Doses and your list', href: '#health/meds' },
    { key: 'refill', icon: 'clock', label: 'Refills', sub: low ? `${low.name}: ${refillLine(low.days, low.by)}` : 'Days of medicine left', href: '#health/refill' },
    ...(jump.readings ? [{ key: 'readings', icon: 'gauge', label: 'Readings', sub: 'Blood pressure, sugar, weight', to: 'lvn-vitals' } as Tile] : []),
    ...(jump.labs ? [{ key: 'labs', icon: 'flask', label: 'Labs', sub: 'Your lab results', to: 'lvn-labs' } as Tile] : []),
    { key: 'move', icon: 'move', label: 'Move', sub: 'Gentle exercise picks', href: '#health/move' },
    { key: 'food', icon: 'meal', label: 'Food', sub: 'Meals, salt and nutrients', href: '#health/nutrition' },
    { key: 'papers', icon: 'file', label: 'Papers', sub: papersLine(papers.checked, papers.total), href: '#health/papers', pct: papers.total > 0 ? progressPct(papers.checked, papers.total) : undefined },
    { key: 'visits', icon: 'calendar', label: 'Visits', sub: visit ? `${visit.text} · ${visit.sub}` : 'Next visit and what to bring', href: '#health/visits' },
    { key: 'library', icon: 'cross', label: 'Library', sub: 'Plain health summaries', href: '#health/library' },
    ...(videosAvailable() ? [{ key: 'videos', icon: 'play', label: 'Videos', sub: 'Short and checked', href: '#health/videos' } as Tile] : [])
  ]
  return (
    <section aria-labelledby="hb-h" data-testid="browse">
      <h2 className="hd" id="hb-h">Browse</h2>
      <div className="hb-grid">{tiles.map((t) => <Door key={t.key} t={t} />)}</div>
    </section>
  )
}
