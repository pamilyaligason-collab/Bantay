import { useState } from 'react'
import { Sheet } from '../look'

/** "After a scare": the 5-4-3-2-1 grounding steps, one at a time. Plain text, no timer, so nothing moves; Sheet already stills its own motion under reduced motion. */
export const SCARE_STEPS = [
  { n: 5, line: 'things you can see.' },
  { n: 4, line: 'things you can hear.' },
  { n: 3, line: 'things you can touch.' },
  { n: 2, line: 'things you can smell.' },
  { n: 1, line: 'thing you can taste.' },
]

export default function ScareSheet({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0)
  const s = SCARE_STEPS[i]!
  const last = i === SCARE_STEPS.length - 1
  return (
    <Sheet title="After a scare" onClose={onClose} testId="calm-scare">
      <p className="cm-sub" data-testid="scare-count">Step {i + 1} of {SCARE_STEPS.length}</p>
      <p role="status" data-testid="scare-step" style={{ fontSize: 20, lineHeight: '28px' }}>Name <b>{s.n}</b> {s.line}</p>
      <button type="button" className="btn block" style={{ minHeight: 44 }} onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
    </Sheet>
  )
}
