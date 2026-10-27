import { useMemo, useState } from 'react'
import type { Reading } from '../health/ranges'
import type { MedTaken, Medication } from '../log/store'
import { sendRecap } from '../family/messagesApi'
import { hasSomethingToShare, recap, recapShareText } from './recapLogic'

const SAID = { ok: 'Shared with your family. It sends when you have signal.', failed: 'Could not share. Try again.' }

/** Your week, from your own numbers only. "Share with family" posts COUNTS (checks and medicine days), never a reading or the average. Mounted only for the signed-in member's own person. */
export function Recap({ personId, readings, meds, takes, now = new Date() }: { personId: string; readings: Reading[]; meds: Medication[]; takes: MedTaken[]; now?: Date }) {
  const r = useMemo(() => recap({ personId, readings, meds, takes, now }), [personId, readings, meds, takes, now])
  const [said, setSaid] = useState<string>('')
  const share = async () => {
    const res = await sendRecap(recapShareText(r))
    setSaid(res.ok ? SAID.ok : SAID.failed)
  }
  return (
    <section className="sh-card nu-card" data-testid="nudge-recap" aria-labelledby="nu-recap-h">
      <h2 className="sh-h2" id="nu-recap-h">Your week</h2>
      <ul className="nu-stats">
        <li><b data-testid="recap-avg">{r.avg ? `${r.avg.sys}/${r.avg.dia}` : 'No readings yet'}</b><span>Average blood pressure. Only you see this.</span></li>
        <li><b data-testid="recap-checks">{r.checks.done} of {r.checks.of}</b><span>Morning checks</span></li>
        <li><b data-testid="recap-meds">{r.medDays ? `${r.medDays.done} of ${r.medDays.of}` : 'No timed medicines'}</b><span>Days with all medicines taken</span></li>
      </ul>
      <p className="sh-sub">Your family sees counts only, never your numbers.</p>
      <button type="button" className="sh-pill sh-primary sh-block" onClick={() => void share()} disabled={!hasSomethingToShare(r)} data-testid="recap-share">Share with family</button>
      {said && <p className="sh-sub" role="status" data-testid="recap-said">{said}</p>}
    </section>
  )
}
