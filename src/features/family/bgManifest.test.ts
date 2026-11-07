import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkExactAlarm, permissions } from '../../../scripts/check-manifest.mjs'
import appManifest from '../../../android/app/src/main/AndroidManifest.xml?raw'
const pluginManifest = readFileSync('node_modules/@capacitor/background-runner/android/src/main/AndroidManifest.xml', 'utf8') // read by path: the plugin manifest sits under node_modules

// D-150: the Background Runner plugin declares SCHEDULE_EXACT_ALARM with no cap; the merged manifest must keep ours (maxSdkVersion 32).
// Gradle's merge only exists after a build, so this joins what the merger sees: the plugin's own line (lower priority) and ours with tools:replace.
describe('exact alarm cap survives the plugin manifest (check-manifest.mjs checkExactAlarm)', () => {
  const ours = appManifest.match(/<uses-permission[^>]*SCHEDULE_EXACT_ALARM[^>]*>/)![0]
  const theirs = pluginManifest.match(/<uses-permission[^>]*SCHEDULE_EXACT_ALARM[^>]*>/)![0]

  it('the plugin really declares it uncapped (why the merge needs tools:replace)', () => {
    expect(theirs).not.toContain('maxSdkVersion')
    expect(checkExactAlarm(`${theirs}`)).toEqual([expect.stringContaining('maxSdkVersion="32"')])
  })
  it('our line is capped at API 32 and tells the merger to keep that value', () => {
    expect(ours).toContain('android:maxSdkVersion="32"')
    expect(ours).toContain('tools:replace="android:maxSdkVersion"')
    expect(appManifest).toContain('xmlns:tools=')
  })
  it('a merged manifest with one capped declaration passes; an uncapped or missing one fails', () => {
    expect(checkExactAlarm(ours.replace(' tools:replace="android:maxSdkVersion"', ''))).toEqual([])
    expect(checkExactAlarm(`${ours}\n${theirs}`)).toHaveLength(1) // what a plain merge could leave
    expect(checkExactAlarm('<manifest />')).toEqual([expect.stringContaining('missing')])
    expect(checkExactAlarm('<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />')).toEqual([expect.stringContaining('missing')])
  })
  it('lists every permission with its cap and drops removed ones', () => {
    const list = permissions(`${appManifest}\n${pluginManifest}`)
    expect(list).toContain('ACCESS_BACKGROUND_LOCATION')
    expect(list).toContain('SCHEDULE_EXACT_ALARM (max sdk 32)')
    expect(list).toContain('POST_NOTIFICATIONS')
    expect(list.some((p) => p.includes('WRITE_STEPS'))).toBe(false) // tools:node="remove" in our manifest
    expect(list).toEqual([...list].sort())
    expect(permissions('<uses-permission android:name="android.permission.CAMERA" /><uses-permission android:name="x.Y" android:maxSdkVersion="29" />')).toEqual(['CAMERA', 'x.Y (max sdk 29)'])
  })
})
