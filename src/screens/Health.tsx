import { GUIDE, latestByTest, latestVsNormal } from '../features/health/ranges'
import { testLabel, useHealthData } from '../features/records/useHealthData'

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const

export default function Health() {
  const { ready, people, personId, setPersonId, readings, thresholds } = useHealthData()
  const latest = latestByTest(readings)
  return (
    <>
      <div className="hdr">
        <h1>Health</h1>
        <span>Your health, in one place</span>
      </div>
      {people.length > 1 && (
        <label className="sub" style={{ padding: '0 4px' }}>
          Person{' '}
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ font: 'inherit', minHeight: 44 }}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <section aria-labelledby="lvn">
        <h2 className="hd" id="lvn">Latest vs normal</h2>
        {ready && latest.length === 0 ? (
          <div className="grp">
            <div className="row">
              <span className="grow">
                No results yet
                <span className="sub">Lab results you confirm will show here with the lab&apos;s own range.</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="grp">
            {latest.map((r) => {
              const v = latestVsNormal(r, thresholds.find((t) => t.key === `${r.personId}:${r.test}`))
              return (
                <div className="row" key={r.test} data-test={r.test} style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <span>{testLabel(r.test, GUIDE)}</span>
                    <span className="sub">{v.lab.text ? `Lab range: ${v.lab.text}` : 'Lab range: not printed'}</span>
                    {v.family && <span className="sub">Family limit: {v.family.text}</span>}
                    {v.guide && (
                      <span className="sub">
                        {v.guide.label}: {v.guide.text}.{' '}
                        <a href={v.guide.url} target="_blank" rel="noreferrer" style={{ color: 'var(--act)' }}>
                          {v.guide.source}, {v.guide.year}
                          <span style={HIDDEN}> (opens in new tab)</span>
                        </a>
                      </span>
                    )}
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
    </>
  )
}
