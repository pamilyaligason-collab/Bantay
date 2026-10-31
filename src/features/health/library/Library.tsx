import { useMemo, useState } from 'react'
import { PersonChips } from '../../records/PersonChips'
import { SubHeader } from '../../shell/SubHeader'
import { useProfile } from '../../setup/useProfile'
import { isLive, normaliseDrug } from '../meds'
import { useHealthPerson } from '../useHealthPerson'
import { useMedications } from '../useMedications'
import { articleHref, SOURCE_LINE } from './medline'
import '../health.css'
import '../m7a.css'

const NO_DRAFTS: Record<string, number> = {}
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/** #discover/learn/library (was #health/library): articles for this person's conditions and medicines (MedlinePlus), plus a search. Opening one makes one request. */
export default function Library() {
  const { people, ownId, personId, setPersonId } = useHealthPerson()
  const profile = useProfile(personId)
  const meds = useMedications(personId)
  const [q, setQ] = useState('')
  const name = people.find((p) => p.id === personId)?.name ?? ''
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
  const go = () => { const t = q.trim(); if (t) location.hash = articleHref('s', t) }

  return (
    <>
      <SubHeader title="Health library" backHref="#discover/learn" backLabel="Back to Learn" />
      <PersonChips people={people} ownId={ownId} personId={personId} drafts={NO_DRAFTS} onPick={setPersonId} />
      <form className="lb-search" role="search" onSubmit={(e) => { e.preventDefault(); go() }}>
        <label htmlFor="lb-q" className="hv-sr">Search conditions, medicines, tests</label>
        <input id="lb-q" type="search" placeholder="Search conditions, medicines" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn2 wz-sm">Search</button>
      </form>
      {name && <p className="sub" style={{ margin: '4px 4px 0' }}>For <b style={{ color: 'var(--ink)' }}>{name}</b></p>}
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
      <p className="sub lb-src">{SOURCE_LINE}. English only for now.</p>
    </>
  )
}
