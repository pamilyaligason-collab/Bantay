import { LocalNotifications } from '@capacitor/local-notifications'
import { openFix, requestBatteryExemption } from '../safety/settingsOpener'
import type { Problem } from './probe'

/** The phone makers that have an autostart / background screen worth opening (the screen names themselves are unverified guesses in SettingsOpenerPlugin.java; see R2). */
const OEM_NAME: [RegExp, string][] = [[/xiaomi|redmi|poco/, 'Xiaomi'], [/samsung/, 'Samsung'], [/huawei|honor/, 'Huawei'], [/oppo|realme|oneplus/, 'Oppo'], [/vivo|iqoo/, 'Vivo']]
export const oemName = (oem: string | null): string | null => (oem ? OEM_NAME.find(([re]) => re.test(oem))?.[1] ?? null : null)
/** True for makers whose battery manager has a separate Autostart switch. Samsung has none (R2). */
export const hasAutostart = (oem: string | null): boolean => { const n = oemName(oem); return !!n && n !== 'Samsung' }

export interface FixCopy { title: string; why: string; steps: string[]; button: string }

/** Plain words for one problem, for the fix card (mockup `start-done-fix`). Menu paths are the ones R2 confirmed (dontkillmyapp.com); other makers get the generic steps. */
export function fixCopy(p: Problem, oem: string | null): FixCopy {
  const name = oemName(oem)
  switch (p) {
    case 'battery': {
      const steps = name === 'Xiaomi' ? ['Tap Fix it now', 'Battery saver, then No restrictions', 'Autostart: turn on']
        : name === 'Samsung' ? ['Tap Fix it now', 'Battery, then Bantay, then Unrestricted']
        : hasAutostart(oem) ? ['Tap Fix it now', 'Allow Bantay to run in the background', 'Autostart: turn on']
        : ['Tap Fix it now', 'Allow Bantay to run in the background']
      return { title: 'One thing to fix: battery saver', why: `${name ?? 'Your phone'} stops Bantay when the screen is off, so a medicine alarm could be late.`, steps, button: 'Fix it now (1 minute)' }
    }
    case 'notif':
      return { title: 'One thing to fix: notifications are off', why: 'Medicine alarms cannot ring while notifications are off for Bantay.', steps: ['Tap Fix it now', 'Turn notifications on for Bantay'], button: 'Fix it now (1 minute)' }
    case 'exact':
      return { title: 'One thing to fix: alarms and reminders', why: 'Android may ring medicine alarms late until this is on for Bantay.', steps: ['Tap Fix it now', 'Turn on Alarms and reminders for Bantay'], button: 'Fix it now (1 minute)' }
    case 'alarms':
      return { title: 'One thing to fix: alarms did not set', why: 'Bantay could not set the medicine alarms on this phone.', steps: ['Tap Fix it now', 'Check Notifications and Battery for Bantay'], button: 'Fix it now (1 minute)' }
    case 'call':
      return { title: 'One thing to fix: Hold for help', why: 'Hold for help can no longer call for you. Android takes back the Phone permission when an app is not opened for a while.', steps: ['Tap Fix it now', 'Permissions, then Phone', 'Choose Allow'], button: 'Fix it now (1 minute)' }
  }
}

export type FixOutcome = 'prompted' | 'opened' | 'failed'

/** Do the one thing that fixes `p`. Android never lets an app switch these on, so this only asks or opens the right screen. Never throws. */
export async function applyFix(p: Problem): Promise<FixOutcome> {
  try {
    if (p === 'battery') { await requestBatteryExemption(); return 'prompted' }
    if (p === 'notif') {
      if ((await LocalNotifications.requestPermissions()).display === 'granted') return 'prompted'
      return (await openFix('notifications')).opened ? 'opened' : 'failed'
    }
    if (p === 'exact') {
      try { await LocalNotifications.changeExactNotificationSetting(); return 'opened' } catch { return (await openFix('appdetails')).opened ? 'opened' : 'failed' }
    }
    return (await openFix('appdetails')).opened ? 'opened' : 'failed' // alarms, call: the app's own settings page (permissions live there)
  } catch { return 'failed' }
}

/** The extra button on the battery fix for makers with an Autostart switch. */
export async function openAutostart(): Promise<boolean> { return !!(await openFix('autostart')).opened }
