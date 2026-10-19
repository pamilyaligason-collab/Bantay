import { Icon } from '../shell/Icon'
import { smsNumber } from '../sos/sms'
import { show } from './card'
import { useMedicalId } from './useMedicalId'
import './medid.css'

const initial = (n: string) => (n.trim().charAt(0) || '?').toUpperCase()

/** Mockup medid: one large, readable card from the person's profile. Works offline (cached). */
export default function MedicalId() {
  const { card, photo, fromCache, ready } = useMedicalId()
  const sub = card.age !== null ? `${card.age} years old` : ''
  return (
    <div className="sh mid">
      <div className="sh-row">
        <a className="sh-iconbtn" href="#safety" aria-label="Back to Safety"><Icon name="back" /></a>
        <div className="sh-grow"><h1 className="sh-h2">Medical ID</h1><div className="sh-sub">Works without internet</div></div>
      </div>
      {!ready ? <div className="mid-card" aria-busy="true">Loading...</div> : (
        <div className="mid-card">
          <div className="mid-head">
            <span className="mid-av">{photo ? <img src={photo} alt="" /> : initial(card.name)}</span>
            <div className="mid-who"><b>{card.name || 'Me'}</b><div>{sub || 'Birthday not added'}</div></div>
            <Icon name="cross" size={30} />
          </div>
          <dl className="mid-dl">
            <div><dt>Blood type</dt><dd>{show(card.bloodType)}</dd></div>
            <div><dt>Allergies</dt><dd className="mid-red">{show(card.allergies)}</dd></div>
            <div><dt>Conditions</dt><dd>{show(card.conditions)}</dd></div>
            <div><dt>Medicines</dt><dd>{show(card.medicines)}</dd></div>
            <div><dt>Call</dt><dd>
              {card.calls.length
                ? card.calls.map((c) => <a key={c.phone} className="mid-call" href={`tel:${smsNumber(c.phone)}`}>{c.name} · {c.phone}</a>)
                : 'Not added'}
            </dd></div>
          </dl>
        </div>
      )}
      {fromCache && <p className="sh-sub">Showing what was saved on this phone.</p>}
      {ready && card.missing.length > 0 && (
        <a className="mid-edit" href="#me">Add the missing answers in Me</a>
      )}
      <div className="sh-card mid-tip">
        <b>Show on lock screen</b>
        <p className="sh-sub">Anyone helping you can read your Medical ID without your PIN. On Android, open Settings, then Safety and emergency, then Medical information, and add the same details. Bantay cannot do this step for you.</p>
      </div>
    </div>
  )
}
