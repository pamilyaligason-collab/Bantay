import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useReducedMotion } from '../look/useReducedMotion'
import { useActing } from '../viewas/viewAs'
import { isEvening, isLow, syncBatteryReminder, type BatSync } from './batteryReminder'
import { useBattery } from './useBattery'
import './battery.css'

/** Board "Battery card": under My day. Shows the phone's own level, so it is hidden where the browser does not share it and while an admin views as someone else.
 *  The state is always words (charging, enough, low), never colour alone. */
export default function BatteryCard() {
  const b = useBattery()
  const { acting } = useActing()
  const reduced = useReducedMotion()
  const [sync, setSync] = useState<BatSync | null>(null)
  const low = !!b && isLow(b)
  const known = !!b
  const charging = b?.charging
  useEffect(() => { // a plug-in or a drop under 30 % re-plans the 7 PM reminder; the open and resume hook does the rest
    if (!known || acting) return
    let live = true
    void syncBatteryReminder().then((s) => { if (live) setSync(s) })
    return () => { live = false }
  }, [low, charging, known, acting])
  if (!b || acting) return null
  const pct = Math.round(b.level * 100)
  const sub = b.charging ? 'Charging'
    : !low ? 'Enough for tonight · not charging'
    : isEvening(new Date()) ? 'Not charging. Charge your phone tonight.'
    : sync === 'scheduled' ? 'Charge before night. Reminder set for 7 PM.' : 'Charge before night.'
  return (
    <div className="card bat-card" data-low={low || undefined} data-testid="battery-card">
      <div className="bat-glyph" aria-hidden="true"><div className="bat-fill" data-charging={b.charging && !reduced ? '' : undefined} style={{ width: `${pct}%` }} /></div>
      <div className="bat-tx">
        <div className="bat-t">{pct}% battery</div>
        <div className="bat-s">{sub}</div>
        {Capacitor.isNativePlatform() && <div className="bat-note">Reminds you based on the level when Bantay was last open.</div>}
      </div>
    </div>
  )
}
