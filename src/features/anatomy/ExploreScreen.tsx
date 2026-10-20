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
import { Icon, type IconName } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import './anatomy.css'

export interface Part { id: string; system: string; name: string; what: string; illnesses: string[]; warnings: string[]; prevention: string[] }
const PARTS = content.parts as Part[]
const SYSTEMS = content.systems
const NONE: SystemCount = { total: 0, flagged: 0, ok: 0 }

// Rail glyph per body system: Tabler where one exists, hand-drawn kidney and stomach, else the nearest plain icon.
const RAIL: Record<string, IconName> = { skeleton: 'cross', muscles: 'walk', heart: 'heart', lungs: 'lungs', brain: 'brain', digestion: 'stomach', kidneys: 'kidney', skin: 'drop', hormones: 'flask' }

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
      <SubHeader title="Explore your body" backHref="#health" backLabel="Back to Health" />
      <p className="sub an-hint">Pick a system, then tap a dot</p>
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
                <Icon name={RAIL[s.id] ?? 'heart'} size={24} tone="vitals" />
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
          <button key={p.id} type="button" className="an-row" onClick={() => setOpen(p)}>{p.name}<Icon name="chev" size={20} /></button>
        ))}
      </div>
      <p className="an-note">{content.credits}</p>
      <p className="an-note">{content.art}</p>
      <p className="an-note">{content.disclaimer}</p>
      {open && <PartSheet part={open} onClose={() => setOpen(null)} />}
    </>
  )
}
