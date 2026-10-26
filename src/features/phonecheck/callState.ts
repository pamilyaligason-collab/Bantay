import { Capacitor, registerPlugin } from '@capacitor/core'

type CallPlugin = { checkPermission(): Promise<{ state: 'granted' | 'denied' }> }

/** Whether Bantay may place a call for "Hold for help": true = allowed, false = Android took it back (Android 11+ resets permissions of unused apps) or it was never given, null = unknown (web, old shell, no Call plugin).
 *  Read-only: this never prompts (the prompt lives with S2's `requestCallPermission`, called from setup and the Me row).
 *  Reads the same native `Call` plugin as S2's `callPermission()` in `src/features/sos/call.ts`; swap this for that import after S2 merges. */
export async function callOk(): Promise<boolean | null> {
  try {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('Call')) return null
    const r = await registerPlugin<CallPlugin>('Call').checkPermission()
    return r?.state === 'granted' ? true : r?.state === 'denied' ? false : null
  } catch { return null }
}
