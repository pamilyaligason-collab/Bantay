import { db } from '../../../db'
import { enableAlerts } from '../../notify/alerts'
import { tryAutoLibrary, CONSENT_KEY } from '../../health/library/autoStart'
import { applyFix, openAutostart } from '../../phonecheck/fix'
import { OFFLINE_PREFS_KEY } from '../../safety/autoMaps'
import { openFix } from '../../safety/settingsOpener'
import { capgoBridge } from '../../sensors/bridge'
import { enableTypes, SENSORS } from '../../sensors/health'
import { resolveLocation } from '../../location/useLocation'
import type { Latest } from '../../update/check'
import { startJob } from '../../update/job'
import { AppUpdater } from '../../update/plugin'
import { scheduleTest } from '../steps'
import { bgPlaceSync } from '../../family/bgPlace'
import { AUTOSTART_KEY, TEST_KEY, today, visit } from './facts'
import type { Facts, RowId } from './rows'

export interface Ctx {
  native: boolean
  location: Facts['location']
  /** From useUpdate; null when there is nothing to install. */
  latest: Latest | null
  canInstall: boolean | null
  wifiOnly: boolean
}

const put = (key: string, value: unknown) => db.kv.put({ key, value })

/** Do exactly one step. The phone's own prompt, settings screen or download is what the person then answers; nothing is switched on behind their back. Never rejects. */
export async function act(id: RowId, c: Ctx): Promise<void> {
  try {
    switch (id) {
      case 'update':
        if (c.canInstall === false) await AppUpdater.openInstallPermission()
        else if (c.latest) startJob(c.latest, AppUpdater, c.wifiOnly)
        return
      case 'notifications':
        if (c.native) await applyFix('notif'); else await enableAlerts()
        return
      case 'autostart': if (await openAutostart()) await put(AUTOSTART_KEY, today()); return
      case 'bg': await bgPlaceSync(await import('../../sync/profile').then((m) => m.selfIdOrCached()).catch(() => null)); return
      case 'exact': await applyFix('exact'); return
      case 'battery': await applyFix('battery'); return
      case 'location':
        if (c.location === 'denied') await openFix('appdetails'); else await resolveLocation(true)
        return
      case 'health': await enableTypes(SENSORS.map((s) => s.type), capgoBridge()); return
      case 'library': // the tap is the answer to the Wi-Fi question (D-167); the download itself still waits for Wi-Fi
        await put(CONSENT_KEY, 'yes'); void tryAutoLibrary(); return
      case 'maps': {
        const prev = ((await db.kv.get(OFFLINE_PREFS_KEY))?.value ?? {}) as Record<string, unknown>
        await put(OFFLINE_PREFS_KEY, { ...prev, autoDownload: true }); return
      }
      case 'test': await scheduleTest(); visit.testSent = true; await put(TEST_KEY, today()); return
    }
  } catch { /* the row shows what is still off */ }
}
