import { Capacitor } from '@capacitor/core'
import { EmptyState } from '../look/EmptyState'
import { Section } from '../look/Section'
import { putKv, useKv } from '../safety/store'
import { Switch } from '../world/Switch'
import RainMini, { miniSlots } from '../today/RainMini'
import { toWx } from '../today/weather'
import type { Forecast } from './forecast'
import { RAIN_KEY, syncRainReminder } from './rainRemind'

/** "Remind me before rain": native only (a web page cannot ring later), so on the web the row is not drawn. */
export function RainRemindSwitch() {
  const on = useKv<boolean>(RAIN_KEY, false)
  if (!Capacitor.isNativePlatform()) return null
  const set = async (v: boolean) => {
    await putKv(RAIN_KEY, v)
    if (v) { try { const { LocalNotifications } = await import('@capacitor/local-notifications'); if ((await LocalNotifications.checkPermissions()).display !== 'granted') await LocalNotifications.requestPermissions() } catch { /* the plan below reports no-permission quietly */ } }
    void syncRainReminder() // set or cancel now; also re-run at every app open
  }
  return (
    <div className="wx-remind">
      <span><b>Remind me before rain</b><span className="wx-sub">One alert 15 minutes before rain starts, when it is more than 20 minutes away.</span></span>
      <Switch on={on} label="Remind me before rain" onChange={(v) => void set(v)} testId="wx-remind" />
    </div>
  )
}

/** The 15-minute rain block for everyone (X3), when the blended forecast is off: the same bars as Today, from the real hourly millimetres, labelled estimated. */
export function Next2hMini({ fc, offline, now }: { fc: Forecast; offline: boolean; now: number }) {
  const slots = offline ? null : miniSlots(toWx(fc), new Date(now))
  return (
    <Section title="Next 2 hours" meta="estimated" testId="wx-next2h-est">
      {slots ? (
        <div className="card wx-n2h">
          <RainMini slots={slots} />
          <RainRemindSwitch />
        </div>
      ) : <EmptyState title="Not available now" body={offline ? 'Rain for the next 2 hours needs a fresh forecast.' : 'No rain numbers for the next 2 hours.'} />}
    </Section>
  )
}
