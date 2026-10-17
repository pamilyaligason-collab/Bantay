import { useEffect, useRef, useState } from 'react'
import { GUIDE } from '../features/health/ranges'
import { testLabel, useHealthData } from '../features/records/useHealthData'

export default function Records({ embedded = false }: { embedded?: boolean }) {
  const { ready, readings, consults } = useHealthData()
  const [test, setTest] = useState('')
  const tests = [...new Set(readings.map((r) => r.test))].sort()
  const picked = test && tests.includes(test) ? test : (tests[0] ?? '')
  const series = readings.filter((r) => r.test === picked)
  const signature = series.map((r) => `${r.id}:${r.takenAt}:${r.value}`).join('|')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el || series.length === 0) return
    let chart: { destroy(): void; setSize(o: { width: number; height: number }): void } | undefined
    let live = true
    const ro = new ResizeObserver(() => chart?.setSize({ width: Math.max(el.clientWidth, 200), height: 150 }))
    ro.observe(el)
    // uPlot touches matchMedia at import, so load it only when a chart is drawn.
    import('../features/records/trend').then((m) => {
      if (!live) return
      el.innerHTML = ''
      chart = m.trendChart(el, series, Math.max(el.clientWidth, 200))
    })
    return () => {
      live = false
      ro.disconnect()
      chart?.destroy()
    }
  }, [picked, signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = new Map<string, { tests: typeof readings; consults: typeof consults }>()
  const day = (d: string) => days.get(d) ?? { tests: [], consults: [] }
  for (const r of readings) days.set(r.takenAt.slice(0, 10), { ...day(r.takenAt.slice(0, 10)), tests: [...day(r.takenAt.slice(0, 10)).tests, r] })
  for (const c of consults) days.set(c.takenAt.slice(0, 10), { ...day(c.takenAt.slice(0, 10)), consults: [...day(c.takenAt.slice(0, 10)).consults, c] })
  const dates = [...days.keys()].sort().reverse()

  return (
    <>
      {!embedded && <div className="hdr"><h1>Records</h1></div>}
      {ready && dates.length === 0 ? (
        <div className="grp">
          <div className="row">
            <span className="grow">
              No records yet
              <span className="sub">Confirmed lab results and doctor visits will appear here, newest first.</span>
            </span>
          </div>
        </div>
      ) : (
        <>
          <section aria-labelledby="trend">
            <h2 className="hd" id="trend">Trend</h2>
            <div className="grp" style={{ padding: 16 }}>
              <label className="sub">
                Test{' '}
                <select value={picked} onChange={(e) => setTest(e.target.value)} style={{ font: 'inherit', minHeight: 44 }}>
                  {tests.map((t) => (
                    <option key={t} value={t}>
                      {testLabel(t, GUIDE)}
                    </option>
                  ))}
                </select>
              </label>
              {series.length < 2 && <p className="sub">Add one more result to see a trend line.</p>}
              <div ref={box} role="img" aria-label={`Trend of ${testLabel(picked, GUIDE)} over time`} style={{ overflow: 'hidden', minHeight: 150 }} />
            </div>
          </section>
          <section aria-labelledby="tl">
            <h2 className="hd" id="tl">Timeline</h2>
            <div className="grp" data-testid="timeline">
              {dates.map((d) => (
                <div className="row" key={d} style={{ alignItems: 'flex-start' }}>
                  <span className="sub" style={{ width: 92, flex: 'none' }}>{d}</span>
                  <span className="grow">
                    {day(d).consults.map((c) => (
                      <span key={`c${c.id}`}>
                        Doctor visit{c.doctor ? `: ${c.doctor}` : ''}
                        {c.reason && <span className="sub">{c.reason}</span>}
                      </span>
                    ))}
                    {day(d).tests.map((r) => (
                      <span key={`r${r.id}`}>
                        {testLabel(r.test, GUIDE)}: {r.value} {r.unit}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}
