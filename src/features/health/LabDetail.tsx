import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { formatNumber } from '../../lib/labFormat'
import { labDate, labInfo, labNum, labRow, labVerdict, lastThree, rangeSource, sourceIndex, trendOfLastThree } from './labsLogic'
import { LabBar, VerdictChip } from './LabsList'
import { metricLabel } from './model'
import { articleHref } from './library/medline'
import type { Range, Reading } from './ranges'
import { dayWords } from './visitsLogic'
import { useVisits } from './useVisits'
import { Icon } from '../shell/Icon'
import { OriginalLink } from '../records/ConfirmSheet'
import { useConfirmedDocs } from '../records/useRecordsServer'

const kvGet = async (key: string): Promise<string[]> => { try { const v = (await db.kv.get(key))?.value; return Array.isArray(v) ? (v as string[]) : [] } catch { return [] } }

/** Lab detail (mockup v8 health-labdetail): the top card (value, range bar, whose range, date, the paper), what the test means, the last three results with their trend, and questions to ask with one Add each. Text is a static map marked for clinician review. */
export function LabDetail({ code, readings, family, personId }: { code: string; readings: Reading[]; family?: Range | null; personId: string }) {
  const info = labInfo(code)
  const docs = useConfirmedDocs(personId)
  const sources = useMemo(() => sourceIndex(docs), [docs])
  const visit = useVisits(personId).next
  const last = lastThree(readings, code, family)
  const latest = readings.filter((r) => r.test === code && Number.isFinite(Date.parse(r.takenAt))).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  const row = latest ? labRow(latest, family) : null
  const src = latest ? rangeSource(latest, family) : null
  const paper = latest?.sourceFileId ? sources.get(latest.sourceFileId) : undefined
  // Same list the Visits screen reads (visits.questions.<person>); a question already there shows as added and is never added twice.
  const key = `visits.questions.${personId}`
  const [added, setAdded] = useState<string[]>([])
  useEffect(() => { if (personId) void kvGet(key).then((have) => setAdded(info.questions.filter((q) => have.includes(q)))) }, [key, personId, info.questions])
  const add = async (q: string) => {
    if (!personId) return
    try {
      // one transaction so two quick adds both land (read then write was last-writer-wins)
      await db.transaction('rw', db.kv, async () => {
        const have = await kvGet(key)
        if (!have.includes(q)) await db.kv.put({ key, value: [...have, q] })
      })
      setAdded((a) => [...a, q])
    } catch { /* stays unadded, the button remains */ }
  }
  return (
    <>
      {latest && row && (
        <section className="grp lb-top" aria-label="Latest result" data-testid="lab-top">
          <span className="lr-top">
            <span className="lr-val lb-big">{labNum(latest.value)}{latest.unit ? <small> {latest.unit}</small> : null}</span>
            <VerdictChip row={row} />
          </span>
          <LabBar row={row} />
          <span className="lr-foot">
            <span className="lr-rng" data-testid="lab-range">{src ? src.text : 'No range printed on the paper'}</span>
            <span className="lr-date" data-testid="lab-date">{labDate(latest.takenAt, true)}</span>
          </span>
          {paper ? <span className="sub">Source: {paper.facility || 'lab paper'}, {labDate(paper.docDate ?? latest.takenAt, true)}</span> : <span className="sub">Source: lab paper, {labDate(latest.takenAt, true)}</span>}
          {paper ? <OriginalLink file={paper.file} /> : <a className="rx-open" href="#health/papers">Open Papers</a>}
        </section>
      )}
      <section aria-labelledby="ld-what" data-testid="lab-measures">
        <h2 className="hd" id="ld-what">What it means</h2>
        <div className="grp"><div className="row"><span className="grow">{info.measures}</span></div>
          {info.known && <div className="row"><a href={articleHref('s', metricLabel(code))} style={{ color: 'var(--act)', fontWeight: 600 }}>Read more</a></div>}</div>
      </section>
      {last.length > 0 && (
        <section aria-labelledby="ld-last" data-testid="lab-last3">
          <div className="lb-h"><h2 className="hd" id="ld-last">{last.length === 1 ? 'Last result' : `Last ${last.length} results`}</h2>{trendOfLastThree(last) && <span className="sub">{trendOfLastThree(last)}</span>}</div>
          <div className="grp">
            {last.map((x, i) => {
              const v = labVerdict(x.pos)
              return (
                <div className="row" key={`${x.takenAt}:${i}`} style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong className="lr-val">{formatNumber(x.value)}{x.unit ? <small> {x.unit}</small> : null}</strong>
                    <span className="sub" style={{ display: 'block' }}>{labDate(x.takenAt, true)}{x.move ? `, ${x.move}` : ''}</span>
                  </span>
                  {v ? <span className={`lr-verdict ${x.pos}`}><Icon name={v.icon} size={20} />{v.word}</span> : <span className="lr-verdict none">No range</span>}
                </div>
              )
            })}
          </div>
        </section>
      )}
      <section aria-labelledby="ld-ask" data-testid="lab-questions">
        <div className="lb-h"><h2 className="hd" id="ld-ask">Questions to ask your doctor</h2><span className="sub" data-testid="lab-visit">{visit ? dayWords(visit.day) : 'No visit booked yet'}</span></div>
        <div className="grp">
          {info.questions.map((q) => (
            <div className="row lb-q" key={q}>
              <Icon name="msg" size={20} />
              <span className="grow">{q}</span>
              {personId && (added.includes(q)
                ? <span role="status" className="sub"><Icon name="check" size={20} /> Added</span>
                : <button type="button" className="btn2" aria-label={`Add to visit list: ${q}`} onClick={() => void add(q)}>Add</button>)}
            </div>
          ))}
          {added.length > 0 && <div className="row"><a href="#health/visits" style={{ color: 'var(--act)' }}>Open your visit list</a></div>}
        </div>
        <p className="sub" style={{ margin: '8px 4px 0' }}>General questions, not medical advice. A result outside the range is a question for your doctor, not a diagnosis.</p>
      </section>
    </>
  )
}
