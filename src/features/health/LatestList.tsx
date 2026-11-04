import { useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { CHIP, latestByTest, rangeState, type Range, type Reading } from './ranges'
import { sparkPath, sparkCount, barLayout, beforeLine, effectiveRange, metricLabel, previousReading } from './model'
import { byVitalOrder, isVital, positionOf } from './vitals'
import { Icon } from '../shell/Icon'
import { kindOf } from './verdict'
import { EmptyState } from '../look/EmptyState'


const open = (code: string) => { location.hash = `#health/metric/${code}` }
function Spark({ path }: { path: string }) {
  return path ? <svg className="hv-spark" viewBox="0 0 60 22" width="60" height="22" aria-hidden="true" focusable="false"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg> : null
}

/** Last readings: the newest of each vital (blood pressure, sugar, pulse, weight). Each row opens the metric detail; the Previous switch adds a hollow marker and the "Before" line. The averages live in their own section (vitals.averageNodes). */
export function LatestList({ readings, thresholds }: { readings: Reading[]; thresholds: (Range & { key: string })[]}) {
  const [showPrev, setShowPrev] = useState(false)
  const pool = readings.filter((r) => isVital(r.test))
  const rows = byVitalOrder(latestByTest(pool))
  const any = rows.some((r) => previousReading(pool, r.test))
  return (
    <section aria-labelledby="lvn-vitals" data-testid="rd-last">
      <div className="hv-lvn-h">
        <h2 className="hd" id="lvn-vitals">Last readings</h2>
        {any && (
          <button type="button" className="hv-sw" role="switch" aria-checked={showPrev} onClick={() => setShowPrev((p) => !p)}>
            <span className="hv-sw-t" aria-hidden="true" />
            Previous
          </button>
        )}
      </div>
      <div className={rows.length ? 'grp' : undefined}>
        {rows.length === 0 && <EmptyState icon="gauge" title="No readings yet" body="Add a reading above to see it here." />}
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
          const layout = barLayout(r.value, showPrev && prev ? prev.value : null, range)
          return (
            <div className="row hv-row press" key={r.test} data-test={r.test} style={{ alignItems: 'flex-start' }} onClick={() => open(r.test)}>
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
                {showPrev && (prev ? <span className="sub hv-before">{beforeLine(r, prev, fam)}</span> : <span className="sub hv-before">Before: no earlier result</span>)}
              </span>
              <span className="hv-val">
                <strong>{formatNumber(r.value)}</strong> <small>{r.unit}</small>
                <Spark path={spark} />{spark && <small className="hv-last">Last {sparkCount(hist)}</small>}
              </span>
            </div>
          )
        })}
      </div>
      <p className="sub" style={{ margin: '8px 4px 0' }}>Ranges are for information only and are not medical advice. Ask your doctor what is right for you.</p>
    </section>
  )
}
