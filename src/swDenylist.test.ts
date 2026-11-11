import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The service worker answers navigations with the app shell. Pages that are their own document must be on its denylist,
// or a phone that once opened Bantay sees the app instead of the installer page (S31 live find, 2026-11-11).
describe('service worker navigation denylist', () => {
  const src = readFileSync('src/sw.ts', 'utf8')
  const list = /denylist: \[([^\]]+)\]/.exec(src)![1]!
  const res = [...list.matchAll(/\/(.+?)\/(?=,|\s*$)/g)].map((m) => new RegExp(m[1]!))
  const skipped = (path: string) => res.some((r) => r.test(path))
  it('leaves /admin, /get and plain .html pages to the server', () => {
    for (const p of ['/admin', '/admin/', '/get', '/get/', '/get/?v=1', '/get?v=1','/privacypolicy.html', '/breach-plan.html']) expect(skipped(p), p).toBe(true)
  })
  it('still serves the app shell for app routes', () => {
    for (const p of ['/', '/today', '/getting-started', '/gettogether']) expect(skipped(p), p).toBe(false)
  })
})
