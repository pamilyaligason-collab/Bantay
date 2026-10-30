import { useState } from 'react'
import { latestByTest, type Range, type Reading } from './ranges'
import { groupLabs, labBand, labDate, labNum, labRow, labVerdict, previousResult, rangeSource, type LabRow, type LabSource } from './labsLogic'
import { metricLabel } from './model'
import { isVital } from './vitals'
import { Icon } from '../shell/Icon'
import { EmptyState } from '../look/EmptyState'

/** The number line of one lab: the usual range as a band, "You" on the latest value and, with the Previous switch on, a hollow mark for the one before (D-38). */
export function LabBar({ row, prevAt }: { row: LabRow; prevAt?: number | null }) {
  const { range, pos, rv } = row
  const b = range && rv ? labBand(rv.value, range) : null
  if (!b || !range || !rv) return null
  const p0 = prevAt != null ? labBand(prevAt, range) : null
  // shortcut: two values off the SAME end of the track clamp to one spot, so the lower-ranked one steps 8% inward to stay visible (the higher value keeps the track end); the Before line holds the exact numbers.
  let you = b.you
  let prev = p0 ? p0.you : null
  if (p0 && prevAt != null && b.edge && p0.edge === b.edge) {
    const prevOutermost = b.edge === 'high' ? prevAt > rv.value : prevAt < rv.value
    if (prevOutermost) you = b.edge === 'high' ? b.you - 8 : b.you + 8
    else prev = b.edge === 'high' ? p0.you - 8 : p0.you + 8
  }
  return (
    <span className="lr-track" aria-hidden="true">
      <i className="lr-band" style={{ left: `${b.band.from}%`, width: `${b.band.to - b.band.from}%` }} />
      {prev != null && <i className="lr-prev" data-testid="lr-prev" style={{ left: `${prev}%` }} />}
      <i className={`lr-you ${pos}`} style={{ left: `${you}%` }}><b>You</b></i>
      {b.lowAt != null && range.low != null && <em className="lr-tick" style={{ left: `${b.lowAt}%` }}>{labNum(range.low)}</em>}
      {b.highAt != null && range.high != null && <em className="lr-tick" style={{ left: `${b.highAt}%` }}>{labNum(range.high)}</em>}
    </span>
  )
}

/** One plain word and an icon, never colour alone; no range says so (or that the unit cannot be compared). */
export function VerdictChip({ row }: { row: LabRow }) {
  const v = labVerdict(row.pos)
  return v
    ? <span className={`lr-verdict ${row.pos}`}><Icon name={v.icon} size={20} />{v.word}</span>
    : <span className="lr-verdict none">{row.unitGap ? 'Different unit, not compared' : 'No range on the paper'}</span>
}

function LabCard({ row, all, family, showPrev }: { row: LabRow; all: Reading[]; family?: Range; showPrev: boolean }) {
  const { reading: r, pos } = row
  const src = rangeSource(r, family)
  const prev = previousResult(all, r.test, family)
  const ask = pos === 'above' || pos === 'below'
  return (
    <a className="grp lr-card press" href={`#health/metric/${r.test}`} data-test={r.test}>
      <span className="lr-top">
        <span className="lr-name">{metricLabel(r.test)}</span>
        <VerdictChip row={row} />
      </span>
      <span className="lr-vrow">
        <span className="lr-val">{labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</span>
        <span className="lr-date" data-testid="lab-date">{labDate(r.takenAt)}</span>
      </span>
      <LabBar row={row} prevAt={showPrev ? prev?.prevAt : null} />
      <span className="lr-foot">
        <span className="lr-rng" data-testid="lab-range">{src ? src.text : 'No range printed on the paper'}</span>
        {ask ? <span className="lr-ask">Ask about it</span> : null}
      </span>
      {showPrev && <span className="sub hv-before" data-testid="lab-before">{prev ? prev.line : 'Before: no earlier result'}</span>}
    </a>
  )
}

type Filter = 'all' | 'ask' | 'in'

/** Lab results screen body (mockup v8 health-labs): the source paper (D-9), filter chips, the Previous switch (D-38) and one card per test with its date and whose range it is. */
export function LabsList({ readings, thresholds, ready, sources }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean; sources: Map<string, LabSource> }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [showPrev, setShowPrev] = useState(true)
  if (!ready) return null
  const labs = readings.filter((r) => !isVital(r.test))
  const rows = latestByTest(labs).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`)))
  if (rows.length === 0) return <EmptyState heading="h2" icon="drop" title="No lab papers yet" body="A person checks every number." action={{ label: 'Scan a paper', onClick: () => { location.hash = '#scan' } }} />
  const g = groupLabs(rows)
  const ordered = [...g.ask, ...g.usual, ...g.noRange]
  const shown = filter === 'ask' ? g.ask : filter === 'in' ? g.usual : ordered
  const newest = [...rows].sort((a, b) => Date.parse(b.reading.takenAt) - Date.parse(a.reading.takenAt))[0]!.reading
  const paper = [...rows].filter((x) => x.reading.sourceFileId && sources.has(x.reading.sourceFileId)).sort((a, b) => Date.parse(b.reading.takenAt) - Date.parse(a.reading.takenAt))[0]
  const src = paper ? sources.get(paper.reading.sourceFileId!)! : null
  const paperDate = labDate(src?.docDate ?? newest.takenAt, true)
  const allLab = rows.every((x) => !x.range || rangeSource(x.reading, thresholds.find((t) => t.key === `${x.reading.personId}:${x.reading.test}`))?.kind === 'lab')
  const anyPrev = rows.some((x) => previousResult(labs, x.reading.test))
  const chip = (id: Filter, label: string, n: number) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} {n}</button>
  return (
    <section aria-label="Lab results" data-testid="labs-list">
      <a className="grp lb-src press" href="#family/papers" data-testid="lab-source">
        <span className="hc-ic"><Icon name="file" size={20} /></span>
        <span className="grow"><b>{src?.facility ? `${src.facility} · ` : 'Lab paper · '}{paperDate}</b>
          <span className="sub">{allLab ? "Ranges are the lab's own printed ranges, not Bantay's." : 'Where the paper prints no range, a general guide is used and named on the result.'}</span></span>
        <Icon name="chev" size={20} />
      </a>
      <div className="lb-chips" role="group" aria-label="Show">
        {chip('all', 'All', ordered.length)}
        {chip('ask', 'To ask about', g.ask.length)}
        {chip('in', 'In range', g.usual.length)}
      </div>
      <div className="grp lb-sw">
        <span className="grow"><b>Show previous result</b><span className="sub">{anyPrev ? 'A hollow mark on each bar' : 'No earlier result yet'}</span></span>
        <button type="button" className="hv-sw" role="switch" aria-checked={anyPrev && showPrev} aria-label="Show previous result" disabled={!anyPrev} onClick={() => setShowPrev((p) => !p)}><span className="hv-sw-t" aria-hidden="true" /></button>
      </div>
      {shown.length === 0 && <p className="sub" role="status">{filter === 'ask' ? 'Nothing to ask about. Every result with a range is in it.' : 'No results in the range yet.'}</p>}
      {shown.map((row) => <LabCard key={row.reading.test} row={row} all={labs} family={thresholds.find((t) => t.key === `${row.reading.personId}:${row.reading.test}`)} showPrev={showPrev && anyPrev} />)}
      <p className="sub" style={{ margin: '8px 4px 0' }}>A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results.</p>
    </section>
  )
}

/** The Health overview's one line for labs: opens the Lab results screen. */
export function LabsRow({ readings }: { readings: Reading[] }) {
  const last = readings.filter((r) => !isVital(r.test) && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  return (
    <a className="grp lr-row press" href="#health/labs" data-testid="labs-row">
      <Icon name="flask" tone="vitals" boxed />
      <span className="grow">Lab results<span className="sub">{last ? `Last paper ${labDate(last.takenAt, true)}` : 'No papers yet'}</span></span>
      <Icon name="chev" size={20} />
    </a>
  )
}
