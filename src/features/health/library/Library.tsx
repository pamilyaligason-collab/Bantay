import { useMemo, useState } from 'react'
import { WhoLine } from '../WhoLine'
import { SubHeader } from '../../shell/SubHeader'
import { useProfile } from '../../setup/useProfile'
import { isLive, normaliseDrug } from '../meds'
import { useHealthPerson } from '../useHealthPerson'
import { useMedications } from '../useMedications'
import { articleHref, SOURCE_LINE } from './medline'
import { loadLabGlossary, useLabGlossary } from '../labsLogic'
import '../health.css'
import '../m7a.css'

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/** #discover/learn/library (was #health/library): articles for this person's conditions and medicines (MedlinePlus), plus a search. Opening one makes one request. */
export default function Library() {
  const { personId } =useHealthPerson()
  const profile = useProfile(personId)
  const meds = useMedications(personId)
  const [q, setQ] = useState('')
  const g = useLabGlossary()
  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: { kind: 'c' | 'm'; text: string; label: string; sub: string }[] = []
    for (const c of profile?.conditions ?? []) {
      const k = c.trim().toLowerCase()
      if (k && !seen.has(`c:${k}`)) { seen.add(`c:${k}`); out.push({ kind: 'c', text: c.trim(), label: title(c.trim()), sub: 'Condition' }) }
    }
    for (const m of meds.filter(isLive)) {
      const text = normaliseDrug(m.genericName) ?? normaliseDrug(m.name)
      if (text && !seen.has(`m:${text}`)) { seen.add(`m:${text}`); out.push({ kind: 'm', text, label: title(text), sub: 'Medicine' }) }
    }
    return out
  }, [profile, meds])
  const go = async () => { const t = q.trim(); const lab = t ? (await loadLabGlossary().catch(() => null))?.labEntry(t) : null; if (lab) location.hash = articleHref('t', lab.code); else if (t) location.hash = articleHref('s', t) }

  return (
    <>
      <SubHeader title="Health library" backHref="#discover/learn" backLabel="Back to Learn" />
      <WhoLine />
      <form className="lb-search" role="search" onSubmit={(e) => { e.preventDefault(); void go() }}>
        <label htmlFor="lb-q" className="hv-sr">Search conditions, medicines, tests</label>
        <input id="lb-q" type="search" placeholder="Search conditions, medicines" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn2 wz-sm">Search</button>
      </form>
      {items.length === 0 ? (
        <div className="card rf-hero" data-testid="library-empty"><b>Nothing to suggest yet</b><span className="sub">Add a medicine or a condition to the profile and its articles show here. You can still search above.</span></div>
      ) : (
        <ul className="grp lb-list" aria-label="Articles for this person">
          {items.map((i) => (
            <li key={`${i.kind}:${i.text}`}>
              <a className="row hl-row" href={articleHref(i.kind, i.text)}>
                <span className="grow"><b>{i.label}</b><span className="sub">{i.sub} · MedlinePlus</span></span>
                <span className="hl-go" aria-hidden="true">&rsaquo;</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <h2 className="hd" id="lib-labs">Lab tests</h2>
      {!g && <p className="sub" role="status">Loading...</p>}
      <ul className="grp lb-list" aria-labelledby="lib-labs" data-testid="library-labs">
        {(g?.LAB_GLOSSARY ?? []).map((e) => (
          <li key={e.code}>
            <a className="row hl-row" href={articleHref('t', e.code)}>
              <span className="grow"><b>{e.name}</b><span className="sub">{e.organ} · MedlinePlus</span></span>
              <span className="hl-go" aria-hidden="true">&rsaquo;</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="sub lb-src">{SOURCE_LINE}. English only for now.</p>
    </>
  )
}
