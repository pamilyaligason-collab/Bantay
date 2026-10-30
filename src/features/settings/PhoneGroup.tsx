import { useEffect, useState } from 'react'
import { useCarerIds } from '../family/CarerCards'
import FamilyPhones from '../family/FamilyPhones'
import SensorSettings from '../sensors/SensorSettings'
import SetupCard from '../today/SetupCard'
import Group, { NavRow } from './Group'
import { useAccount } from './useAccount'

/** Settings > Phone (#me/phone): Health Connect and sensors, the setup list, and the Family phones check (carers and admins). */
export default function PhoneGroup() {
  const { member, roster } = useAccount()
  const carerIds = useCarerIds()
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const phones = /^#me\/phone\/phones/.test(hash) // a real route, so the hardware Back returns to the Phone group
  const showPhones = member?.role === 'admin' || carerIds.length > 0
  if (phones) {
    return (
      <Group title="Family phones" testId="settings-phones" backHref="#me/phone" backLabel="Back to Phone">
        <FamilyPhones people={roster.filter((p) => !p.isMe)} onBack={() => { location.hash = '#me/phone' }} onMessage={() => { location.hash = '#family/messages' }} />
      </Group>
    )
  }
  return (
    <Group title="Phone" testId="settings-phone">
      <div className="sh-me-sensors"><SensorSettings /></div>
      <div className="sh-me-setup">
        <div className="sh-sech"><b>Setup checklist</b></div>
        <SetupCard />
      </div>
      {showPhones && (
        <div className="sh-card sh-list st-list">
          <NavRow icon="phone" title="Family phones" sub="Can each phone wake its owner for alarms?" href="#me/phone/phones" />
        </div>
      )}
    </Group>
  )
}
