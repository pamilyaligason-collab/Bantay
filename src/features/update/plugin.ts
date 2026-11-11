import { registerPlugin, WebPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/** Contract with android/.../AppUpdaterPlugin.java. download() rejects with err.code (native: message == code) one of 'network' | 'checksum' | 'space' | 'busy' | 'bad_args'; a size mismatch is 'checksum'. */
export interface AppUpdaterPlugin {
  /** canInstall = packageManager.canRequestPackageInstalls() */
  /** silentInstall: true only in a shell whose install() honours {silent:true}; absent in 2.9.0 and older (they would open Android's box), so automatic installs need it === true. */
  info(): Promise<{ versionCode: number; versionName: string; canInstall: boolean; silentInstall?: boolean }>
  /** Opens Android's "Install unknown apps" screen for Bantay. */
  openInstallPermission(): Promise<void>
  download(o: { url: string; sha256: string; size: number }): Promise<{ path: string }>
  /** silent: automatic update. If Android needs a tap, resolve 'needs_tap' and do NOT open its box (an older shell ignores this and opens it). */
  install(o: { path: string; silent?: boolean }): Promise<{ status: 'success' | 'pending_user' | 'needs_tap' | 'failure'; message?: string }>
  addListener(
    event: 'progress',
    cb: (p: { done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>
  /** Final status after install() resolved 'pending_user'. */
  addListener(
    event: 'installResult',
    cb: (r: { status: 'success' | 'failure'; message?: string }) => void,
  ): Promise<PluginListenerHandle>
}

/** Browser and PWA: versionCode 0 means "no native shell", so no APK is ever offered. */
class AppUpdaterWeb extends WebPlugin implements Omit<AppUpdaterPlugin, 'addListener'> {
  async info() {
    return { versionCode: 0, versionName: 'web', canInstall: false }
  }
  async openInstallPermission(): Promise<void> {}
  async download(): Promise<{ path: string }> {
    throw Object.assign(new Error('network'), { code: 'network' })
  }
  async install(): Promise<{ status: 'failure'; message: string }> {
    return { status: 'failure', message: 'Not available in the browser.' }
  }
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater', { web: () => Promise.resolve(new AppUpdaterWeb()) })
