import { useState } from 'react'
import { db } from '../../db'
import { formatNumber } from '../../lib/labFormat'
import { labInfo, labVerdict, lastThree } from './labsLogic'
import { metricLabel, shortDate } from './model'
import { articleHref } from './library/medline'
import type { Range, Reading } from './ranges'
import { Icon } from '../shell/Icon'

const kvGet = async (key: string): Promise<string[]> => { try { const v = (await db.kv.get(key))?.value; return Array.isArray(v) ? (v as string[]) : [] } catch { return [] } }

/** Lab detail (session 8): what the test measures, the last three results, and questions to ask the doctor. Text is a static map marked for clinician review. */
export function LabDetail({ code, readings, family, personId }: { code: string; readings: Reading[]; family?: Range | null; personId: string }) {
  const info = labInfo(code)
  const last = lastThree(readings, code, family)
  const [added, setAdded] = useState(false)
  // Same list the Visits screen reads (visits.questions.<person>); questions already there are not added twice.
  const add = async () => {
    if (!personId) return
    const key = `visits.questions.${personId}`
    const have = await kvGet(key)
    try { await db.kv.put({ key, value: [...have, ...info.questions.filter((q) => !have.includes(q))] }); setAdded(true) } catch { /* stays unadded, the button remains */ }
  }
  return (
    <>
      <section aria-labelledby="ld-what" data-testid="lab-measures">
        <h2 className="hd" id="ld-what">What this test measures</h2>
        <div className="grp"><div className="row"><span className="grow">{info.measures}</span></div>
          {info.known && <div className="row"><a href={articleHref('s', metricLabel(code))} style={{ color: 'var(--act)', fontWeight: 600 }}>Read more</a></div>}</div>
      </section>
      {last.length > 0 && (
        <section aria-labelledby="ld-last" data-testid="lab-last3">
          <h2 className="hd" id="ld-last">Your last {last.length === 1 ? 'result' : `${last.length} results`}</h2>
          <div className="grp">
            {last.map((x, i) => {
              const v = labVerdict(x.pos)
              return (
                <div className="row" key={`${x.takenAt}:${i}`} style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong className="lr-val">{formatNumber(x.value)}{x.unit ? <small> {x.unit}</small> : null}</strong>
                    <span className="sub" style={{ display: 'block' }}>{shortDate(x.takenAt)}{x.move ? `, ${x.move}` : ''}</span>
                  </span>
                  {v ? <span className={`lr-verdict ${x.pos}`}><Icon name={v.icon} size={20} />{v.word}</span> : <span className="lr-verdict none">No range</span>}
                </div>
              )
            })}
          </div>
        </section>
      )}
      <section aria-labelledby="ld-ask" data-testid="lab-questions">
        <h2 className="hd" id="ld-ask">Questions to ask your doctor</h2>
        <div className="grp">
          {info.questions.map((q) => <div className="row" key={q}><span className="grow">{q}</span></div>)}
          {personId && (
            <div className="row">
              {added
                ? <span className="grow" role="status"><Icon name="check" size={20} /> Added. <a href="#health/visits" style={{ color: 'var(--act)' }}>Open your visit list</a></span>
                : <button type="button" className="btn2" onClick={() => void add()}>Add to visit list</button>}
            </div>
          )}
        </div>
        <p className="sub" style={{ margin: '8px 4px 0' }}>General questions, not medical advice.</p>
      </section>
    </>
  )
}
