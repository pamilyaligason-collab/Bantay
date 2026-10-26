import { LocalNotifications } from '@capacitor/local-notifications'
import { db } from '../../db'
import { track } from '../admin/events'
import { deviceMaker, isNativeAndroid, nativeStatus } from '../safety/settingsOpener'
import { ALARM_SHELL, shellVersionNow, versionAtLeast } from './appInfo'
import { callOk } from './callState'
import { ensureAlarmChannel } from './channel'
import { ALARM_CHANNEL, KEY_ALARM_HEALTH, KEY_PHONE_CHECK, type AlarmHealth } from './keys'

/** null = unknown (never false): web, an old shell, a plugin that could not answer. */
export interface ProbeResult { notif_ok: boolean | null; exact_ok: boolean | null; battery_ok: boolean | null; alarms_ok: boolean | null; call_ok: boolean | null; oem: string | null }

export const BLANK_PROBE: ProbeResult = { notif_ok: null, exact_ok: null, battery_ok: null, alarms_ok: null, call_ok: null, oem: null }

/** Ask the phone what it will let Bantay do. Never throws, never prompts, changes nothing; stores the answer in kv `phone.check`. */
export async function probe(): Promise<ProbeResult> {
  let r: ProbeResult = { ...BLANK_PROBE }
  if (isNativeAndroid()) {
    const [st, oem, call, ver, health] = await Promise.all([
      nativeStatus(), deviceMaker(), callOk(), shellVersionNow(),
      db.kv.get(KEY_ALARM_HEALTH).then((x) => x?.value as AlarmHealth | undefined).catch(() => undefined)
    ])
    let notif = st ? st.notificationsEnabled : null
    if (notif === null) { try { notif = (await LocalNotifications.checkPermissions()).display === 'granted' } catch { notif = null } }
    const exact = st ? st.canScheduleExactAlarms : null
    const newShell = versionAtLeast(ver, ALARM_SHELL)
    // alarms_ok: only a shell that can plan alarms says anything; an explicit false from any source wins, no answer stays null
    const alarms = !newShell ? null : (health?.ok === false || notif === false || exact === false) ? false : typeof health?.ok === 'boolean' ? health.ok : null
    r = { notif_ok: notif, exact_ok: exact, battery_ok: st ? st.ignoringBatteryOptimizations : null, alarms_ok: alarms, call_ok: call, oem }
  }
  try { await db.kv.put({ key: KEY_PHONE_CHECK, value: { at: new Date().toISOString(), ...r } }) } catch { /* the answer is still returned */ }
  void track('action', probeProblems(r).length ? 'phone_check_fail' : 'phone_check_pass') // names on the allowlist only (events.ts); fixed names, no values
  return r
}

export type Problem = 'notif' | 'exact' | 'battery' | 'alarms' | 'call'

/** What is wrong, most important first. Only an explicit false counts; unknown is not a problem. `alarms` is listed only when nothing more specific explains it. */
export function probeProblems(r: ProbeResult): Problem[] {
  const p: Problem[] = []
  if (r.notif_ok === false) p.push('notif')
  if (r.exact_ok === false) p.push('exact')
  if (r.battery_ok === false) p.push('battery')
  if (r.alarms_ok === false && !p.length) p.push('alarms')
  if (r.call_ok === false) p.push('call')
  return p
}

export type TestAlarm = 'web' | 'no-permission' | 'scheduled' | 'failed'
const TEST_ID = 1_950_000_001
/** One test alarm a few seconds from now on the alarm channel, so the person hears what a dose alarm sounds like. Native only. */
export async function scheduleTestAlarm(seconds = 5, now = new Date()): Promise<TestAlarm> {
  if (!isNativeAndroid()) return 'web'
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return 'no-permission'
    await ensureAlarmChannel()
    await LocalNotifications.schedule({
      notifications: [{ id: TEST_ID, title: 'Bantay test alarm', body: 'This is how a medicine alarm will sound.', channelId: ALARM_CHANNEL, schedule: { at: new Date(now.getTime() + seconds * 1000), allowWhileIdle: true } }]
    })
    return 'scheduled'
  } catch { return 'failed' }
}
