import { callFirstContact } from './call'

/** Big red "Call 911". Always the prefilled dial screen: 911 is never auto-dialled, the person presses call. S7 mounts it in SimpleToday. */
export default function Call911() {
  return (
    <button type="button" className="sos-911 sos-911-btn" onClick={() => void callFirstContact([], { emergency: true })}>
      <span>Call 911<small>Emergency hotline</small></span>
    </button>
  )
}
