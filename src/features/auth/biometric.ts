import { Capacitor, registerPlugin } from '@capacitor/core'

/** Native BiometricPrompt (android/.../BiometricPlugin.java). The Supabase session stays in WebView storage; the fingerprint only gates showing the app (D-32). */
interface BiometricNative {
  status(): Promise<{ available: boolean; enrolled: boolean }>
  prompt(o: { title: string }): Promise<{ ok: true }> // rejects with 'use_pin' (negative button, Android 10 and older), 'cancelled' or 'failed'
  openEnroll(): Promise<void> // Settings.ACTION_BIOMETRIC_ENROLL
}
const Biometric = registerPlugin<BiometricNative>('Biometric')

export type UnlockMode = 'fingerprint' | 'enrol-first' | 'passkey' | 'pin'

/** How this phone can unlock. The APK uses the native prompt; the PWA keeps passkeys (family.ts) when the flag is set. */
export async function unlockMode(o: { passkeyFlag: boolean }): Promise<UnlockMode> {
  if (!Capacitor.isNativePlatform()) return o.passkeyFlag ? 'passkey' : 'pin'
  try {
    const s = await Biometric.status()
    if (!s.available) return 'pin'
    return s.enrolled ? 'fingerprint' : 'enrol-first'
  } catch { return 'pin' }
}

/** true when the person passed the prompt; 'use_pin' when they tapped the negative button (Android 10 and older), so the caller opens the PIN pad at once.
 *  Cancel, failure or a missing plugin give false: the caller stays on its screen. */
export async function promptFingerprint(title: string): Promise<boolean | 'use_pin'> {
  try { return (await Biometric.prompt({ title })).ok === true } catch (e) {
    const x = e as { message?: string; code?: string }
    return x?.message === 'use_pin' || x?.code === 'use_pin' ? 'use_pin' : false
  }
}

export async function openFingerprintEnrol(): Promise<void> {
  try { await Biometric.openEnroll() } catch { /* no settings screen: the person can open Settings themselves */ }
}
