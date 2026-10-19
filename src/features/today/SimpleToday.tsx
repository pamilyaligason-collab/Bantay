import { normalizeContacts, validPhone } from '../sos/contacts'
import { loadFamily } from '../auth/family'
import { useKv } from '../safety/store'
import Hero from './Hero'

/** Simple mode (Me switch `mode.simple`): the one hero card and three big buttons. Call family rings the first SOS contact; with none saved it opens Safety to add one. */
export default function SimpleToday({ onOk, onTaken }: { onOk: () => void; onTaken: (name: string) => void }) {
  const raw = useKv<unknown>('sos.contacts', [])
  const phone = normalizeContacts(raw, loadFamily()).find((c) => validPhone(c.phone))?.phone.replace(/[^\d+]/g, '')
  return (
    <div className="td-simple">
      <Hero onOk={onOk} onTaken={onTaken} />
      <div className="td-big-btns">
        <button type="button" className="td-bigbtn ok" onClick={onOk}>I&apos;m OK</button>
        <a className="td-bigbtn call" href={phone ? `tel:${phone}` : '#safety'}>{phone ? 'Call family' : 'Add a family number'}</a>
        <a className="td-bigbtn sos" href="#safety">SOS</a>
      </div>
    </div>
  )
}
