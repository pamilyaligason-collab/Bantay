import { SensorSettings } from '../features/sensors'
import { PhoneSettings } from '../features/auth/PhoneSettings'

export default function Family() {
  return (
    <>
      <div className="hdr">
        <h1>Family</h1>
      </div>
      <SensorSettings />
      <PhoneSettings />
    </>
  )
}
