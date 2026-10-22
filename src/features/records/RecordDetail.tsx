import { useEffect, useRef, useState } from 'react'
import { getMember } from '../auth/session'
import { formatLabValue, labName, providerName } from '../../lib/labFormat'
import { latestVsNormal, rangeState } from '../health/ranges'
import type { DocBundle } from './api'
import { KIND, labRange, OriginalLink } from './ConfirmSheet'
import { MedicineLines } from './MedicineLines'
import '../health/health.css'
import './records.css'

/** A confirmed document: results against the lab's own range, prescription lines, imaging impression, original file. */
export function RecordDetail({ bundle, who, onBack }: { bundle: DocBundle; who: string; onBack(): void }) {
  const { doc } = bundle
  const head = useRef<HTMLHeadingElement>(null)
  const [me, setMe] = useState<string | null>(null)
  useEffect(() => { head.current?.focus() }, [])
  useEffect(() => { void getMember().then((m) => setMe(m?.userId ?? null)).catch(() => {}) }, [])
  const by = doc.confirmed_by ? (doc.confirmed_by === me ? 'you' : 'a family member') : null
  return (
    <section aria-labelledby="rd-h" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div><button className="rx-btn" onClick={onBack}>Back to timeline</button></div>
      <h2 className="hd" id="rd-h" ref={head} tabIndex={-1} style={{ outline: 'none' }}>{KIND[doc.kind] ?? 'Document'}</h2>
      <div className="grp">
        <div className="row"><span className="grow"><span className="sub">Date</span>{doc.doc_date ?? 'Not printed'}</span></div>
        <div className="row"><span className="grow"><span className="sub">Facility</span>{providerName(doc.facility) || 'Not printed'}</span></div>
        <div className="row"><span className="grow"><span className="sub">Person</span>{who}</span></div>
        {doc.confirmed_at && <div className="row"><span className="grow"><span className="sub">Confirmed</span>{`${by ? `by ${by}, ` : ''}${doc.confirmed_at.slice(0, 10)}`}</span></div>}
      </div>

      {bundle.labs.length > 0 && (
        <div className="grp" data-testid="rd-results">
          {bundle.labs.map((l) => {
            const val = l.value_num ?? l.value_text
            const v = l.value_num != null ? latestVsNormal({ personId: doc.person_id, takenAt: l.collected_at ?? doc.doc_date ?? '', test: l.test_code ?? l.name_raw, value: l.value_num, unit: l.unit_raw ?? undefined, labLow: l.ref_low, labHigh: l.ref_high }) : null
            const st = v ? rangeState(v.headline, 'lab') : null
            return (
              <div className="row" key={l.id} style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <span>{labName(l.name_raw)}</span>
                  <span className="sub">{labRange(l) ? `Lab range: ${labRange(l)}` : v?.general ? `General guide, labs differ: ${v.general.text}` : 'Lab range: not printed'}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <strong>{val == null ? 'Not read' : typeof val === 'number' ? formatLabValue(val, l.unit_raw) : `${val} ${l.unit_raw ?? ''}`}</strong>
                  {st && <span className={`hv-state ${v!.headline}`} style={{ display: 'block', width: 'fit-content', marginLeft: 'auto', marginTop: 4 }}>{st.word}{st.hidden && <span className="hv-sr">. {st.hidden}</span>}</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {bundle.items.length > 0 && (
        <section aria-labelledby="rd-rx">
          <h3 className="hd" id="rd-rx">Medicines from prescriptions</h3>
          <MedicineLines items={bundle.items} />
        </section>
      )}
      {bundle.vaccinations.length > 0 && (
        <div className="grp">
          {bundle.vaccinations.map((x) => (
            <div className="row" key={x.id}><span className="grow"><span>{x.vaccine}</span><span className="sub">{[x.dose_no ? `Dose ${x.dose_no}` : '', x.given_on ?? ''].filter(Boolean).join(' · ')}</span></span></div>
          ))}
        </div>
      )}
      {bundle.imaging.length > 0 && (
        <div className="grp">
          {bundle.imaging.map((x) => (
            <div className="row" key={x.id} style={{ alignItems: 'flex-start' }}>
              <span className="grow">
                <span>{[x.modality, x.body_region].filter(Boolean).join(' ') || 'Imaging report'}</span>
                <span className="sub">{x.impression ?? 'No impression printed'}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {bundle.files.map((f) => <OriginalLink key={f.id} file={f} />)}
      <p className="sub" style={{ margin: 0 }}>Ranges are for information only and are not medical advice.</p>
    </section>
  )
}
