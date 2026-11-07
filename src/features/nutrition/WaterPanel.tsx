import { useState } from 'react'
import { Icon } from '../shell/Icon'
import type { WaterEntry } from '../log/store'
import { logWater, undoWater } from './actions'
import { fmt, ML_PER_TAP, onDay, waterTotal } from './logic'
import { FAIL_TEXT } from '../today/actions'
import { firstName } from '../shell/names'
import { useActing } from '../viewas/viewAs'
import './nutrition.css'

/** Water today against the person's water goal, with a +250 ml button (one glass per tap) and Undo for the latest glass. `canAdd` is false when looking at someone else. `name` is the first name of the person when a carer picks them without acting; while acting as that same person the name comes from the acting state. WaterSheet is a caller too (always the acting person, so it passes no name). */
export default function WaterPanel({ rows, goalMl, now, canAdd = true, personId, source, name }: { rows: WaterEntry[]; goalMl: number | null; now: Date; canAdd?: boolean; personId?: string; source?: string; name?: string }) {
  const acting = useActing()
  const who = name?.trim() ? firstName(name) : acting.acting && acting.personId === personId && acting.name.trim() ? firstName(acting.name) : ''
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const today = onDay(rows, now)
  const ml = waterTotal(today)
  const run = async (p: ReturnType<typeof logWater>) => {
    if (busy) return
    setBusy(true)
    setErr('')
    const r = await p
    setBusy(false)
    if (r !== 'ok') setErr(FAIL_TEXT[r])
  }
  if (goalMl == null) return null // no water goal for this person (a baby under 1 year)
  return (
    <div className="nu-water" role="group" aria-label="Water today">
      <div className="nu-water-v">
        <b data-testid="water-ml">{fmt(ml)} ml</b>
        <span>of {fmt(goalMl)} ml{today.length ? ` · ${today.length} ${today.length === 1 ? 'glass' : 'glasses'}` : ''}</span>
      </div>
      {canAdd && (
        <div className="nu-act">
          <button type="button" className="nu-big-btn" disabled={busy} onClick={() => void run(logWater(ML_PER_TAP, new Date(), personId))} aria-label={`Add a glass of water, ${ML_PER_TAP} millilitres`}><Icon name="glass" size={24} />+{ML_PER_TAP} ml</button>
          {today.length > 0 && <button type="button" className="nu-ghost" disabled={busy} onClick={() => void run(undoWater(new Date(), personId))}>Undo</button>}
        </div>
      )}
      {source === 'limit' && <p className="nu-hint" style={{ flexBasis: '100%', margin: 0 }}>{who ? `${who}'s` : 'Your'} doctor&apos;s limit</p>}
      {canAdd && (source === 'default' || source === 'sex') && <a className="nu-hint" href="#health/metric/weight" style={{ flexBasis: '100%' }}>Add {who ? `${who}'s` : 'your'} weight for a goal that fits {who || 'you'}</a>}
      {err && <p className="nu-err" role="alert" style={{ flexBasis: '100%' }}>{err}</p>}
    </div>
  )
}
