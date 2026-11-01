import { HeroCard } from '../look/HeroCard'
import { CardActionButton, type CardAction } from '../look/cardParts'
import type { Attention } from './attention'
import { LabBar, VerdictChip } from './LabsList'
import { labDate, labNum, rangeSource } from './labsLogic'
import { metricLabel } from './model'
import type { Range } from './ranges'
import { isVital } from './vitals'
import './health.css'

const lock = 'You can see this person but not log for them.'

/** Overview lead card: the one result that needs a look (or the newest in range), its number line and two doors. With nothing to show it is the empty card: + Reading and Scan, gated like the old body hero (D-99). */
export function AttentionHero({ attention, family, canLog, canEdit, lockReason, onAdd }: { attention: Attention | null; family?: Range; canLog: boolean; canEdit: boolean; lockReason?: string | null; onAdd: () => void }) {
  if (!attention) {
    const add: CardAction = canLog ? { label: '+ Reading', onClick: onAdd } : { label: '+ Reading', disabled: true, lockReason: lockReason ?? lock }
    const scan: CardAction = canEdit ? { label: 'Scan', href: '#scan' } : { label: 'Scan', disabled: true }
    return (
      <div data-hero className="ah" data-testid="bodyhero">
        <HeroCard hue="none" icon="gauge" title="No readings yet" body={<p className="ah-line">Add one or scan a lab paper.</p>} action={add}>
          <CardActionButton action={scan} secondary />
        </HeroCard>
      </div>
    )
  }
  const { reading: r, row, pair } = attention
  const src = rangeSource(r, family)
  const date = labDate(r.takenAt, true)
  const hue = row.pos === 'above' || row.pos === 'below' ? 'amber' : row.pos === 'within' ? 'green' : 'none'
  return (
    <div data-hero className="ah" data-testid="bodyhero">
      <HeroCard
        hue={hue}
        icon={isVital(r.test) ? 'gauge' : 'flask'}
        title={metricLabel(r.test)}
        body={
          <>
            <VerdictChip row={row} />
            <p className="ah-val">{pair ? `${pair.top}/${pair.bottom}` : labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</p>
            <LabBar row={row} />
            <p className="sub ah-foot">{[src?.text ?? 'No range printed on the paper', date].filter(Boolean).join(' · ')}</p>
          </>
        }
        action={{ label: 'What it means', href: `#health/metric/${r.test}` }}
      >
        <CardActionButton action={{ label: 'Ask at next visit', href: '#health/visits' }} secondary />
      </HeroCard>
    </div>
  )
}
