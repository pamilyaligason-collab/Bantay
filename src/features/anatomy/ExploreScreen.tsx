import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../docs/useDialog'
import { pickAttention } from '../health/attention'
import { metricLabel } from '../health/model'
import { latestByTest, type Range, type Reading } from '../health/ranges'
import { useHealthData } from '../records/useHealthData'
import { useMedications } from '../health/useMedications'
import { articleHref } from '../health/library/medline'
import { DRUG_NUDGE_NOTE, medicinesActingHere, SYSTEM_INFO, yourNumbers } from './systemInfo'
import content from './content.json'
import { FOCUS, HITS, OWN_BODY, SPRITE, VIEW } from './shapes'
import { systemCounts, systemOf, systemStatus, type SystemCount } from './status'
import { MoreGrid, GroupedList, LargeTitle, Row, Section } from '../look'
import { Call911, useAbroad } from '../safety/Call911'
import { Icon } from '../shell/Icon'
import careJson from './systemCare.json'
import './anatomy.css'
import './bodywiki.css'
import './bodywiki2.css'

export interface Part { id: string; system: string; name: string; what: string; illnesses: string[]; warnings: string[]; prevention: string[] }
const PARTS = content.parts as Part[]
const SYSTEMS = content.systems
const SYSTEM_CARE = careJson as { checked: string; reportedNote: string; systems: Record<string, SystemCare> }
export interface SystemCare { illnesses: string[]; emergency: string[]; doctor: string[]; prevention: string[]; reported?: string[]; sources: { name: string; url: string }[] }
const NONE: SystemCount = { total: 0, flagged: 0, ok: 0 }

/** The call-out on the figure: the result the Health hero leads with, when it is out of range and belongs to a body system. Same pick, same label. */
export function calloutOf(readings: Reading[], familyOf: (r: Reading) => Range | undefined): { sys: string; text: string } | null {
  const a = pickAttention(latestByTest(readings), familyOf, new Date())
  const sys = a ? systemOf(a.reading.test) : null
  if (!a || !sys || (a.row.pos !== 'above' && a.row.pos !== 'below')) return null
  return { sys, text: `${metricLabel(a.reading.test)} ${a.row.pos === 'above' ? 'high' : 'low'}` }
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
  const abroad = useAbroad()
  const [sysId, setSysId] = useState(SYSTEMS[0]!.id)
  const [open, setOpen] = useState<Part | null>(null)
  const { readings, thresholds, personId } = useHealthData()
  const counts = systemCounts(latestByTest(readings), (r) => thresholds.find((t) => t.key === `${personId}:${r.test}`))
  const meds = useMedications(personId)
  const info = SYSTEM_INFO[sysId]
  const care = SYSTEM_CARE.systems[sysId]
  const nums = yourNumbers(sysId, latestByTest(readings))
  const acting = medicinesActingHere(meds, sysId)
  const parts = PARTS.filter((p) => p.system === sysId)
  const [vx, vy, vw, vh] = VIEW[sysId]!
  const label = SYSTEMS.find((s) => s.id === sysId)!.label
  const here = counts[sysId] ?? NONE
  const status = systemStatus(here)
  const [fx, fy] = FOCUS[sysId]!
  const call = calloutOf(readings, (r) => thresholds.find((t) => t.key === `${personId}:${r.test}`))

  return (
    <>
      <LargeTitle back={{ href: '#health', label: 'Health' }} title="Body wiki" actions={<span className="an-src-tag">MEDLINEPLUS</span>} />
      <p className="sub an-hint">Tap a spot to learn how that part works.</p>
      <div className="an-main" data-hero>
        <div className="an-stage" data-sys={sysId}>
          {call && <button type="button" className="an-callout" data-testid="an-callout" onClick={() => setSysId(call.sys)}>{call.text}</button>}
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
          {status && <span className="an-pill" data-tone={status.tone} data-testid="sys-status">{status.text}</span>}
        </div>
      </div>
      <Section title="Body systems" meta={String(SYSTEMS.length)}>
        <MoreGrid label="Body systems" testId="body-systems">
          {SYSTEMS.map((s) => {
            const c = counts[s.id] ?? NONE
            const n = c.flagged || c.total
            return (
              <button key={s.id} type="button" className="an-chip" aria-pressed={s.id === sysId} aria-label={s.label} onClick={() => setSysId(s.id)}>
                {s.label}
                {n > 0 && <span className="an-badge" data-n={n} data-tone={c.flagged ? 'warn' : 'none'} aria-hidden="true" />}
              </button>
            )
          })}
        </MoreGrid>
      </Section>
      {info && (
        <section className="card an-info" aria-label={`About ${label}`} data-testid="system-info" data-sys={sysId}>
          <div className="an-info-h"><span className="an-ic" aria-hidden="true" /><h2 className="an-sys">{label}</h2></div>
          <h3 className="an-lbl">What it does</h3>
          <p className="an-what">{info.what[0]} {info.what[1]}</p>
          <h3 className="an-lbl">Your numbers</h3>
          {nums ? (
            <a className="an-nums" href={`#health/metric/${nums.code}`} data-tone={here.flagged ? 'warn' : 'none'}>{nums.text}<Icon name="chev" size={16} /></a>
          ) : info.metric ? (
            <a className="an-nums" href={`#health/metric/${info.metric}`}>Open the chart<Icon name="chev" size={16} /></a>
          ) : <p className="an-none">No results for this part yet.</p>}
          <h3 className="an-lbl">Medicines that act here</h3>
          {acting.length > 0 ? (
            <div data-testid="acting-here">
              <ul className="an-bl">{acting.map((a) => <li key={a.name}><i />{a.name}: {a.effect}</li>)}</ul>
              <small className="an-note">{DRUG_NUDGE_NOTE}</small>
            </div>
          ) : <p className="an-none">None of yours</p>}
          {care && (
            <div data-testid="system-care">
              <h3 className="an-lbl">Common illnesses</h3>
              <ul className="an-bl" data-kind="ill">{care.illnesses.map((t) => <li key={t}><i />{t}</li>)}</ul>
              <h3 className="an-lbl an-red" data-testid="care-911">{abroad ? 'Get emergency help if:' : 'Get emergency help (911) if:'}</h3>
              <ul className="an-bl" data-kind="911">{care.emergency.map((t) => <li key={t}><i />{t}{care.reported?.includes(t) && <em className="an-rep">As reported</em>}</li>)}</ul>
              <Call911 className="btn an-call" testId="care-call-911" />
              <h3 className="an-lbl an-amber" data-testid="care-doctor">Call a doctor if</h3>
              <ul className="an-bl" data-kind="doctor">{care.doctor.map((t) => <li key={t}><i />{t}{care.reported?.includes(t) && <em className="an-rep">As reported</em>}</li>)}</ul>
              <h3 className="an-lbl">Prevention</h3>
              <ul className="an-bl" data-kind="prevent">{care.prevention.map((t) => <li key={t}><i />{t}{care.reported?.includes(t) && <em className="an-rep">As reported</em>}</li>)}</ul>
              <p className="an-note">{SYSTEM_CARE.checked} Not a diagnosis.</p>
              {care.reported && care.reported.length > 0 && <p className="an-note" data-testid="care-reported">{SYSTEM_CARE.reportedNote}</p>}
              <ul className="an-srcs" data-testid="care-sources">
                {care.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></li>)}
              </ul>
            </div>
          )}
          <p className="an-line"><a href={articleHref(info.learnKind, info.learn)}>Learn more: {info.learn}</a></p>
        </section>
      )}
      <Section title="Parts" meta={`${parts.length} of ${PARTS.length}`}>
        <GroupedList label="Parts you can open">
          {parts.map((p) => <Row key={p.id} title={p.name} onClick={() => setOpen(p)} />)}
        </GroupedList>
      </Section>
      <footer className="an-foot">
        <details className="an-credits">
          <summary>Picture credits</summary>
          <p className="an-note">{content.credits}</p>
          <p className="an-note">{content.art}</p>
        </details>
        <p className="an-note">{content.disclaimer}</p>
      </footer>
      {open && <PartSheet part={open} onClose={() => setOpen(null)} />}
    </>
  )
}
