import { useState } from 'react'
import { cleanItem } from './lists'

/** Suggestion chips plus an "Other" box. `exclusive` items (None, Not sure) clear the rest and are cleared by them. */
export default function ChipField({ label, options, value, onChange, multi = false, exclusive = [], allowOther = true }: {
  allowOther?: boolean; label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; exclusive?: string[]
}) {
  const [other, setOther] = useState('')
  const shown = [...options, ...value.filter((v) => !options.includes(v))]
  const toggle = (o: string) => {
    if (value.includes(o)) return onChange(value.filter((v) => v !== o))
    if (!multi || exclusive.includes(o)) return onChange([o])
    onChange([...value.filter((v) => !exclusive.includes(v)), o])
  }
  const add = () => {
    const t = cleanItem(other)
    if (!t) return
    setOther('')
    const hit = shown.find((s) => s.toLowerCase() === t.toLowerCase())
    if (hit) return value.includes(hit) ? undefined : toggle(hit)
    onChange(multi ? [...value.filter((v) => !exclusive.includes(v)), t] : [t])
  }
  return (
    <div className="wz-chipfield" role="group" aria-label={label}>
      <span className="sub">{label}</span>
      <div className="wz-chips">
        {shown.map((o) => <button key={o} type="button" className="wz-chip" aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{o}</button>)}
      </div>
      {allowOther && <div className="wz-other">
        <input value={other} maxLength={40} placeholder="Other" aria-label={`${label}: other`} onChange={(e) => setOther(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className="btn2 wz-sm" disabled={!cleanItem(other)} onClick={add}>Add</button>
      </div>}
    </div>
  )
}
