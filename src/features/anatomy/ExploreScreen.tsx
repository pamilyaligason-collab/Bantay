import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../docs/useDialog'
import { latestByTest } from '../health/ranges'
import { useHealthData } from '../records/useHealthData'
import { useMedications } from '../health/useMedications'
import { articleHref } from '../health/library/medline'
import { DRUG_NUDGE_NOTE, medicinesActingHere, SYSTEM_INFO, yourNumbers } from './systemInfo'
import content from './content.json'
import { FOCUS, HITS, OWN_BODY, SPRITE, VIEW } from './shapes'
import { systemCounts, systemStatus, type SystemCount } from './status'
import './anatomy.css'

export interface Part { id: string; system: string; name: string; what: string; illnesses: string[]; warnings: string[]; prevention: string[] }
const PARTS = content.parts as Part[]
const SYSTEMS = content.systems
const NONE: SystemCount = { total: 0, flagged: 0, ok: 0 }

// One simple 24px glyph per system for the round rail buttons.
const ICON: Record<string, string> = {
  skeleton: 'M12 4v16M8 7c-2 1-3 2-3 3M16 7c2 1 3 2 3 3M7 11c-2 1-2 2-2 3M17 11c2 1 2 2 2 3M8 15c-1 .5-2 1.5-2 2.5M16 15c1 .5 2 1.5 2 2.5',
  muscles: 'M6 9v6M9 7v10M9 12h6M15 7v10M18 9v6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  lungs: 'M12 3v8M10 6v6c0 3-2 6-5 6-1.5 0-2-1-2-2 0-3 2-8 4-10M14 6v6c0 3 2 6 5 6 1.5 0 2-1 2-2 0-3-2-8-4-10',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 4 3 3 0 0 0 2 4 3 3 0 0 0 3 4V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 4 3 3 0 0 1-2 4 3 3 0 0 1-3 4V4z',
  digestion: 'M8 4v4c0 3-3 4-3 8a4 4 0 0 0 4 4c5 0 9-3 9-8 0-3-2-4-4-4-2 0-3-1-3-3V4',
  kidneys: 'M14 4c-4 0-7 4-7 8s3 8 7 8c2 0 3-1 3-3 0-1.5-1-2-1-3.5S17 11 17 9.5 16 4 14 4z',
  skin: 'M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z',
  hormones: 'M10 11l4 2M5 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 15a3 3 0 1 0 6 0 3 3 0 1 0-6 0'
}

function PartSheet({ part, onClose }: { part: Part; onClose: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose)
  const sys = SYSTEMS.find((s) => s.id === part.system)!
  const list = (title: string, items: string[]) => (
    <section className="an-sec">
      <h3>{title}</h3>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </section>
  )
  return createPortal(
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet an-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={part.name} onKeyDown={onKeyDown}>
        <div className="grab" />
        <div className="an-sheet-h"><h2>{part.name}</h2><button type="button" className="an-x" onClick={onClose} data-autofocus>Close</button></div>
        <section className="an-sec">
          <h3>What it does</h3>
          <p>{part.what}</p>
        </section>
        {list('Common illnesses in the Philippines', part.illnesses)}
        {list('Get help right away if you notice', part.warnings)}
        {list('How to look after it', part.prevention)}
        <p className="an-src">
          Source: <a href={sys.url} target="_blank" rel="noopener noreferrer">{content.source.name}</a>
        </p>
        <p className="an-note">{content.disclaimer}</p>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

/** #health/body: a layered 2D body. Pick a system, tap a part (on the body or in the list) for a plain-English sheet. */
export default function ExploreScreen() {
  const [sysId, setSysId] = useState(SYSTEMS[0]!.id)
  const [open, setOpen] = useState<Part | null>(null)
  const { readings, thresholds, personId } = useHealthData()
  const counts = systemCounts(latestByTest(readings), (r) => thresholds.find((t) => t.key === `${personId}:${r.test}`))
  const meds = useMedications(personId)
  const info = SYSTEM_INFO[sysId]
  const nums = yourNumbers(sysId, latestByTest(readings))
  const acting = medicinesActingHere(meds, sysId)
  const parts = PARTS.filter((p) => p.system === sysId)
  const [vx, vy, vw, vh] = VIEW[sysId]!
  const label = SYSTEMS.find((s) => s.id === sysId)!.label
  const here = counts[sysId] ?? NONE
  const status = systemStatus(here)
  const [fx, fy] = FOCUS[sysId]!

  return (
    <>
      <div className="hv-top">
        <a className="hv-back" href="#health" aria-label="Back to Health">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        <div className="hdr">
          <h1 className="an-h1">Explore your body</h1>
          <span>Pick a system, then tap a dot</span>
        </div>
      </div>
      <div className="an-top">
        <h2 className="an-sys">{label}</h2>
        {status && <span className="an-pill" data-tone={status.tone} data-testid="sys-status">{status.text}</span>}
      </div>
      {info && (
        <section className="card an-info" aria-label={`About ${label}`} data-testid="system-info">
          <p className="an-what">{info.what[0]}<br />{info.what[1]}</p>
          {(nums || info.metric) && (
            <p className="an-line"><b>Your numbers</b>{' '}
              {nums ? <a href={`#health/metric/${nums.code}`}>{nums.text}</a> : info.metric ? <a href={`#health/metric/${info.metric}`}>Open the chart</a> : null}
            </p>
          )}
          {acting.length > 0 && (
            <div className="an-line" data-testid="acting-here">
              <b>Medicines that act here</b>
              <ul>{acting.map((a) => <li key={a.name}>{a.name}: {a.effect}</li>)}</ul>
              <small className="an-note">{DRUG_NUDGE_NOTE}</small>
            </div>
          )}
          <p className="an-line"><a href={articleHref(info.learnKind, info.learn)}>Learn more: {info.learn}</a></p>
        </section>
      )}
      <div className="an-main">
        <div className="an-rail" role="group" aria-label="Body systems">
          {SYSTEMS.map((s) => {
            const c = counts[s.id] ?? NONE
            const n = c.flagged || c.total
            return (
              <button key={s.id} type="button" className="an-rb" aria-pressed={s.id === sysId} aria-label={s.label} onClick={() => setSysId(s.id)}>
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d={ICON[s.id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {n > 0 && <span className="an-badge" data-n={n} data-tone={c.flagged ? 'warn' : 'none'} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <div className="an-stage" data-sys={sysId}>
          <div className="an-fig" style={{ '--vw': vw, '--vh': vh, aspectRatio: `${vw} / ${vh}` } as CSSProperties}>
          <svg className={vh < 300 ? 'an-svg an-crop' : 'an-svg'} viewBox={`${vx} ${vy} ${vw} ${vh}`} role="group" aria-label={`${label}, tap a dot`}>
            <use href={`${SPRITE}#body`} className={OWN_BODY.has(sysId) ? 'an-shell an-off' : 'an-shell'} />
            {SYSTEMS.map((s) => (
              <g key={s.id} className="an-layer" data-l={s.id} data-on={s.id === sysId}>
                <use href={`${SPRITE}#${s.id}`} />
              </g>
            ))}
          </svg>
          {here.flagged + here.ok > 0 && (
            <span className="an-glow" data-tone={here.flagged ? 'warn' : 'ok'} aria-hidden="true" style={{ left: `${((fx - vx) / vw) * 100}%`, top: `${((fy - vy) / vh) * 100}%` }} />
          )}
          {parts.flatMap((p) => HITS[p.id]!.map(([x, y], i) => (
            <button
              key={p.id + i}
              type="button"
              className="an-hit"
              data-part={p.id}
              aria-label={i === 0 ? p.name : undefined}
              aria-hidden={i === 0 ? undefined : true}
              tabIndex={i === 0 ? 0 : -1}
              style={{ left: `${((x - vx) / vw) * 100}%`, top: `${((y - vy) / vh) * 100}%` }}
              onClick={() => setOpen(p)}
            />
          )))}
          </div>
        </div>
      </div>
      <h2 className="an-h2">Parts you can open</h2>
      <div className="grp an-list">
        {parts.map((p) => (
          <button key={p.id} type="button" className="an-row" onClick={() => setOpen(p)}>{p.name}</button>
        ))}
      </div>
      <p className="an-note">{content.credits}</p>
      <p className="an-note">{content.art}</p>
      <p className="an-note">{content.disclaimer}</p>
      {open && <PartSheet part={open} onClose={() => setOpen(null)} />}
    </>
  )
}
