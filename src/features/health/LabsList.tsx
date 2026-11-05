import { useEffect, useState } from 'react'
import { latestByTest, type Range, type Reading } from './ranges'
import { groupLabs, labBand, labDate, labInfo, labNum, labRow, labVerdict, overBy, plainWords, previousResult, rangeSource, type LabRow, type LabSource } from './labsLogic'
import { metricLabel } from './model'
import { db } from '../../db'
import { isVital } from './vitals'
import { Icon } from '../shell/Icon'
import './comply.css'
import { EmptyState } from '../look/EmptyState'
import { Segmented } from '../look/Segmented'
import { GroupedList, Row, Section } from '../look'

/** The number line of one lab: three zones, "You" on the latest value and, with the Previous switch on, a hollow mark for the one before (D-38). `compact` (the Health lead card): a bare "You" under the mark and no tick numbers, because the value is in the big number above and the range in the line below. */
export function LabBar({ row, prevAt, compact }: { row: LabRow; prevAt?: number | null; compact?: boolean }) {
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
  const { low, high } = range
  const same = rv.unit === row.reading.unit // converted: the range numbers are in another unit than the shown value, so print none
  const normal = !same ? '' : low != null && high != null ? `${labNum(low)}-${labNum(high)}` : high != null ? `up to ${labNum(high)}` : `${labNum(low)} or more`
  const roomy = b.band.to - b.band.from >= 40 // a narrow zone says only "Normal" (the tick numbers, or on the compact bar the range line below, give the numbers), so the word is never clipped
  // The printed share is the distance from the edge it crossed, as a share of that edge (overBy is range-width based and only ranks).
  const edge = pos === 'above' ? range.high : pos === 'below' ? range.low : null
  const share = edge != null && edge > 0 && overBy(row) ? Math.round((Math.abs(rv.value - edge) / edge) * 100) : 0
  const over = share ? `${pos === 'above' ? '+' : ''}${share}% ${pos === 'above' ? 'over' : 'under'}` : null // rounds to 0: no line, the verdict says enough
  return (
    <>
    <span className="lr-track" aria-hidden="true" style={{ '--f': `${b.band.from}%`, '--t': `${b.band.to}%`, '--gf': b.band.from > 0 ? '1px' : '0px', '--gt': b.band.to < 100 ? '1px' : '0px' } as React.CSSProperties}>
      {prev != null && <i className="lr-prev" data-testid="lr-prev" style={{ left: `${prev}%` }} />}
      <i className={`lr-you ${pos}`} style={{ left: `${you}%`, '--y': you } as React.CSSProperties}><b>{compact ? 'You' : `You ${labNum(rv.value)}`}</b></i>
      {!compact && same && b.lowAt != null && range.low != null && <em className="lr-tick" style={{ left: `${b.lowAt}%` }}>{labNum(range.low)}</em>}
      {!compact && same && b.highAt != null && range.high != null && <em className="lr-tick" style={{ left: `${b.highAt}%` }}>{labNum(range.high)}</em>}
    </span>
    <span className="lr-zones" aria-hidden="true">
      {low != null && <i style={{ width: `${b.band.from}%` }}>Low</i>}
      <i className="n" style={{ width: `${b.band.to - b.band.from}%` }}>Normal{roomy && normal && ` ${normal}`}</i>
      {high != null && <i style={{ width: `${100 - b.band.to}%` }}>High</i>}
    </span>
    {over && <span className="lr-over" data-testid="lr-over">{over}</span>}
    </>
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
  const say = pos === 'none' ? '' : plainWords(row.rv?.value ?? r.value, row.range, labNum(r.value))
  return (
    <div className="lr-wrap">
    <div className="lr-box">
    <a className="lr-card press" href={`#health/metric/${r.test}`} data-test={r.test}>
      <span className="lr-top">
        <span className="lr-nm"><span className="lr-name">{metricLabel(r.test)}</span><span className="lr-sub">{labInfo(r.test).short}</span></span>
        <VerdictChip row={row} />
      </span>
      <span className="lr-vrow">
        <span className="lr-val">{labNum(r.value)}{r.unit ? <small> {r.unit}</small> : null}</span>
        <span className="lr-date" data-testid="lab-date">{labDate(r.takenAt)}</span>
      </span>
      <LabBar row={row} prevAt={showPrev ? prev?.prevAt : null} />
      {say && <span className="lr-say" style={{ display: 'block' }}>{say}</span>}
      <span className="lr-foot">
        <span className="lr-rng" data-testid="lab-range">{src ? src.text : 'No range printed on the paper'}</span>
      </span>
      {showPrev && <span className="sub hv-before" data-testid="lab-before">{prev ? prev.line : 'Before: no earlier result'}</span>}
    </a>
    <div className="lr-acts" data-testid="lab-actions"><a className="btn2" href={`#health/metric/${r.test}`}>What it means</a><a className="btn lr-ask2" href="#health/visits">Ask at next visit</a></div>
    </div>
    </div>
  )
}

type Filter = 'all' | 'ask' | 'in'

/** Questions to ask (board): the tests' own questions (labInfo, MedlinePlus-style wording) for the results to ask about, each with an Add that saves it to the Visits list (kv visits.questions.<id>). */
function LabQuestions({ personId, rows, canAdd }: { personId: string; rows: LabRow[]; canAdd: boolean }) {
  const [saved, setSaved] = useState<string[]>([])
  useEffect(() => {
    let live = true
    void db.kv.get(`visits.questions.${personId}`).then((r) => { if (live) setSaved(Array.isArray(r?.value) ? (r!.value as unknown[]).filter((x): x is string => typeof x === 'string') : []) }).catch(() => undefined)
    return () => { live = false }
  }, [personId])
  const asked = rows.filter((x) => x.pos === 'above' || x.pos === 'below')
  const pool = (asked.length ? asked : rows).flatMap((x) => labInfo(x.reading.test).questions.slice(0, 1))
  const sugg = [...new Set([...pool, 'Should I repeat this test, and when?', 'Do my medicines or food affect it?'])].slice(0, 3)
  const [err, setErr] = useState('')
  // read, append, write in one go: a tap before the first read lands must not overwrite the saved list; "Added" shows only after the write succeeded
  const add = async (q: string) => {
    setErr('')
    try {
      const key = `visits.questions.${personId}`
      const cur = ((await db.kv.get(key))?.value as unknown)
      const list = Array.isArray(cur) ? (cur as unknown[]).filter((x): x is string => typeof x === 'string') : []
      const n = list.includes(q) ? list : [...list, q]
      await db.kv.put({ key, value: n })
      setSaved(n)
    } catch { setErr('Could not save on this phone. Try again.') }
  }
  return (
    <Section title="Questions to ask your doctor" testId="lab-questions">
      <GroupedList>{sugg.map((q) => (
        <Row key={q} icon="msg" tint="purple" title={q} control={!canAdd ? undefined : saved.includes(q)
          ? <button type="button" className="btn2 lb-add lb-added" disabled aria-label={`Added to visit questions: ${q}`}>Added</button>
          : <button type="button" className="btn2 lb-add" aria-label={`Add to visit questions: ${q}`} onClick={() => void add(q)}>Add</button>} />
      ))}</GroupedList>
      {err && <p className="sub" role="alert">{err}</p>}
      <p className="sub" style={{ margin: '8px 4px 0' }}>Added questions are shared with Visits. <a className="lb-lnk" href="#health/visits">Open Visits</a></p>
    </Section>
  )
}

/** Lab results screen body (mockup v8 health-labs): the source paper (D-9), filter chips, the Previous switch (D-38) and one card per test with its date and whose range it is. */
export function LabsList({ readings, thresholds, ready, sources, personId, canMark = false }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean; sources: Map<string, LabSource>; personId?: string; canMark?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [showPrev, setShowPrev] = useState(true)
  if (!ready) return null
  const labs = readings.filter((r) => !isVital(r.test))
  const rows = latestByTest(labs).map((r) => labRow(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`)))
  if (rows.length === 0) return <EmptyState heading="h2" icon="flask" title="No lab papers yet" body="A person checks every number." action={{ label: 'Scan a paper', onClick: () => { location.hash = '#scan' } }} />
  const g = groupLabs(rows)
  const ordered = [...g.ask, ...g.usual, ...g.noRange]
  const shown = filter === 'ask' ? g.ask : filter === 'in' ? g.usual : ordered
  const newest = [...rows].sort((a, b) => Date.parse(b.reading.takenAt) - Date.parse(a.reading.takenAt))[0]!.reading
  const paper = [...rows].filter((x) => x.reading.sourceFileId && sources.has(x.reading.sourceFileId)).sort((a, b) => Date.parse(b.reading.takenAt) - Date.parse(a.reading.takenAt))[0]
  const src = paper ? sources.get(paper.reading.sourceFileId!)! : null
  const paperDate = labDate(src?.docDate ?? newest.takenAt, true)
  const allLab = rows.every((x) => !x.range || rangeSource(x.reading, thresholds.find((t) => t.key === `${x.reading.personId}:${x.reading.test}`))?.kind === 'lab')
  const anyPrev = rows.some((x) => previousResult(labs, x.reading.test))

  const lows = g.ask.filter((x) => x.pos === 'below').length
  const srcRow = (
    <a className="grp lb-src press" href="#family/papers" data-testid="lab-source">
      <span className="hc-ic"><Icon name="file" size={20} /></span>
      <span className="grow"><b>{src?.facility ? `${src.facility} · ` : 'Lab paper · '}{paperDate}</b>
        <span className="sub">{allLab ? "Ranges are the lab's own printed ranges, not Bantay's." : 'Where the paper prints no range, a general guide is used and named on the result.'}</span></span>
      <span className="lb-open">Open Papers</span>
    </a>
  )

  return (
    <section aria-label="Lab results" data-testid="labs-list">
      <section className="lb-sum" data-hero data-testid="lab-summary" aria-label="Summary">
        <div><b>{g.ask.length}</b><span>To ask about</span></div>
        <div><b>{lows}</b><span>Low</span></div>
        <div><b>{g.usual.length}</b><span>Normal</span></div>
      </section>
      <p className="sub lb-count" data-testid="lab-count-note">Counts include real results only.{g.noRange.length > 0 && ` ${g.noRange.length} with no range on the paper.`}</p>
      <Segmented<Filter> label="Filter results" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'ask', label: 'To ask about' }, { id: 'in', label: 'In range' }]} />
      <div className="lb-h lb-results"><h2 className="hd">Results</h2><span className="sub">{labDate(newest.takenAt, true)}</span></div>
      <div className="grp lb-sw">
        <span className="grow"><b>Show previous result</b><span className="sub">{anyPrev ? 'A hollow mark on each bar' : 'No earlier result yet'}</span></span>
        <button type="button" className="hv-sw" role="switch" aria-checked={anyPrev && showPrev} aria-label="Show previous result" disabled={!anyPrev} onClick={() => setShowPrev((p) => !p)}><span className="hv-sw-t" aria-hidden="true" /></button>
      </div>
      {shown.length === 0 && <p className="sub" role="status">{filter === 'ask' ? 'Nothing to ask about. Every result with a range is in it.' : 'No results in the range yet.'}</p>}
      {shown.map((row) => <LabCard key={row.reading.test} row={row} all={labs} family={thresholds.find((t) => t.key === `${row.reading.personId}:${row.reading.test}`)} showPrev={showPrev && anyPrev} />)}
      <Section title="Source">{srcRow}</Section>
      {personId && <LabQuestions personId={personId} rows={rows} canAdd={canMark} />}
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
