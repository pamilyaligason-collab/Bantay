import { registerPlugin, WebPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/** Contract with android/.../AppUpdaterPlugin.java. download() rejects with message 'checksum' | 'space' | 'network'. */
export interface AppUpdaterPlugin {
  /** canInstall = packageManager.canRequestPackageInstalls() */
  info(): Promise<{ versionCode: number; versionName: string; canInstall: boolean }>
  /** Opens Android's "Install unknown apps" screen for Bantay. */
  openInstallPermission(): Promise<void>
  download(o: { url: string; sha256: string; size: number }): Promise<{ path: string }>
  install(o: { path: string }): Promise<{ status: 'success' | 'pending_user' | 'failure'; message?: string }>
  addListener(
    event: 'progress',
    cb: (p: { done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>
}

/** Browser and PWA: versionCode 0 means "no native shell", so no APK is ever offered. */
class AppUpdaterWeb extends WebPlugin implements Omit<AppUpdaterPlugin, 'addListener'> {
  async info() {
    return { versionCode: 0, versionName: 'web', canInstall: false }
  }
  async openInstallPermission(): Promise<void> {}
  async download(): Promise<{ path: string }> {
    throw new Error('network')
  }
  async install(): Promise<{ status: 'failure'; message: string }> {
    return { status: 'failure', message: 'Not available in the browser.' }
  }
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater', { web: () => Promise.resolve(new AppUpdaterWeb()) })
