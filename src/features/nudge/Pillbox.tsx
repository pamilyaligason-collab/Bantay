import { useMemo, useState } from 'react'
import type { MedTaken, Medication } from '../log/store'
import { logHalf, pillbox, type CellState, type Half, type PillCell } from './pillboxLogic'

const MARK: Record<CellState, string> = { none: '', done: '✓', skipped: '–', open: '○', missed: '·' }
const WORD: Record<CellState, string> = { none: 'nothing due', done: 'taken', skipped: 'skipped', open: 'still to take', missed: 'not logged' }
const dow = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })

/** The week at a glance: morning and evening for the last 7 days. A tap on today's open cell logs those doses through the same logDose as the Taken button (never twice); past days are read-only,
 *  and "not logged" is a quiet dot, never red. Only someone who may mark for this person (`canMark`) can tap. */
export function Pillbox({ personId, meds, takes, canMark, now = new Date() }: { personId: string; meds: Medication[]; takes: MedTaken[]; canMark: boolean; now?: Date }) {
  const week = useMemo(() => pillbox({ personId, meds, takes, now }), [personId, meds, takes, now])
  const [busy, setBusy] = useState(false)
  const empty = week.every((d) => d.am.state === 'none' && d.pm.state === 'none')
  const tap = async (h: Half) => { if (busy) return; setBusy(true); try { await logHalf(personId, h, new Date()) } catch { /* storage failed: the cell stays open, tap again */ } finally { setBusy(false) } }
  const cell = (d: (typeof week)[number], h: Half, c: PillCell) => {
    const label = `${dow(d.day)} ${h === 'am' ? 'morning' : 'evening'}: ${WORD[c.state]}`
    const tappable = d.today && c.state === 'open' && canMark
    return (
      <td key={`${d.day}${h}`} className={`nu-cell ${c.state}`}>
        {tappable
          ? <button type="button" className="nu-cellbtn" disabled={busy} onClick={() => void tap(h)} aria-label={`${label}. Tap to mark taken`} data-cell={`${d.day}:${h}`}>{MARK.open}</button>
          : <span role="img" aria-label={label} data-cell={`${d.day}:${h}`} data-state={c.state}>{MARK[c.state]}</span>}
      </td>
    )
  }
  return (
    <section className="sh-card nu-card" data-testid="nudge-pillbox" aria-labelledby="nu-pill-h">
      <h2 className="sh-h2" id="nu-pill-h">Pillbox</h2>
      {empty ? <p className="sh-sub">No medicines with a time yet. Add one in Medicines.</p> : (
        <table className="nu-pill" aria-label="Medicines taken this week">
          <thead><tr><td />{week.map((d) => <th key={d.day} scope="col" data-today={d.today || undefined}>{dow(d.day).slice(0, 2)}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">AM</th>{week.map((d) => cell(d, 'am', d.am))}</tr>
            <tr><th scope="row">PM</th>{week.map((d) => cell(d, 'pm', d.pm))}</tr>
          </tbody>
        </table>
      )}
      <p className="sh-sub">{'✓'} taken {'·'} {'–'} skipped {'·'} {'○'} still to take {'·'} {'·'} not logged</p>
    </section>
  )
}
