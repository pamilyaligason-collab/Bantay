import { useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { latestByTest, latestVsNormal, rangeState, type Range, type Reading } from './ranges'
import { sparkPath, sparkCount, barLayout, beforeLine, effectiveRange, metricLabel, previousReading } from './model'

const open = (code: string) => { location.hash = `#health/metric/${code}` }

function Spark({ path }: { path: string }) {
  return path ? <svg className="hv-spark" viewBox="0 0 60 22" width="60" height="22" aria-hidden="true" focusable="false"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg> : null
}

/** Latest vs normal (D-38): each row opens the metric detail; the Previous switch adds a hollow marker and the "Before" line. */
export function LatestList({ readings, thresholds, ready }: { readings: Reading[]; thresholds: (Range & { key: string })[]; ready: boolean }) {
  const [showPrev, setShowPrev] = useState(false)
  const latest = latestByTest(readings)
  const any = latest.some((r) => previousReading(readings, r.test))
  return (
    <section aria-labelledby="lvn">
      <div className="hv-lvn-h">
        <h2 className="hd" id="lvn">Latest vs normal</h2>
        {any && (
          <button type="button" className="hv-sw" role="switch" aria-checked={showPrev} onClick={() => setShowPrev((p) => !p)}>
            <span className="hv-sw-t" aria-hidden="true" />
            Previous
          </button>
        )}
      </div>
      {ready && latest.length === 0 ? null : (
        <div className="grp">
          {latest.map((r) => {
            const fam = thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
            const v = latestVsNormal(r, fam)
            const st = rangeState(v.headline)
            const hist = readings.filter((x) => x.test === r.test)
            const spark = sparkPath(hist)
            const prev = previousReading(readings, r.test)
            const layout = barLayout(r.value, showPrev && prev ? prev.value : null, effectiveRange(r, fam).range)
            return (
              <div className="row hv-row" key={r.test} data-test={r.test} style={{ alignItems: 'flex-start' }} onClick={() => open(r.test)}>
                <span className="grow">
                  <a className="hv-open" href={`#health/metric/${r.test}`} onClick={(e) => e.stopPropagation()}>{metricLabel(r.test)}</a>
                  <span className={`hv-state ${v.headline}`}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>
                  {layout.band && (
                    <span className="hv-bar" aria-hidden="true">
                      <i className="hv-band" style={{ left: `${layout.band.from}%`, width: `${layout.band.to - layout.band.from}%` }} />
                      {layout.prev != null && <i className="hv-dot prev" style={{ left: `${layout.prev}%` }} />}
                      <i className={`hv-dot now ${v.headline}${layout.edge ? ' edge' : ''}`} style={{ left: `${layout.now}%` }} />
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
                  <Spark path={spark} />
                  {spark && <small className="hv-last">Last {sparkCount(hist)}</small>}
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
