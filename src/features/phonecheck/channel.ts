import { LocalNotifications } from '@capacitor/local-notifications'
import { ALARM_CHANNEL } from './keys'

let made = false
/** Create the loud alarm channel once per app run (JS only, no native code). importance 5 = rings and shows over other apps; Android keeps the user's own channel changes, and creating an existing channel is a no-op.
 *  Copy rule: it "rings loudly"; never "even on silent". Returns false when the plugin could not create it (the alarms still use the default channel). */
export async function ensureAlarmChannel(): Promise<boolean> {
  if (made) return true
  try {
    await LocalNotifications.createChannel({ id: ALARM_CHANNEL, name: 'Medicine alarms', description: 'Medicine alarms ring loudly and vibrate.', importance: 5, visibility: 1, vibration: true })
    made = true
    return true
  } catch { return false }
}
/** Test helper: forget that the channel was created. */
export const resetAlarmChannelForTests = () => { made = false }
