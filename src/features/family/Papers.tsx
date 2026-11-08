import { useRef } from 'react'
import Records from '../../screens/Records'
import { useQueue } from '../records/useRecordsServer'
import { openScan, openScanWithFile } from '../scan/open'
import { Icon } from '../shell/Icon'
import { SubHeader } from '../shell/SubHeader'
import { queueKicker } from './queueWords'
import './family.css'

/** Upload (pick a photo, handed to the scan flow's crop path) and Scan (camera), shared by the Papers card and the Papers screen. */
export function PaperActions() {
  const pick = useRef<HTMLInputElement>(null)
  return (
    <div className="fm-pa">
      <input ref={pick} type="file" accept="image/*" hidden data-testid="papers-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openScanWithFile(f) }} />
      <button type="button" className="fm-pa-up" onClick={() => pick.current?.click()}><Icon name="upload" size={18} />Upload</button>
      <button type="button" className="fm-pa-scan" onClick={openScan}><Icon name="camera" size={18} />Scan</button>
    </div>
  )
}

/** Papers at #family/papers (D-100): the records screen moved here from Health, under a Back-to-Family header. The trust line stays (W-42). Upload and Scan sit at the top (D-152). */
export default function Papers() {
  const queue = useQueue()
  return (
    <>
      <SubHeader title="Papers" backHref="#family" backLabel="Back to Family" />
      <p className="sub fm2-trust">Read by Bantay, checked by a person</p>
      <PaperActions />
      {queue.count > 0 && <p className="sub" data-testid="papers-kicker">{queueKicker(queue)}</p>}
      <Records />
    </>
  )
}
