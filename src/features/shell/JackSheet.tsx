import { useRef } from 'react'
import { ASK_EVENT } from '../assistant/Assistant'
import { JackArt } from '../look'
import { Sheet, leaveSheet } from '../look/Sheet'
import { openScan, openScanWithFile } from '../scan/open'
import SosHold from '../sos/SosHold'
import { Icon } from './Icon'
import './shell.css'

/** The Jack sheet (D-105): Help (the same 3 s hold as before), Scan, Chat and Upload, from any tab. Scan, Chat and Upload pop the sheet's history entry first, then act. */
export function JackSheet({ onClose, onSos, firstName }: { onClose: () => void; onSos: () => void; firstName: string }) {
  const file = useRef<HTMLInputElement>(null)
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
      <div className="jk-sos" data-testid="jack-sos"><SosHold onSend={sos} /></div>
      <p className="jk-safety" data-testid="jack-safety">Cannot hold? <a href="#safety" onClick={(e) => { e.preventDefault(); leave(() => { location.hash = '#safety' }) }}>Open Safety for Call 911 and Medical ID.</a></p>
      <div className="jk-tiles">
        <button type="button" className="jk-tile" data-tint="blue" data-testid="jack-scan" onClick={() => leave(openScan)}>
          <span className="big"><Icon name="camera" size={26} /></span><b>Scan</b><span className="sub">Lab paper, prescription or ID</span>
        </button>
        <button type="button" className="jk-tile" data-tint="green" data-testid="jack-chat" onClick={() => leave(() => { document.querySelector<HTMLElement>('.sh-jackfab')?.focus(); window.dispatchEvent(new Event(ASK_EVENT)) })}>
          <span className="big"><Icon name="chat" size={26} /></span><b>Chat</b><span className="sub">Ask or log anything</span>
        </button>
      </div>
      <button type="button" className="jk-upload" data-testid="jack-upload" onClick={() => file.current?.click()}>Upload a photo</button>
      <input ref={file} type="file" accept="image/*" hidden aria-label="Choose a photo" data-testid="jack-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leave(() => openScanWithFile(f)) }} />
    </Sheet>
  )
}
