import { useState } from 'react'
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
  const [phones, setPhones] = useState(false)
  const showPhones = member?.role === 'admin' || carerIds.length > 0
  if (phones) {
    return (
      <Group title="Family phones" testId="settings-phones">
        <FamilyPhones people={roster.filter((p) => !p.isMe)} onBack={() => setPhones(false)} onMessage={() => { location.hash = '#family/messages' }} />
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
          <NavRow icon="phone" title="Family phones" sub="Can each phone wake its owner for alarms?" onClick={() => setPhones(true)} />
        </div>
      )}
    </Group>
  )
}
