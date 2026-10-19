import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../docs/useDialog'
import content from './content.json'
import { HITS, OWN_BODY, SPRITE, VIEW } from './shapes'
import './anatomy.css'

export interface Part { id: string; system: string; name: string; what: string; illnesses: string[]; warnings: string[]; prevention: string[] }
const PARTS = content.parts as Part[]
const SYSTEMS = content.systems

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
  const chips = useRef<HTMLDivElement>(null)
  const parts = PARTS.filter((p) => p.system === sysId)
  const [vx, vy, vw, vh] = VIEW[sysId]!
  const label = SYSTEMS.find((s) => s.id === sysId)!.label

  // Keep the chosen chip in view inside the scroll row.
  useEffect(() => {
    chips.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [sysId])

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
      <div className="an-chips" role="group" aria-label="Body systems" ref={chips}>
        {SYSTEMS.map((s) => (
          <button key={s.id} type="button" className="an-chip" aria-pressed={s.id === sysId} onClick={() => setSysId(s.id)}>{s.label}</button>
        ))}
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
