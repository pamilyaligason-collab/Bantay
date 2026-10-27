import { useEffect, useState } from 'react'

/** Number pad (56px keys). `length` is 6 for a PIN and 4 for the family-approval number. Calls onDone with the digits; the pad clears itself so a miss starts fresh. */
export default function PinPad({ busy = false, onDone, shake = 0, length = 6, label = 'digits' }: { busy?: boolean; onDone: (pin: string) => void; shake?: number; length?: number; label?: string }) {
  const [pin, setPin] = useState('')
  const add = (d: string) => { if (!busy) setPin((p) => (p.length < length ? p + d : p)) }
  const back = () => setPin((p) => p.slice(0, -1))
  useEffect(() => { if (pin.length === length) { onDone(pin); setPin('') } }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') back() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
  return (
    <div className="pinpad">
      <div key={shake} className={shake ? 'dots shake' : 'dots'} role="img" aria-label={`${pin.length} of ${length} ${label} entered`}>
        {Array.from({ length }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="key" disabled={busy} onClick={() => add(d)}>{d}</button>)}
        <span />
        <button type="button" className="key" disabled={busy} onClick={() => add('0')}>0</button>
        <button type="button" className="key" aria-label="Delete last digit" disabled={busy || !pin} onClick={back}>⌫</button>
      </div>
    </div>
  )
}
