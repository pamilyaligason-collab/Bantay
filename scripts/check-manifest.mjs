// Usage: node scripts/check-manifest.mjs <merged AndroidManifest.xml>
// Asserts the merged manifest has no health.WRITE_ permission and exactly our four READ_ ones, the push pieces (POST_NOTIFICATIONS, the FCM MessagingService) and SCHEDULE_EXACT_ALARM capped at API 32,
// then prints every permission it ends up with.
import { readFileSync } from 'node:fs'

export const KEEP = ['READ_BLOOD_PRESSURE', 'READ_HEART_RATE', 'READ_SLEEP', 'READ_STEPS']

export function check(xml) {
  const perms = [...xml.matchAll(/<uses-permission[^>]*android:name="android\.permission\.health\.([A-Z_0-9]+)"[^>]*>/g)]
    .filter((m) => !/tools:node="remove"/.test(m[0]))
    .map((m) => m[1])
    .sort()
  const errors = []
  if (perms.some((p) => p.startsWith('WRITE_'))) errors.push('found health.WRITE_ permission')
  if (JSON.stringify(perms) !== JSON.stringify(KEEP)) errors.push(`health permissions are [${perms}] but must be exactly [${KEEP}]`)
  return errors
}

/** Push (lane E, D-85): the merged manifest must let the app show notifications (Android 13+ POST_NOTIFICATIONS) and receive FCM (the push plugin's MessagingService, which listens for com.google.firebase.MESSAGING_EVENT). */
export function checkPush(xml) {
  const errors = []
  if (!/<uses-permission[^>]*android:name="android\.permission\.POST_NOTIFICATIONS"(?![^>]*tools:node="remove")[^>]*>/.test(xml)) errors.push('POST_NOTIFICATIONS permission is missing')
  if (!/com\.capacitorjs\.plugins\.pushnotifications\.MessagingService/.test(xml) || !/com\.google\.firebase\.MESSAGING_EVENT/.test(xml)) errors.push('the push plugin MessagingService (com.google.firebase.MESSAGING_EVENT) is missing: is @capacitor/push-notifications synced?')
  return errors
}

/** Every permission the manifest ends up with, as `NAME` or `NAME (max sdk N)`, sorted; a tools:node="remove" entry is not a permission. */
export function permissions(xml) {
  return [...xml.matchAll(/<uses-permission(?:-sdk-23)?\s[^>]*>/g)]
    .filter((m) => !/tools:node="remove"/.test(m[0]))
    .map((m) => {
      const name = (/android:name="([^"]+)"/.exec(m[0])?.[1] ?? '?').replace(/^android\.permission\./, '')
      const max = /android:maxSdkVersion="(\d+)"/.exec(m[0])?.[1]
      return max ? `${name} (max sdk ${max})` : name
    })
    .sort()
}

/** The Background Runner plugin declares SCHEDULE_EXACT_ALARM with no cap and a plain merge would drop ours (D-150): in the MERGED manifest every declaration of it must be capped at API 32. */
export function checkExactAlarm(xml) {
  const tags = [...xml.matchAll(/<uses-permission\s[^>]*android:name="android\.permission\.SCHEDULE_EXACT_ALARM"[^>]*>/g)].filter((m) => !/tools:node="remove"/.test(m[0]))
  const errors = []
  if (!tags.length) errors.push('SCHEDULE_EXACT_ALARM is missing (reminders on Android 12 need it)')
  if (tags.some((m) => !/android:maxSdkVersion="32"/.test(m[0]))) errors.push('SCHEDULE_EXACT_ALARM has no maxSdkVersion="32" cap in the merged manifest: a plugin manifest overrode ours (keep tools:replace="android:maxSdkVersion")')
  return errors
}

/** D-151: the daily background run reads no position, so the merged manifest must not hold ACCESS_BACKGROUND_LOCATION. The Background Runner plugin declares it; our manifest strips it with tools:node="remove". */
export function checkNoBackgroundLocation(xml) {
  const live = [...xml.matchAll(/<uses-permission\s[^>]*android:name="android\.permission\.ACCESS_BACKGROUND_LOCATION"[^>]*>/g)].filter((m) => !/tools:node="remove"/.test(m[0]))
  return live.length ? ['ACCESS_BACKGROUND_LOCATION is in the merged manifest: the daily run sends no position (D-151), so it must be stripped (keep tools:node="remove" in android/app/src/main/AndroidManifest.xml)'] : []
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('check-manifest.mjs')) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node scripts/check-manifest.mjs <merged manifest>'); process.exit(2) }
  const xml = readFileSync(file, 'utf8')
  const errors = [...check(xml), ...checkPush(xml), ...checkExactAlarm(xml), ...checkNoBackgroundLocation(xml)]
  const all = permissions(xml)
  console.log(`permissions (${all.length}):\n  ${all.join('\n  ')}`) // D-150: a plugin can add one without a word in our own manifest, so read the whole list every release
  if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
  console.log('merged manifest ok: 4 read-only health permissions, notifications and FCM receiver present, SCHEDULE_EXACT_ALARM capped at API 32, no ACCESS_BACKGROUND_LOCATION')
}
