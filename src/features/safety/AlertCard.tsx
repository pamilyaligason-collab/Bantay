import { type Alert, diffBulletin, hazardOf, HOME, NOT_A_SIREN } from './alerts'
import Lazy from './Lazy'
import { Frame, ventuskyUrl } from './MapsPanel'
import { CARDS, Poster } from './Practice'
import './safety.css'

const NO_MAP = new Set<Alert['kind']>(['quake', 'tsunami', 'volcano', 'air'])

/** Plain words for an alert whose source could not be reached. Unknown time is said as unknown. */
export function staleText(checkedAt: string | null | undefined): string {
  const t = checkedAt ? new Date(checkedAt) : null
  if (!t || Number.isNaN(t.getTime())) return 'Source unreachable. This is the last information we have.'
  return `Last checked ${t.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}; source unreachable.`
}

export default function AlertCard({ alert: a }: { alert: Alert }) {
  const diff = diffBulletin(a.previousBulletin, a.bulletin)
  const card = CARDS.find((c) => c.id === hazardOf(a.kind))
  const centre = a.lat != null && a.lon != null ? { lat: a.lat, lon: a.lon } : HOME
  return (
    <article className="sf" aria-label={a.title}>
      <div className="sf-chips">
        {a.level && <span className="sf-chip warn">! {a.level}</span>}
        <span className="sf-chip">{a.source}</span>
      </div>
      {a.stale && <p className="sf-note" role="status">{staleText(a.checkedAt)}</p>}
      <div className="grp">
        <div className="row sf-lbl"><span className="sub">What</span><span>{a.what}</span></div>
        <div className="row sf-lbl"><span className="sub">Where</span><span>{a.where}</span></div>
        <div className="row sf-lbl"><span className="sub">When</span><span>{a.when}</span></div>
      </div>
      <div className="sf-now"><b>Do this now</b><span>{a.doNow}</span></div>
      {(a.kind === 'quake' || a.kind === 'tsunami') && <p className="sf-note">{NOT_A_SIREN}</p>}
      <details>
        <summary>More detail</summary>
        {!NO_MAP.has(a.kind) && (
          <Lazy summary="Weather map"><Frame title={`Weather map around ${a.title}`} src={ventuskyUrl(centre, a.kind === 'tcws' ? 'wind-10m' : 'rain-3h')} /></Lazy>
        )}
        {a.timeline?.length ? (
          <div>
            <h3>Timeline</h3>
            <ol>{a.timeline.map((t) => <li key={t.at + t.text}><strong>{t.at}</strong> {t.text}</li>)}</ol>
          </div>
        ) : null}
        <div>
          <h3>Official bulletin</h3>
          <pre>{a.bulletin}</pre>
          {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Open the official page</a>}
        </div>
        <div>
          <h3>What changed since the last update</h3>
          {diff === null ? <p className="sub">This is the first version, so there is nothing to compare yet.</p> : (
            <ul>
              {diff.added.map((t) => <li key={'a' + t}><strong>Added:</strong> {t}</li>)}
              {diff.removed.map((t) => <li key={'r' + t}><strong>Removed:</strong> {t}</li>)}
              {!diff.added.length && !diff.removed.length && <li>No change in the wording.</li>}
            </ul>
          )}
        </div>
        {a.checklist?.length ? (
          <div>
            <h3>Checklist</h3>
            <ul>{a.checklist.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        ) : null}
        {card && <Poster card={card} />}
      </details>
    </article>
  )
}
