import { ASK_EVENT } from '../assistant/Assistant'
import { JackArt } from '../look'
import { Sheet, leaveSheet } from '../look/Sheet'
import { openScan } from '../scan/open'
import SosHold from '../sos/SosHold'
import { Icon } from './Icon'
import './shell.css'

// label is the chip, text is what the assistant gets (board JackSheet: Log my BP, What does ALT mean?; "Add a medicine" is not something Jack can do, so the third chip asks about doses)
const TRY = [{ label: 'Log my BP', text: 'Log my blood pressure' }, { label: 'What does ALT mean?', text: 'What does ALT mean?' }, { label: 'Did I take my medicine?', text: 'Did I take my medicine today?' }]

/** The Jack sheet (D-105): Help (the same 3 s hold as before), Scan (which also takes a photo from the gallery), Chat and Try saying, from any tab. Scan and Chat pop the sheet's history entry first, then act. */
export function JackSheet({ onClose, onSos, firstName }: { onClose: () => void; onSos: () => void; firstName: string }) {
  const close = () => { if (history.state?.bantaySheet) history.back(); else onClose() } // Back runs the sheet's own animated close
  const leave = (then: () => void) => { leaveSheet(then); onClose() }
  const sos = () => { onSos(); if (history.state?.bantaySheet) history.back() } // the screen opens first (emergency); then the sheet's dead entry goes
  return (
    <Sheet title="Jack" hideTitle onClose={onClose} testId="jack-sheet">
      <div className="jk-head">
        <JackArt name="head" size={56} decorative />
        <div className="grow"><b>Hi {firstName || 'there'}, what do you need?</b><span className="sub">Jack is always here, on every tab.</span></div>
        <button type="button" className="lk-x" data-testid="jack-close" aria-label="Close" onClick={close}><Icon name="close" size={20} /></button>
      </div>
      <div className="jk-sos" data-testid="jack-sos"><SosHold onSend={sos} ring /></div>
      <p className="jk-safety" data-testid="jack-safety">Cannot hold? <a href="#safety" onClick={(e) => { e.preventDefault(); leave(() => { location.hash = '#safety' }) }}>Open Safety</a> for Call 911 and Medical ID.</p>
      <div className="jk-tiles">
        <button type="button" className="jk-tile" data-tint="blue" data-testid="jack-scan" onClick={() => leave(openScan)}>
          <span className="big"><Icon name="camera" size={26} /></span><b>Scan</b><span className="sub">Lab paper, prescription or ID</span>
        </button>
        <button type="button" className="jk-tile" data-tint="green" data-testid="jack-chat" onClick={() => leave(() => { document.querySelector<HTMLElement>('.sh-jackfab')?.focus(); window.dispatchEvent(new Event(ASK_EVENT)) })}>
          <span className="big"><Icon name="chat" size={26} /></span><b>Chat</b><span className="sub">Ask or log anything</span>
        </button>
      </div>
      <div className="jk-try" role="group" aria-label="Try saying">
        <span className="sub">Try saying</span>
        {TRY.map(({ label, text }) => <button key={label} type="button" className="jk-chip" onClick={() => leave(() => { document.querySelector<HTMLElement>('.sh-jackfab')?.focus(); window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { text } })) })}>{label}</button>)}
      </div>
    </Sheet>
  )
}
