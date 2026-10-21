import { formatNumber } from '../../lib/labFormat'
import { latestByTest, type Range, type Reading } from './ranges'
import { groupLabs, labBand, labRow, labVerdict, type LabRow } from './labsLogic'
import { metricLabel } from './model'
import { isVital } from './vitals'
import { Icon } from '../shell/Icon'

const rangeWords = (r: Range, unit?: string) => {
  const u = unit ? ` ${unit}` : ''
  return r.low != null && r.high != null ? `${formatNumber(r.low)} to ${formatNumber(r.high)}${u}` : r.high != null ? `up to ${formatNumber(r.high)}${u}` : `${formatNumber(r.low)} or more${u}`
}

function LabCard({ row }: { row: LabRow }) {
  const { reading: r, range, pos, rv, unitGap } = row
  const v = labVerdict(pos)
  const b = range && rv ? labBand(rv.value, range) : null
  return (
    <a className="grp lr-card" href={`#health/metric/${r.test}`} data-test={r.test}>
      <span className="lr-top">
        <span className="lr-name">{metricLabel(r.test)}</span>
        <span className="lr-val">{formatNumber(r.value)}{r.unit ? <small> {r.unit}</small> : null}</span>
      </span>
      {v ? <span className={`lr-verdict ${pos}`}><Icon name={v.icon} size={20} />{v.word}</span> : <span className="lr-verdict none">{unitGap ? 'Different unit, not compared' : 'No range on the paper'}</span>}
      {b && range && (
        <>
          <span className="lr-track" aria-hidden="true">
            <i className="lr-band" style={{ left: `${b.band.from}%`, width: `${b.band.to - b.band.from}%` }} />
            <i className={`lr-you ${pos}`} style={{ left: `${b.you}%` }}><b>You</b></i>
            {b.lowAt != null && range.low != null && <em className="lr-tick" style={{ left: `${b.lowAt}%` }}>{formatNumber(range.low)}</em>}
            {b.highAt != null && range.high != null && <em className="lr-tick" style={{ left: `${b.highAt}%` }}>{formatNumber(range.high)}</em>}
          </span>
          <span className="hv-sr">Usual range {rangeWords(range, rv?.unit)}.</span>
        </>
      )}
      <span className="lr-more">See details<Icon name="chev" size={20} /></span>
    </a>
  )
}

/** Lab results (session 8): "Ask about" (out of range) first, then "In the usual range"; each card has the value, a plain verdict, and a number line with the usual range. Opens #health/metric/<code>. */
export function LabsList({ readings, thresholds, ready }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean }) {
  const rows = latestByTest(readings.filter((r) => !isVital(r.test))).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`)))
  if (!ready) return null
  if (rows.length === 0) return <section aria-labelledby="lvn-labs" data-testid="labs-list"><h2 className="hd" id="lvn-labs">Labs</h2><div className="grp"><p className="sub" style={{ margin: 0, padding: 16 }}>No lab results yet. Scan a paper with Ask.</p></div></section>
  const g = groupLabs(rows)
  const groups: [string, string, LabRow[]][] = [['Ask about', 'ask', g.ask], ['In the usual range', 'usual', g.usual], ['Not compared', 'none', g.noRange]]
  return (
    <section aria-labelledby="lvn-labs" data-testid="labs-list">
      <h2 className="hd" id="lvn-labs">Labs</h2>
      {groups.filter(([, , list]) => list.length > 0).map(([title, id, list]) => (
        <div key={id} data-group={id}>
          <h3 className="lr-h">{title}</h3>
          {list.map((row) => <LabCard key={row.reading.test} row={row} />)}
        </div>
      ))}
      <p className="sub" style={{ margin: '8px 4px 0' }}>Ranges are for information only and are not medical advice. Ask your doctor what is right for you. Ask your doctor about any result marked not compared.</p>
    </section>
  )
}
