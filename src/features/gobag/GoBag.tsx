import { Icon } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { GROUPS, ALL_IDS } from './items'
import { dueAgain, EMPTY, KEY, readState, toggle } from './state'
import './gobag.css'

/** Mockup gobag: tick what is packed. Saved on this phone only. */
export default function GoBag() {
  const [raw, setRaw, loaded] = useKv<unknown>(KEY, EMPTY)
  const s = readState(raw)
  const now = Date.now()
  const pct = Math.round((s.done.length / ALL_IDS.length) * 100)
  const last = s.checkedAt ? new Date(s.checkedAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  return (
    <div className="sh gb">
      <div className="sh-row">
        <a className="sh-iconbtn" href="#safety" aria-label="Back to Safety"><Icon name="back" /></a>
        <div className="sh-grow"><h1 className="sh-h2">Go-bag</h1><div className="sh-sub">{s.done.length} of {ALL_IDS.length} packed</div></div>
      </div>
      <div className="gb-bar" role="progressbar" aria-label="Go-bag packed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
      {loaded && (
        <p className={`gb-when${dueAgain(s, now) ? ' due' : ''}`} role="status">
          {last ? `Last checked ${last}. ` : 'Not checked yet. '}{dueAgain(s, now) ? 'Time to check your bag again.' : 'Check again every 3 months.'}
        </p>
      )}
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="gb-h">{g.title}</h2>
          <ul className="gb-list">
            {g.items.map((i) => {
              const on = s.done.includes(i.id)
              return (
                <li key={i.id}>
                  <button type="button" role="checkbox" aria-checked={on} className={`gb-item${on ? ' on' : ''}`} onClick={() => loaded && setRaw(toggle(s, i.id, Date.now()))}>
                    <span className="gb-box" aria-hidden="true">{on && <Icon name="check" size={20} />}</span>
                    <span>{i.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <p className="sh-sub">Based on the NDRRMC family go-bag guide. Check expiry dates on medicines, food and batteries every 3 months.</p>
    </div>
  )
}
