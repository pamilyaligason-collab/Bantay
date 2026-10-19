import { useId } from 'react'
import { Silhouette } from '../anatomy/Silhouette'
import { hotspotTone, mapHeadline } from '../anatomy/status'
import '../anatomy/anatomy.css'
import type { NodeId, NodeView } from './model'

// Which side and body row each node sits on: head, heart, belly, hips, legs (D-38).
const PLACE: Record<NodeId, { side: 'l' | 'r'; row: 1 | 2 | 3 | 4 | 5 }> = {
  sleep: { side: 'l', row: 1 }, mood: { side: 'r', row: 1 },
  bp: { side: 'l', row: 2 }, pulse: { side: 'r', row: 2 },
  sugar: { side: 'r', row: 3 }, weight: { side: 'l', row: 4 }, steps: { side: 'r', row: 5 }
}
// Row centres in figure units. Rows are 66px tall with a 4px gap, and the figure box starts 18 units above the head.
const ROW_Y = [15, 85, 155, 225, 295]
const VIEW_BOX = '0 -18 100 346'
// Where each dot sits on the body (head, heart, belly, hips, legs).
const AT: Record<NodeId, [number, number]> = { sleep: [44, 18], mood: [56, 18], bp: [43, 74], pulse: [57, 78], sugar: [58, 112], weight: [41, 148], steps: [61, 255] }
const WHERE: Record<NodeId, string> = { sleep: 'head', mood: 'head', bp: 'heart', pulse: 'heart', sugar: 'belly', weight: 'hips', steps: 'legs' }
// Faint organs seen through the frosted body, so each glow sits on the part it belongs to.
const ORGANS = [
  'M50 8C58 8 60 14 59 20C58 25 54 27 50 27C46 27 42 25 41 20C40 14 42 8 50 8Z', // brain
  'M46 62C41 62 36 68 35 80C34 90 36 97 41 97C45 97 47 93 47 86L47 68Z M54 62C59 62 64 68 65 80C66 90 64 97 59 97C55 97 53 93 53 86L53 68Z', // lungs
  'M52 74C52 70 58 69 60 73C62 69 69 70 68 76C67 82 61 87 60 90C57 87 52 80 52 74Z', // heart
  'M50 104C58 102 66 106 66 114C66 122 58 126 52 124C46 122 43 108 50 104Z', // stomach and liver
  'M40 144C44 140 56 140 60 144C62 150 56 156 50 156C44 156 38 150 40 144Z', // hips
  'M44 186L42 280M56 186L58 280' // leg bones
]

/** Frosted front-view figure with the organs inside, a glow where a result needs a look, and seven metric buttons tied to body points. */
export function BodyMap({ nodes, cta }: { nodes: NodeView[]; cta?: { href: string; label: string } }) {
  const uid = 'bm' + useId().replace(/\W/g, '')
  const blank = nodes.every((n) => n.empty)
  if (blank) {
    return (
      <div className="hv-map-empty" data-testid="health-empty">
        <svg className="hv-fig" viewBox={VIEW_BOX} aria-hidden="true" focusable="false"><Silhouette /></svg>
        {cta ? <a className="hv-cta" href={cta.href}>{cta.label}</a> : <p className="hv-map-note">No vitals yet. Lab results are listed below.</p>}
      </div>
    )
  }
  const headline = mapHeadline(nodes)
  const flagged = nodes.some((n) => hotspotTone(n.state, n.empty) === 'warn')
  return (
    <div className="hv-map-wrap">
      <p className="hv-map-h" data-tone={flagged ? 'warn' : 'ok'} data-testid="map-headline">{headline}</p>
      <div className="hv-map" role="group" aria-label={`Your latest numbers on a body map. ${headline}.`}>
        <svg className="hv-fig hv-frost" viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
          <defs>
            {(['ok', 'warn'] as const).map((t) => (
              <radialGradient key={t} id={`${uid}-${t}`}>
                <stop offset="0" stopColor={t === 'ok' ? 'var(--ok)' : 'var(--amber)'} stopOpacity="1" />
                <stop offset="0.45" stopColor={t === 'ok' ? 'var(--ok)' : 'var(--amber)'} stopOpacity="0.5" />
                <stop offset="1" stopColor={t === 'ok' ? 'var(--ok)' : 'var(--amber)'} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          <Silhouette />
          <path className="hv-organs" d={ORGANS.join(' ')} />
          {nodes.map((n) => {
            const p = PLACE[n.id]
            const [x, y] = AT[n.id]
            const ry = ROW_Y[p.row - 1]!
            const tone = hotspotTone(n.state, n.empty)
            return (
              <g key={n.id} data-tone={tone}>
                <line x1={x} y1={y} x2={p.side === 'l' ? 0 : 100} y2={ry} className={`hv-wire ${tone}`} />
                {tone !== 'none' && <circle className={`hv-glow ${tone}`} cx={x} cy={y} r="18" fill={`url(#${uid}-${tone})`} />}
                <circle className={`hv-pt ${tone}`} cx={x} cy={y} r="4.5" />
              </g>
            )
          })}
        </svg>
        {nodes.map((n) => {
          const p = PLACE[n.id]
          return (
            <a
              key={n.id}
              className={`hv-node ${p.side} ${n.state}${n.empty ? ' empty' : ''}`}
              style={{ gridRow: p.row }}
              href={`#health/metric/${n.code}`}
              data-node={n.id}
            >
              <span className="hv-nl">{n.label}</span>{' '}
              <strong className="hv-nv">{n.value}</strong>{' '}
              <span className="hv-nn">{n.note}</span>{' '}
              <span className="hv-sr">{`. ${WHERE[n.id]} point, open details`}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
