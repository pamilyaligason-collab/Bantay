import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Same rules as parseLatest in the P2 plan (Task 3). Lane G owns check.ts; this copy pins the release script's output shape.
const GH = /^https:\/\/github\.com\/pamilyaligason-collab\/Bantay\/releases\/download\/[^/]+\/[^/]+\.apk$/
function parseLatest(x: unknown): Record<string, unknown> | null {
  const o = x as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const okNum = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!okNum(o.versionCode) || !okNum(o.size) || !okNum(o.minShell)) return null
  if (typeof o.url !== 'string' || !GH.test(o.url)) return null
  if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(o.sha256)) return null
  if (typeof o.versionName !== 'string' || typeof o.notes !== 'string') return null
  return o
}

describe('scripts/fixtures/latest.sample.json (release script dry run)', () => {
  const sample = JSON.parse(readFileSync('scripts/fixtures/latest.sample.json', 'utf8').replace(/^﻿/, ''))
  it('passes the parseLatest rules', () => expect(parseLatest(sample)).not.toBeNull())
  it('versionCode = major*1_000_000 + minor*1_000 + patch', () => {
    const [a, b, c] = String(sample.versionName).split('.').map(Number)
    expect(sample.versionCode).toBe(a * 1_000_000 + b * 1_000 + c)
  })
  it('url names the same version', () => expect(sample.url).toContain(`/v${sample.versionName}/bantay-${sample.versionName}.apk`))
  it('rejects a bad hash and a foreign host', () => {
    expect(parseLatest({ ...sample, sha256: 'xyz' })).toBeNull()
    expect(parseLatest({ ...sample, url: 'https://evil.example/a.apk' })).toBeNull()
  })
})
