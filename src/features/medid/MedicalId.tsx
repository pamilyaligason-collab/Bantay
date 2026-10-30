import { Icon } from '../shell/Icon'
import { smsNumber } from '../sos/sms'
import { show } from './card'
import { useMedicalId } from './useMedicalId'
import './medid.css'

/** Blank answers show quiet "Not added" text, plus an Add link to Me when the card is the person's own. */
const Val = ({ v, add }: { v: string; add: boolean }) => v === 'Not added' ? <><span className="mid-none">{v}</span>{add && <a className="mid-add" href="#me">Add</a>}</> : <>{v}</>

const initial = (n: string) => (n.trim().charAt(0) || '?').toUpperCase()

/** Mockup medid: one large, readable card from the person's profile. Works offline (cached). */
export default function MedicalId() {
  const hashId = decodeURIComponent(/^#medid\/([^/?]+)/.exec(location.hash)?.[1] ?? '') || null
  const { card, photo, fromCache, ready, other } = useMedicalId(hashId)
  const sub = card.age !== null ? `${card.age} years old` : ''
  return (
    <div className="sh mid">
      <div className="sh-row">
        <a className="sh-iconbtn" href={other ? `#family/people/${hashId}` : '#safety'} aria-label={other ? 'Back' : 'Back to Safety'}><Icon name="back" /></a>
        <div className="sh-grow"><h1 className="sh-h2">Medical ID</h1><div className="sh-sub">Works without internet</div></div>
      </div>
      {!ready ? <div className="mid-card" aria-busy="true">Loading...</div> : (
        <div className="mid-card">
          <div className="mid-head">
            <span className="mid-av">{photo ? <img src={photo} alt="" /> : initial(card.name)}</span>
            <div className="mid-who"><b>{card.name || (other ? 'Family member' : 'Me')}</b><div>{sub || 'Birthday not added'}</div></div>
            <Icon name="cross" size={30} />
          </div>
          <dl className="mid-dl">
            <div><dt>Blood type</dt><dd><Val v={show(card.bloodType)} add={!other} /></dd></div>
            <div><dt>Allergies</dt><dd className={show(card.allergies) === 'Not added' ? undefined : 'mid-red'}><Val v={show(card.allergies)} add={!other} /></dd></div>
            <div><dt>Conditions</dt><dd><Val v={show(card.conditions)} add={!other} /></dd></div>
            <div><dt>Medicines</dt><dd><Val v={show(card.medicines)} add={!other} /></dd></div>
            <div><dt>Call</dt><dd>
              {card.calls.length
                ? card.calls.map((c) => <a key={c.phone} className="mid-call" href={`tel:${smsNumber(c.phone)}`}>{c.name} · {c.phone}</a>)
                : <Val v="Not added" add={!other} />}
            </dd></div>
          </dl>
        </div>
      )}
      {fromCache && <p className="sh-sub">Showing what was saved on this phone.</p>}
      {ready && !other && card.missing.length > 0 && (
        <a className="mid-edit" href="#me">Add the missing answers in Me</a>
      )}
      <div className="sh-card mid-tip">
        <b>Show on lock screen</b>
        <p className="sh-sub">Helpers can read this without your PIN. Also add it in your phone. On Android:</p>
        <ol className="sh-sub" style={{ margin: '4px 0 0', paddingLeft: 22 }}><li>Open Settings.</li><li>Tap Safety and emergency.</li><li>Tap Medical information.</li></ol>
      </div>
    </div>
  )
}
