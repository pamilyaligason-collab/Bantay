import { useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { CHIP, latestByTest, rangeState, type Range, type Reading } from './ranges'
import { sparkPath, sparkCount, barLayout, beforeLine, effectiveRange, metricLabel, previousReading } from './model'
import { byVitalOrder, isVital, NORMAL, positionOf, weekAverages } from './vitals'
import { Icon } from '../shell/Icon'
import { kindOf } from './verdict'

const open = (code: string) => { location.hash = `#health/metric/${code}` }
export type VitalsMode = 'latest' | 'average' | 'normal'
const MODES: { id: VitalsMode; label: string }[] = [{ id: 'latest', label: 'Latest' }, { id: 'average', label: 'Average' }, { id: 'normal', label: 'Normal' }]
const MODE_LINE: Record<VitalsMode, string> = {
  latest: 'Showing your latest reading for each. The green band is the normal range.',
  average: 'Showing the average of the last 7 days. The green band is the normal range.',
  normal: 'The standard ranges for adults. Your doctor may set a different target for you.'
}

function Spark({ path }: { path: string }) {
  return path ? <svg className="hv-spark" viewBox="0 0 60 22" width="60" height="22" aria-hidden="true" focusable="false"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg> : null
}

function NormalRows() {
  return (
    <div className="grp" data-testid="normal-rows">
      {NORMAL.map((n) => {
        const l = barLayout(0, null, { low: n.low, high: n.high })
        return (
          <div className="row hv-row" key={n.code} data-test={n.code} style={{ alignItems: 'flex-start' }} onClick={() => open(n.code)}>
            <span className="grow">
              <a className="hv-open" href={`#health/metric/${n.code}`} onClick={(e) => e.stopPropagation()}>{n.label}<Icon name="chev" size={20} /></a>
              {l.band && <span className="hv-bar" aria-hidden="true"><i className="hv-band" style={{ left: `${l.band.from}%`, width: `${l.band.to - l.band.from}%` }} /></span>}
              <span className="sub hv-before">{n.line}</span>
            </span>
            <span className="hv-val"><strong className="hv-norm">{n.range}</strong></span>
          </div>
        )
      })}
    </div>
  )
}

/** Vitals (blood pressure, sugar, pulse, weight) with a Latest | Average | Normal toggle, Each row opens the metric detail; the Previous switch (Latest only) adds a hollow marker and the "Before" line. */
export function LatestList({ readings, thresholds, ready }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean }) {
  const [showPrev, setShowPrev] = useState(false)
  const [mode, setMode] = useState<VitalsMode>('latest')
  const shown = mode
  const pool = readings.filter((r) => isVital(r.test))
  const raw = shown === 'average' ? weekAverages(pool, new Date()) : latestByTest(pool)
  const rows = byVitalOrder(raw)
  const any = shown === 'latest' && rows.some((r) => previousReading(pool, r.test))
  if (ready && pool.length === 0 && mode !== 'normal') return null
  return (
    <section aria-labelledby="lvn-vitals">
      <div className="hv-lvn-h">
        <h2 className="hd" id="lvn-vitals">Vitals</h2>
        {any && (
          <button type="button" className="hv-sw" role="switch" aria-checked={showPrev} onClick={() => setShowPrev((p) => !p)}>
            <span className="hv-sw-t" aria-hidden="true" />
            Previous
          </button>
        )}
      </div>
      <div className="seg hv-modes" role="group" aria-label="Show vitals as">
        {MODES.map((m) => <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>)}
      </div>
      <p className="sub hv-modeline" data-testid="mode-line">{MODE_LINE[mode]}</p>
      {shown === 'normal' ? <NormalRows /> : (
        <div className="grp">
          {rows.length === 0 && <div className="row"><span className="grow">No readings in the last 7 days<span className="sub">Log one to see the average.</span></span></div>}
          {rows.map((r) => {
            const fam = thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
            const pos = positionOf(r, fam)
            const famOf = (test: string) => thresholds.find((t) => t.key === `${r.personId}:${test}`) // the pair's doctor targets, so both rows read the same word
            const doctor = { top: famOf('bp_systolic'), bottom: famOf('bp_diastolic') }
            const st = rangeState(pos, kindOf(r.test), r.test === 'bp_systolic' ? { top: r.value, bottom: rows.find((x) => x.test === 'bp_diastolic')?.value, doctor } : r.test === 'bp_diastolic' ? { top: rows.find((x) => x.test === 'bp_systolic')?.value, bottom: r.value, doctor } : undefined)
            const cls = CHIP[st.kind]
            const hist = pool.filter((x) => x.test === r.test)
            const spark = sparkPath(hist)
            const prev = previousReading(pool, r.test)
            const range = effectiveRange(r, fam).range ?? (r.test === 'heart_rate' ? { low: 60, high: 100 } : null)
            const layout = barLayout(r.value, shown === 'latest' && showPrev && prev ? prev.value : null, range)
            return (
              <div className="row hv-row" key={r.test} data-test={r.test} style={{ alignItems: 'flex-start' }} onClick={() => open(r.test)}>
                <span className="grow">
                  <a className="hv-open" href={`#health/metric/${r.test}`} onClick={(e) => e.stopPropagation()}>{metricLabel(r.test)}<Icon name="chev" size={20} /></a>
                  <span className={`hv-state ${cls}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>
                  {layout.band && (
                    <span className="hv-bar" aria-hidden="true">
                      <i className="hv-band" style={{ left: `${layout.band.from}%`, width: `${layout.band.to - layout.band.from}%` }} />
                      {layout.prev != null && <i className="hv-dot prev" style={{ left: `${layout.prev}%` }} />}
                      <i className={`hv-dot now ${cls}${layout.edge ? ' edge' : ''}`} style={{ left: `${layout.now}%` }} />
                      {layout.edge && <i className={`hv-arrow ${layout.edge}`} />}
                    </span>
                  )}
                  {!layout.band && layout.prev != null && (
                    <span className="hv-bar" aria-hidden="true">
                      <i className="hv-dot prev" style={{ left: `${layout.prev}%` }} />
                      <i className="hv-dot now none" style={{ left: `${layout.now}%` }} />
                    </span>
                  )}
                  {shown === 'latest' && showPrev && (prev ? <span className="sub hv-before">{beforeLine(r, prev, fam)}</span> : <span className="sub hv-before">Before: no earlier result</span>)}
                </span>
                <span className="hv-val">
                  <strong>{formatNumber(r.value)}</strong> <small>{r.unit}</small>
                  {shown === 'average' ? <small className="hv-last">7-day average</small> : <><Spark path={spark} />{spark && <small className="hv-last">Last {sparkCount(hist)}</small>}</>}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <p className="sub" style={{ margin: '8px 4px 0' }}>Ranges are for information only and are not medical advice. Ask your doctor what is right for you.</p>
    </section>
  )
}
