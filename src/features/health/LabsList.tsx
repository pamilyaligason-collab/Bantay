import { latestByTest, type Range, type Reading } from './ranges'
import { groupByPanel, groupLabs, labBand, labNum, labRow, labVerdict, type LabRow } from './labsLogic'
import { metricLabel } from './model'
import { isVital } from './vitals'
import { Icon } from '../shell/Icon'

const rangeWords = (r: Range, unit?: string) => {
  const u = unit ? ` ${unit}` : ''
  return r.low != null && r.high != null ? `${labNum(r.low)} to ${labNum(r.high)}${u}` : r.high != null ? `up to ${labNum(r.high)}${u}` : `${labNum(r.low)} or more${u}`
}

function LabCard({ row }: { row: LabRow }) {
  const { reading: r, range, pos, rv, unitGap } = row
  const v = labVerdict(pos)
  const b = range && rv ? labBand(rv.value, range) : null
  return (
    <a className="grp lr-card" href={`#health/metric/${r.test}`} data-test={r.test}>
      <span className="lr-top">
        <span className="lr-name">{metricLabel(r.test)}</span>
        <span className="lr-val">{labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</span>
      </span>
      {v ? <span className={`lr-verdict ${pos}`}><Icon name={v.icon} size={20} />{v.word}</span> : <span className="lr-verdict none">{unitGap ? 'Different unit, not compared' : 'No range on the paper'}</span>}
      {b && range && (
        <>
          <span className="lr-track" aria-hidden="true">
            <i className="lr-band" style={{ left: `${b.band.from}%`, width: `${b.band.to - b.band.from}%` }} />
            <i className={`lr-you ${pos}`} style={{ left: `${b.you}%` }}><b>You</b></i>
            {b.lowAt != null && range.low != null && <em className="lr-tick" style={{ left: `${b.lowAt}%` }}>{labNum(range.low)}</em>}
            {b.highAt != null && range.high != null && <em className="lr-tick" style={{ left: `${b.highAt}%` }}>{labNum(range.high)}</em>}
          </span>
          <span className="hv-sr">Usual range {rangeWords(range, rv?.unit)}.</span>
        </>
      )}
      <span className="lr-more">See details<Icon name="chev" size={20} /></span>
    </a>
  )
}

/** A usual-range or not-compared lab as one line: name, value, verdict word. Opens the same detail page as a card. */
function LabLine({ row }: { row: LabRow }) {
  const { reading: r, pos, unitGap } = row
  const v = labVerdict(pos)
  return (
    <a className="lr-line" href={`#health/metric/${r.test}`} data-test={r.test}>
      <span className="lr-name">{metricLabel(r.test)}</span>
      <span className="lr-val">{labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</span>
      <span className={`lr-vw ${pos}`}>{v ? <><Icon name={v.icon} size={16} />{v.word}</> : unitGap ? 'Different unit, not compared' : 'No range on the paper'}</span>
    </a>
  )
}

/** Everything that is not "Ask about": folded by panel (Cholesterol, Sugar, Kidney, ...), closed until tapped, so 20 results are 4 or 5 lines. */
function Folded({ id, title, rows }: { id: string; title: string; rows: LabRow[] }) {
  if (rows.length === 0) return null
  return (
    <div data-group={id}>
      <h3 className="lr-h">{title}</h3>
      {groupByPanel(rows).map(({ panel, rows: list }) => (
        <details key={panel} className="grp lr-fold" data-panel={panel}>
          <summary><span>{panel}</span><small>{list.length === 1 ? '1 result' : `${list.length} results`}</small></summary>
          {list.map((row) => <LabLine key={row.reading.test} row={row} />)}
        </details>
      ))}
    </div>
  )
}

/** Lab results (session 8): "Ask about" (out of range) first, then "In the usual range"; each card has the value, a plain verdict, and a number line with the usual range. Opens #health/metric/<code>. */
export function LabsList({ readings, thresholds, ready }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean }) {
  const rows = latestByTest(readings.filter((r) => !isVital(r.test))).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`)))
  if (!ready) return null
  if (rows.length === 0) return <section aria-labelledby="lvn-labs" data-testid="labs-list"><h2 className="hd" id="lvn-labs">Labs</h2><div className="grp"><p className="sub" style={{ margin: 0, padding: 16 }}>No lab results yet. Scan a paper with Ask.</p></div></section>
  const g = groupLabs(rows)
  return (
    <section aria-labelledby="lvn-labs" data-testid="labs-list">
      <h2 className="hd" id="lvn-labs">Labs</h2>
      {g.ask.length > 0 && (
        <div data-group="ask">
          <h3 className="lr-h">Ask about</h3>
          {g.ask.map((row) => <LabCard key={row.reading.test} row={row} />)}
        </div>
      )}
      <Folded id="usual" title="In the usual range" rows={g.usual} />
      <Folded id="none" title="Not compared" rows={g.noRange} />
      <p className="sub" style={{ margin: '8px 4px 0' }}>Ranges are for information only and are not medical advice. Ask your doctor what is right for you. Ask your doctor about any result marked not compared.</p>
    </section>
  )
}
