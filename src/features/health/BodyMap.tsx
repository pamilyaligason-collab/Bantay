import { Silhouette } from '../anatomy/Silhouette'
import '../anatomy/anatomy.css'
import type { NodeId, NodeView } from './model'

// Which side and body row each node sits on: head, heart, belly, hips, legs (D-38).
const PLACE: Record<NodeId, { side: 'l' | 'r'; row: 1 | 2 | 3 | 4 | 5 }> = {
  sleep: { side: 'l', row: 1 }, mood: { side: 'r', row: 1 },
  bp: { side: 'l', row: 2 }, pulse: { side: 'r', row: 2 },
  sugar: { side: 'r', row: 3 }, weight: { side: 'l', row: 4 }, steps: { side: 'r', row: 5 }
}
const ROW_Y = [31, 93, 155, 217, 279]
// Where each dot sits on the body (head, heart, belly, hips, legs).
const AT: Record<NodeId, [number, number]> = { sleep: [44, 18], mood: [56, 18], bp: [43, 74], pulse: [57, 78], sugar: [58, 112], weight: [41, 148], steps: [61, 255] }
const DOT = { within: 'var(--ok)', above: 'var(--amber)', below: 'var(--amber)', none: 'var(--muted)' } as const
const WHERE: Record<NodeId, string> = { sleep: 'head', mood: 'head', bp: 'heart', pulse: 'heart', sugar: 'belly', weight: 'hips', steps: 'legs' }

/** Soft front-view figure (anatomy Silhouette) with seven metric buttons tied to body points. */
export function BodyMap({ nodes, cta }: { nodes: NodeView[]; cta?: { href: string; label: string } }) {
  const blank = nodes.every((n) => n.empty)
  if (blank && cta) {
    return (
      <div className="hv-map-empty" data-testid="health-empty">
        <svg className="hv-fig" viewBox="0 0 100 310" aria-hidden="true" focusable="false"><Silhouette /></svg>
        <a className="hv-cta" href={cta.href}>{cta.label}</a>
      </div>
    )
  }
  return (
    <div className="hv-map" role="group" aria-label="Your latest numbers on a body map">
      <svg className="hv-fig" viewBox="0 0 100 310" aria-hidden="true" focusable="false">
        <Silhouette />
        {nodes.map((n) => {
          const p = PLACE[n.id]
          const [x, y] = AT[n.id]
          const ry = ROW_Y[p.row - 1]!
          return (
            <g key={n.id}>
              <line x1={x} y1={y} x2={p.side === 'l' ? 0 : 100} y2={ry} stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 3" />
              <circle cx={x} cy={y} r="5" fill={DOT[n.state]} stroke="var(--card)" strokeWidth="2" />
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
  )
}
