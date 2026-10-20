import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Windows (the APK build machine) ignores case, so `./kpis` can resolve to Kpis.tsx there while Linux CI passes.
const CODE = /\.(tsx?|mts|jsx?|mjs)$/

function collisions(dir: string): string[] {
  const seen = new Map<string, string>()
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { out.push(...collisions(join(dir, e.name))); continue }
    if (!CODE.test(e.name)) continue
    const mod = e.name.replace(CODE, '')
    const prev = seen.get(mod.toLowerCase())
    if (prev && prev !== mod) out.push(`${join(dir, prev)} / ${join(dir, mod)}`)
    else seen.set(mod.toLowerCase(), mod)
  }
  return out
}

describe('file names', () => {
  it('no two modules in one folder differ only in letter case', () => {
    expect(collisions('src')).toEqual([])
  })
})
