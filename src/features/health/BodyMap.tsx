import type { NodeId, NodeView } from './model'

// Which side and body row each node sits on: head, heart, belly, hips, legs (D-38).
const PLACE: Record<NodeId, { side: 'l' | 'r'; row: 1 | 2 | 3 | 4 | 5 }> = {
  sleep: { side: 'l', row: 1 }, mood: { side: 'r', row: 1 },
  bp: { side: 'l', row: 2 }, pulse: { side: 'r', row: 2 },
  sugar: { side: 'r', row: 3 }, weight: { side: 'l', row: 4 }, steps: { side: 'r', row: 5 }
}
const ROW_Y = [31, 93, 155, 217, 279]
const DOT = { within: 'var(--ok)', above: 'var(--amber)', below: 'var(--amber)', none: 'var(--muted)' } as const
const WHERE: Record<NodeId, string> = { sleep: 'head', mood: 'head', bp: 'heart', pulse: 'heart', sugar: 'belly', weight: 'hips', steps: 'legs' }

/** Simple human figure with seven metric buttons tied to body points. Light inline SVG, no external art. */
export function BodyMap({ nodes }: { nodes: NodeView[] }) {
  return (
    <div className="hv-map" role="group" aria-label="Your latest numbers on a body map">
      <svg className="hv-fig" viewBox="0 0 100 310" aria-hidden="true" focusable="false">
        <g fill="var(--card2)" stroke="var(--line)" strokeWidth="1.5" strokeLinejoin="round">
          <circle cx="50" cy="31" r="18" />
          <rect x="43" y="46" width="14" height="14" rx="4" />
          <path d="M26 62q24-9 48 0l-2 100q-1 40-4 70H32q-3-30-4-70z" />
          <path d="M22 66l-9 100q-1 8 5 8t7-8l6-70z" />
          <path d="M78 66l9 100q1 8-5 8t-7-8l-6-70z" />
          <rect x="31" y="226" width="17" height="78" rx="8" />
          <rect x="52" y="226" width="17" height="78" rx="8" />
        </g>
        {nodes.map((n) => {
          const p = PLACE[n.id]
          const x = p.side === 'l' ? 38 : 62
          const y = ROW_Y[p.row - 1]!
          return (
            <g key={n.id}>
              <line x1={x} y1={y} x2={p.side === 'l' ? 0 : 100} y2={y} stroke="var(--line)" strokeWidth="1.5" strokeDasharray="2 3" />
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
