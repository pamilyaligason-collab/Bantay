import { describe, expect, it } from 'vitest'
import { checkPush } from '../../../scripts/check-manifest.mjs'
import appManifest from '../../../android/app/src/main/AndroidManifest.xml?raw'
import pluginManifest from '../../../node_modules/@capacitor/push-notifications/android/src/main/AndroidManifest.xml?raw'

// Lane E: what the merged manifest needs for FCM. The real merge only exists after Gradle, so this joins the app's and the plugin's own manifests.
describe('push manifest (check-manifest.mjs checkPush)', () => {
  it('the app manifest plus the push plugin manifest pass', () => {
    expect(checkPush(`${appManifest}\n${pluginManifest}`)).toEqual([])
  })
  it('the app manifest alone fails on the missing FCM receiver (plugin not synced), and says so', () => {
    expect(checkPush(appManifest)).toEqual([expect.stringContaining('MessagingService')])
  })
  it('a manifest that removes POST_NOTIFICATIONS fails', () => {
    const removed = appManifest.replace('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" tools:node="remove" />')
    expect(removed).not.toBe(appManifest)
    expect(checkPush(`${removed}\n${pluginManifest}`)).toEqual([expect.stringContaining('POST_NOTIFICATIONS')])
    expect(checkPush(pluginManifest)).toHaveLength(1)
  })
})
