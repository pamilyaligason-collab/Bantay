import { KEY_PHONE_CHECK } from '../phonecheck/keys'
import PhoneWarnings, { PW_KEY, type Rec } from './PhoneWarnings'
import { alarmsHealth, callHealth, type Health, type PhoneCheck } from './stormMode'
import { useKv } from './store'
import './safety.css'

const STATE: Record<Health, [string, string]> = { ok: ['On', 'sf-chip'], fix: ['Needs fixing', 'sf-chip warn'], unknown: ['Not checked', 'sf-chip'] }

function Row({ title, sub, h }: { title: string; sub: string; h: Health }) {
  return (
    <div className="sf-prow">
      <span className="sf-prow-t"><b>{title}</b><span className="sub">{sub}</span></span>
      <span className={STATE[h][1]}>{STATE[h][0]}</span>
    </div>
  )
}

/** safety-phonewarn: what is set on this phone (the phone check, and what the person told us about the phone's own emergency alerts), then the steps. */
export default function PhoneAlertsPage() {
  const check = useKv<PhoneCheck | null>(KEY_PHONE_CHECK, null)
  const rec = useKv<Rec | null>(PW_KEY, null)
  const told = (id: string): Health => (rec?.items?.[id]?.state === 'on' ? 'ok' : rec?.items?.[id] ? 'fix' : 'unknown')
  return (
    <div className="sf">
      <p className="sub" style={{ margin: '0 4px' }}>Make sure your phone alerts you. The government alerts come from your phone, not from Bantay.</p>
      <div className="sf-pcard">
        <Row title="Emergency alerts" sub="Government alerts sound even on silent" h={told('android-wea')} />
        <Row title="Earthquake alerts" sub="Needs turning on in your phone settings" h={told('android-eq')} />
        <Row title="Medicine alarms" sub="Ring on time on this phone" h={alarmsHealth(check)} />
        <Row title="Bantay can open the phone and text apps" sub="Needed for Hold for help" h={callHealth(check)} />
      </div>
      <PhoneWarnings level={2} />
      <p className="sub" style={{ margin: '0 4px' }}>On iPhone: Settings, Notifications, scroll to Government Alerts. Steps differ by phone brand.</p>
    </div>
  )
}
