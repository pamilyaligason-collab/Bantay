// Usage: node scripts/check-manifest.mjs <merged AndroidManifest.xml>
// Asserts the merged manifest has no health.WRITE_ permission and exactly our four READ_ ones, plus the push pieces (POST_NOTIFICATIONS, the FCM MessagingService).
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

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('check-manifest.mjs')) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node scripts/check-manifest.mjs <merged manifest>'); process.exit(2) }
  const xml = readFileSync(file, 'utf8')
  const errors = [...check(xml), ...checkPush(xml)]
  if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
  console.log('merged manifest ok: 4 read-only health permissions, notifications and FCM receiver present')
}
