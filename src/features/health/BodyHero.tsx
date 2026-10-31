import { useId } from 'react'
import { Silhouette } from '../anatomy/Silhouette'
import { hotspotTone } from '../anatomy/status'
import '../anatomy/anatomy.css'
import type { CardAction } from '../look/cardParts'
import { SceneHero } from '../look/SceneHero'
import { AT, ORGANS, VIEW_BOX } from './BodyMap'
import type { NodeId, NodeView } from './model'
import './health.css'

const SHOWN: NodeId[] = ['bp', 'sugar', 'weight', 'pulse'] // the 2x2 averages; sleep, mood and steps are on Readings
const lock = 'You can see this person but not log for them.'

/** Health's scene hero (D-101, version B): the frosted figure with its organs, a glow on any result that needs a look, the 7 metric points, and the 7-day averages as links.
 *  `blank` = nobody has a reading yet: a faint figure with no glows, one line and the same two actions. `canLog` / `canEdit` gate + Reading and Scan (D-99 lock). */
export function BodyHero({ nodes, blank, canLog, canEdit, onAdd, lockReason = lock }: { nodes: NodeView[]; blank: boolean; canLog: boolean; canEdit: boolean; onAdd: () => void; lockReason?: string }) {
  const uid = 'bh' + useId().replace(/\W/g, '')
  const add: CardAction = canLog ? { label: '+ Reading', onClick: onAdd } : { label: '+ Reading', disabled: true, lockReason }
  const scan: CardAction = canEdit ? { label: 'Scan', href: '#scan' } : { label: 'Scan', disabled: true }
  const fig = (
    <div className="bh-scene">
      <svg className="hv-fig hv-frost bh-fig" viewBox={VIEW_BOX} focusable="false">
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
        {!blank && <path className="hv-organs" d={ORGANS.join(' ')} />}
        {!blank && nodes.map((n) => {
          const [x, y] = AT[n.id]
          const tone = hotspotTone(n.state, n.empty)
          return (
            <g key={n.id} data-tone={tone}>
              {tone !== 'none' && <circle className={`hv-glow ${tone}`} cx={x} cy={y} r={tone === 'warn' ? 30 : 18} fill={`url(#${uid}-${tone})`} opacity={tone === 'ok' ? 0.55 : undefined} />}
              <circle className={`hv-pt ${tone}`} cx={x} cy={y} r="5" />
            </g>
          )
        })}
      </svg>
    </div>
  )
  return (
    <div className={`bh${blank ? ' bh-blank' : ''}`}>
      <SceneHero
        compact
        testId="bodyhero"
        scene={fig}
        title={blank ? 'No readings yet' : <>Body <span className="bh-sub">7-day averages</span></>}
        body={blank ? <p className="bh-line">Add one or scan a lab paper.</p> : (
          <div className="bh-stats">
            {SHOWN.map((id) => nodes.find((n) => n.id === id)).map((n) => n && (
              <a key={n.id} className="bh-stat press" href={`#health/metric/${n.code}`} data-node={n.id}>
                <span className="bh-l">{n.label}</span>{" "}
                <b className="bh-v">{n.value}</b>{" "}
                <span className="hv-sr">{n.empty ? 'No data yet' : n.note}</span>
              </a>
            ))}
          </div>
        )}
        action={add}
        secondary={scan}
      />
    </div>
  )
}
