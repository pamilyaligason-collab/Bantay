import { Capacitor, registerPlugin } from '@capacitor/core'

export type OpenTarget = 'earthquake' | 'wea'
type Plugin = { open(o: { target: OpenTarget }): Promise<{ opened: string }> }

/** Native plugin: android/app/src/main/java/ph/bantay/family/SettingsOpenerPlugin.java */
export const SettingsOpener = registerPlugin<Plugin>('SettingsOpener')

export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** Which phone-warning items have an Open Settings button. */
export const OPEN_TARGET: Record<string, OpenTarget | undefined> = { 'android-eq': 'earthquake', 'android-wea': 'wea' }

const HINT: Record<OpenTarget, string> = {
  earthquake: 'Look for Earthquake alerts and turn it on.',
  wea: 'Look for Wireless emergency alerts and turn on every alert type.'
}

/** Never rejects: returns a line for the user. ok=false means show the written steps. */
export async function openSettings(t: OpenTarget): Promise<{ ok: boolean; line: string }> {
  try {
    const { opened } = await SettingsOpener.open({ target: t })
    // Only the generic Settings screen means we could not get closer.
    const where = opened === 'settings' ? 'Settings opened. Search for the item below.' : 'A settings screen opened.'
    return { ok: true, line: `${where} ${HINT[t]} Android will not let Bantay switch it on for you.` }
  } catch {
    return { ok: false, line: 'We could not open Settings on this phone. Follow the steps above.' }
  }
}
