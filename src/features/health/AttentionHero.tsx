import { HeroCard } from '../look/HeroCard'
import { CardActionButton, type CardAction } from '../look/cardParts'
import type { Attention } from './attention'
import { LabBar, VerdictChip } from './LabsList'
import { attentionLine, labDate, labNum, rangeSource } from './labsLogic'
import { metricLabel } from './model'
import type { Range } from './ranges'
import './health.css'

const lock = 'You can see this person but not log for them.'

/** Overview lead card: the one result that needs a look (or the newest in range), its number line and two doors. With nothing to show it is the empty card: + Reading and Scan, gated like the old body hero (D-99). */
export function AttentionHero({ attention, family, canLog, canEdit, lockReason, onAdd }: { attention: Attention | null; family?: Range; canLog: boolean; canEdit: boolean; lockReason?: string | null; onAdd: () => void }) {
  if (!attention) {
    const add: CardAction = canLog ? { label: '+ Reading', onClick: onAdd } : { label: '+ Reading', disabled: true, lockReason: lockReason ?? lock }
    const scan: CardAction = canEdit ? { label: 'Scan', href: '#scan' } : { label: 'Scan', disabled: true }
    return (
      <div data-hero className="ah" data-testid="bodyhero">
        <HeroCard hue="none" icon="gauge" title="No readings yet" body={<p className="ah-line">Add one or scan a lab paper.</p>}>
          <div className="ah-acts"><CardActionButton action={add} /><CardActionButton action={scan} secondary /></div>
        </HeroCard>
      </div>
    )
  }
  const { reading: r, row, pair } = attention
  const src = rangeSource(r, family)
  const date = labDate(r.takenAt, true)
  const what = attentionLine(row)
  const hue = 'none' // board: a white card; the verdict chip and the bar carry the state, not a tinted card
  return (
    <div data-hero className="ah" data-testid="bodyhero">
      <section className="card hc ah-card" data-hue={hue} aria-label={metricLabel(r.test)}>
        <div className="ah-kick"><span className="hc-kicker">{metricLabel(r.test)}</span>{what && <span className="sub ah-what" data-testid="ah-what" title={what}>{what}</span>}</div>
        <div className="ah-top">
          <p className="ah-val">{pair ? `${pair.top}/${pair.bottom}` : labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</p>
          <VerdictChip row={row} />
        </div>
        <LabBar row={row} compact />
        <p className="sub ah-foot">{[src?.text ?? 'No range printed on the paper', r.test === 'heart_rate' ? 'A pulse reading, not judged as resting' : '', attention.old ? `Old result, ${date}` : date].filter(Boolean).join(' · ')}</p>
        <div className="ah-acts"><CardActionButton action={{ label: 'What it means', href: `#health/metric/${r.test}` }} secondary /><CardActionButton action={{ label: 'Ask at next visit', href: '#health/visits' }} /></div>
      </section>
    </div>
  )
}
