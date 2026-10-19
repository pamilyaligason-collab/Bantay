import { useState } from 'react'
import { latestByTest, latestVsNormal, type Range, type Reading } from './ranges'
import { barLayout, beforeLine, effectiveRange, metricLabel, previousReading } from './model'

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const open = (code: string) => { location.hash = `#health/metric/${code}` }

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
      {ready && latest.length === 0 ? (
        <div className="grp">
          <div className="row">
            <span className="grow">
              No results yet
              <span className="sub">Confirm imported results in Family &gt; Records, or log a reading from Today. They show here with the lab&apos;s own range.</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="grp">
          {latest.map((r) => {
            const fam = thresholds.find((t) => t.key === `${r.personId}:${r.test}`)
            const v = latestVsNormal(r, fam)
            const prev = previousReading(readings, r.test)
            const layout = barLayout(r.value, showPrev && prev ? prev.value : null, effectiveRange(r, fam).range)
            return (
              <div className="row hv-row" key={r.test} data-test={r.test} style={{ alignItems: 'flex-start' }} onClick={() => open(r.test)}>
                <span className="grow">
                  <a className="hv-open" href={`#health/metric/${r.test}`} onClick={(e) => e.stopPropagation()}>{metricLabel(r.test)}</a>
                  <span className="sub">{v.lab.text ? `Lab range: ${v.lab.text}` : 'Lab range: not printed'}</span>
                  {v.family && <span className="sub">Family limit: {v.family.text}</span>}
                  {v.guide && (
                    <span className="sub">
                      {v.guide.label}: {v.guide.text}.{' '}
                      <a href={v.guide.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }} onClick={(e) => e.stopPropagation()}>
                        {v.guide.source}, {v.guide.year}
                        <span style={HIDDEN}> (opens in new tab)</span>
                      </a>
                    </span>
                  )}
                  {layout.band && (
                    <span className="hv-bar" aria-hidden="true">
                      <i className="hv-band" style={{ left: `${layout.band.from}%`, width: `${layout.band.to - layout.band.from}%` }} />
                      {layout.prev != null && <i className="hv-dot prev" style={{ left: `${layout.prev}%` }} />}
                      <i className={`hv-dot now ${v.headline}`} style={{ left: `${layout.now}%` }} />
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
                <span style={{ textAlign: 'right' }}>
                  <strong>
                    {r.value} {r.unit}
                  </strong>
                  <span className="sub" style={{ display: 'block' }}>{v.headlineText}</span>
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
