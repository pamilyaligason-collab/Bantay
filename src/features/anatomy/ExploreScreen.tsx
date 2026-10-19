import { useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../docs/useDialog'
import content from './content.json'
import { SHAPES, VIEW } from './shapes'
import { HALF, MIRROR, Silhouette } from './Silhouette'
import './anatomy.css'

export interface Part { id: string; system: string; name: string; what: string; illnesses: string[]; warnings: string[]; prevention: string[] }
const PARTS = content.parts as Part[]

function PartShape({ part, onOpen }: { part: Part; onOpen: (p: Part) => void }) {
  const s = SHAPES[part.id]!
  const skin = part.id === 'skinorgan'
  const draw = (flip: boolean) => (
    <g key={flip ? 'm' : 'r'} transform={flip ? MIRROR : undefined}>
      {skin && <path d={HALF} className="an-fill" />}
      {s.fill?.map((d, i) => <path key={i} d={d} className="an-fill" />)}
      {s.line?.map((d, i) => <path key={'l' + i} d={d} className="an-line" strokeWidth={s.w ?? 2} strokeDasharray={s.dash} />)}
    </g>
  )
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(part) } }
  return (
    <g className="an-part" role="button" tabIndex={0} aria-label={part.name} data-part={part.id} onClick={() => onOpen(part)} onKeyDown={key}>
      {draw(false)}
      {s.sym && draw(true)}
      {skin && <path d={HALF} className="an-hit" />}
      {skin && <path d={HALF} className="an-hit" transform={MIRROR} />}
      {s.hits.flatMap(([x, y]) => (s.sym ? [[x, y], [100 - x, y]] : [[x, y]])).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" className="an-hit" />)}
    </g>
  )
}

function PartSheet({ part, onClose }: { part: Part; onClose: () => void }) {
  const { ref, onKeyDown } = useDialog(onClose)
  const sys = content.systems.find((s) => s.id === part.system)!
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
  const [sysId, setSysId] = useState(content.systems[0]!.id)
  const [open, setOpen] = useState<Part | null>(null)
  const parts = PARTS.filter((p) => p.system === sysId)
  const [y0, h] = VIEW[sysId]!
  return (
    <>
      <div className="hv-top">
        <a className="hv-back" href="#health" aria-label="Back to Health">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        <div className="hdr">
          <h1 className="an-h1">Explore your body</h1>
          <span>Pick a system, then tap a part</span>
        </div>
      </div>
      <div className="an-chips" role="group" aria-label="Body systems">
        {content.systems.map((s) => (
          <button key={s.id} type="button" className="an-chip" aria-pressed={s.id === sysId} onClick={() => setSysId(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="an-stage" data-sys={sysId}>
        <svg className={h < 300 ? 'an-svg an-crop' : 'an-svg'} viewBox={`0 ${y0} 100 ${h}`} style={{ width: `min(100%, 300px, calc(60vh * ${100 / h}))` }} role="group" aria-label={`${content.systems.find((s) => s.id === sysId)!.label}, tap a part`}>
          <Silhouette />
          {parts.map((p) => <PartShape key={p.id} part={p} onOpen={setOpen} />)}
        </svg>
      </div>
      <h2 className="an-h2">Parts you can open</h2>
      <div className="grp an-list">
        {parts.map((p) => (
          <button key={p.id} type="button" className="an-row" onClick={() => setOpen(p)}>{p.name}</button>
        ))}
      </div>
      <p className="an-note">{content.credits}</p>
      <p className="an-note">{content.disclaimer}</p>
      {open && <PartSheet part={open} onClose={() => setOpen(null)} />}
    </>
  )
}
