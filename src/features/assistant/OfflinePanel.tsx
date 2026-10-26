import { callFirstContact } from '../sos/call'
import type { SosContact } from '../sos/contacts'

/** Jack needs the internet (mockup ask-offline). These four still work with no signal. */
export function OfflinePanel({ contact, go }: { contact?: SosContact; go: (hash: string) => void }) {
  return (
    <div className="as-offline" role="status">
      <div className="as-off-banner">Jack needs the internet. You are offline.</div>
      <b>These still work</b>
      <div className="as-off-list">
        <button type="button" onClick={() => go('safety/firstaid')}>First aid<span className="sub">Saved on this phone</span></button>
        <button type="button" onClick={() => go('medid')}>Medical ID<span className="sub">Works without internet</span></button>
        {contact && <button type="button" onClick={() => void callFirstContact([contact])}>Call {contact.name}</button>}
        <button type="button" onClick={() => void callFirstContact([], { emergency: true })}>Call 911</button>
      </div>
      <span className="sub">Your question is kept. It is sent when there is signal.</span>
    </div>
  )
}
