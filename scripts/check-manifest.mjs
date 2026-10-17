// Usage: node scripts/check-manifest.mjs <merged AndroidManifest.xml>
// Asserts the merged manifest has no health.WRITE_ permission and exactly our four READ_ ones.
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

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('check-manifest.mjs')) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node scripts/check-manifest.mjs <merged manifest>'); process.exit(2) }
  const errors = check(readFileSync(file, 'utf8'))
  if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
  console.log('merged manifest ok: 4 read-only health permissions')
}
