import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { useMemberReport, useReportAccess } from './reportData'
import { type Report as ReportData } from './reportLogic'
import { useFamilyPeople } from './roster'
import './family.css'
import './report.css'

const CELL_WORD = { taken: 'all taken', missed: 'missed', pending: 'still to take', none: 'none due' } as const
const CELL_ICON = { taken: 'check', missed: 'close', pending: 'clock', none: 'more' } as const

function Body({ r, first }: { r: ReportData; first: string }) {
  const a = r.adherence
  const when = new Date().toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <>
      <p className="sub rp-date">Made on {when}. From the readings and doses saved in Bantay.</p>
      {r.empty && <div className="card"><p className="sub fm-empty">Nothing to report yet for {first}. Add readings or medicines in Health and this page fills in.</p></div>}

      {r.vitals.length > 0 && (
        <section aria-labelledby="rp-vitals" data-testid="rp-vitals">
          <h2 className="hd" id="rp-vitals">Vitals</h2>
          <div className="rp-grid">
            {r.vitals.map((v) => (
              <div className="card rp-vital" key={v.key} data-pos={v.pos}>
                <span className="sub">{v.label}</span>
                <b className="rp-val">{v.value}{v.unit ? <small> {v.unit}</small> : null}</b>
                <span className={`lr-verdict ${v.pos}`}><Icon name={v.icon} size={20} />{v.word}</span>
                <span className="sub">{v.on}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.hasMeds && (
        <section aria-labelledby="rp-meds" data-testid="rp-meds">
          <h2 className="hd" id="rp-meds">Medicines, last 7 days</h2>
          <div className="card">
            <div className="rp-tot"><b>Medicines</b><b>{a.due > 0 ? `${a.taken} of ${a.due} doses` : 'No doses due yet'}</b></div>
            <ul className="rp-cells" aria-label="Doses by day">
              {a.cells.map((c) => (
                <li key={c.day} className={`rp-cell ${c.state}`} data-state={c.state} aria-label={`${c.label}: ${CELL_WORD[c.state]}`}>
                  <i><Icon name={CELL_ICON[c.state]} size={18} /></i>
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
            {a.missed.length > 0
              ? <p className="sub rp-missed">Missed: {a.missed.map((m) => `${m.names.join(', ')} on ${m.label}`).join('; ')}.</p>
              : <p className="sub rp-missed">No missed doses this week.</p>}
          </div>
        </section>
      )}

      {r.labs.total > 0 && (
        <section aria-labelledby="rp-labs" data-testid="rp-labs">
          <h2 className="hd" id="rp-labs">Labs to ask about</h2>
          <div className="card">
            {r.labs.flagged.length === 0
              ? <p className="sub fm-empty">None of the {r.labs.total} saved lab results is outside its usual range.</p>
              : r.labs.flagged.map((l) => (
                <div className="rp-lab" key={l.test}>
                  <span className="grow"><b>{l.name}</b> <span className="rp-val2">{l.value}{l.unit ? ` ${l.unit}` : ''}</span><span className="sub"> {l.on}</span></span>
                  <span className={`lr-verdict ${l.icon === 'up' ? 'above' : 'below'}`}><Icon name={l.icon} size={20} />{l.word}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {r.bring.length > 0 && (
        <section aria-labelledby="rp-bring" data-testid="rp-bring">
          <h2 className="hd" id="rp-bring">Things to bring up</h2>
          <div className="card">
            <ol className="rp-bring">{r.bring.map((t, i) => <li key={i}>{t}</li>)}</ol>
            <p className="sub">Questions to ask, made by Bantay from the numbers above and your saved questions. Not medical advice.</p>
          </div>
        </section>
      )}
    </>
  )
}

/** #family/people/<id>/report: one page a carer can read or print for the doctor. Only people the readings RLS lets through (the person, a carer, an admin) see it. */
export default function Report({ id }: { id: string }) {
  const { people } = useFamilyPeople()
  const access = useReportAccess(id)
  const p = people.find((x) => x.id === id)
  const first = p ? (p.name.trim().split(/\s+/)[0] ?? p.name) : 'this person'
  const report = useMemberReport(access ? id : '')
  const back = `#family/people/${id}`

  if (access === null) return <><SubHeader title="Report" backHref={back} backLabel="Back to member" /><p className="sub" role="status">Checking access</p></>
  if (!access) {
    return (
      <>
        <SubHeader title="Report" backHref={back} backLabel="Back to member" />
        <div className="card" data-testid="rp-denied" role="alert"><b>You do not have access to this report</b><p className="sub">Only {first}, the people who care for {first}, and the admins can open it.</p></div>
      </>
    )
  }
  return (
    <div className="rp" data-testid="report">
      <SubHeader title={p ? `${first}'s report` : 'Report'} backHref={back} backLabel="Back to member" />
      <h2 className="rp-print-title">{p?.name ?? 'Health report'}</h2>
      <Body r={report} first={first} />
      <div className="rp-actions no-print">
        <button type="button" className="btn" onClick={() => window.print()}><Icon name="dl" size={22} />Print or save as PDF for the doctor</button>
      </div>
      <p className="sub rp-privacy"><Icon name="shield" size={18} /> Private. Only {first}, the people who care for {first} and the admins can see this report. Printing it makes a copy outside Bantay, so keep it safe.</p>
    </div>
  )
}
