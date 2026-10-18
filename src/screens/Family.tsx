import { SensorSettings } from '../features/sensors'
import { PhoneSettings } from '../features/auth/PhoneSettings'
import Records from './Records'

// People | Records switch. The hash (#family / #records) is the source of truth so deep links and Back work.
export default function Family() {
  const records = location.hash === '#records'
  const pick = (h: string) => { if (location.hash !== '#' + h) location.hash = h }
  return (
    <>
      <div className="hdr">
        <h1>Family</h1>
      </div>
      <div className="seg" role="group" aria-label="Family view">
        <button aria-pressed={!records} onClick={() => pick('family')}>People</button>
        <button aria-pressed={records} onClick={() => pick('records')}>Records</button>
      </div>
      {records ? <Records /> : (
        <>
          <SensorSettings />
          <PhoneSettings />
        </>
      )}
    </>
  )
}
