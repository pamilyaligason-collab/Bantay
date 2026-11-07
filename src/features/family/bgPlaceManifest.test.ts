import { describe, expect, it } from 'vitest'
import { checkNoBackgroundLocation } from '../../../scripts/check-manifest.mjs'
import appManifest from '../../../android/app/src/main/AndroidManifest.xml?raw'

// D-151: the daily run sends only battery and a check-in time, so no background location. The plugin's own manifest (not installed in every checkout) declares it; ours strips it.
// The owner's build step runs `node scripts/check-manifest.mjs <merged manifest>` on the real merged file.
const PLUGIN_LINE = '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />'
describe('no background location in the APK (checkNoBackgroundLocation)', () => {
  it('our manifest strips it with tools:node="remove" and never declares it plainly', () => {
    const tags = appManifest.match(/<uses-permission[^>]*ACCESS_BACKGROUND_LOCATION[^>]*>/g) ?? []
    expect(tags).toHaveLength(1)
    expect(tags[0]).toContain('tools:node="remove"')
    expect(appManifest).toContain('xmlns:tools=')
    expect(checkNoBackgroundLocation(appManifest)).toEqual([])
  })
  it('a merged manifest that still holds it fails; one without it, or only a removed one, passes', () => {
    expect(checkNoBackgroundLocation(`${appManifest}\n${PLUGIN_LINE}`)).toEqual([expect.stringContaining('ACCESS_BACKGROUND_LOCATION')])
    expect(checkNoBackgroundLocation('<manifest />')).toEqual([])
    expect(checkNoBackgroundLocation(PLUGIN_LINE.replace('/>', 'tools:node="remove" />'))).toEqual([])
  })
})
