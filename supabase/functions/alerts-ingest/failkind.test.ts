// @vitest-environment node
// 2026-11-10 09:10 UTC: publicalert.pagasa.dost.gov.ph stopped answering (connect timeout); every run since ended ok=false with no way to tell why.
// The failure kind is reported as a flag (counts-only heartbeat), never as error text.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type FailKind, failKind, type Port, runIngest } from './ingest.ts'
import { FEED_URL } from './pagasa.ts'

describe('failKind', () => {
  it('names the four kinds', () => {
    expect(failKind(new DOMException('signal timed out', 'TimeoutError'))).toBe('timeout')
    expect(failKind(new DOMException('aborted', 'AbortError'))).toBe('timeout')
    expect(failKind(new Error('HTTP503'))).toBe('http')
    expect(failKind(new Error('HTTP404'))).toBe('http')
    expect(failKind(new Error('unexpected payload'))).toBe('payload')
    expect(failKind(new SyntaxError('Unexpected end of JSON input'))).toBe('payload')
    expect(failKind(new Error('write'))).toBe('other')
    expect(failKind('boom')).toBe('other')
  })
})

describe('runIngest onFail', () => {
  const port: Port = {
    existing: async () => new Map(), upsert: async () => {}, setStale: async () => {}, members: async () => [], notify: async () => 0, flush: async () => {}
  }
  it('PAGASA feed timing out is reported as timeout for PAGASA only; the other sources keep their own result', async () => {
    const why = new Map<string, FailKind>()
    const fetchText = async (u: string) => {
      if (u === FEED_URL) throw new DOMException('The signal has been aborted', 'TimeoutError')
      if (u.includes('usgs.gov')) return readFileSync(new URL('./fixtures/usgs.json', import.meta.url), 'utf8')
      throw new Error('HTTP500')
    }
    const res = await runIngest(port, fetchText, 1792240000000, Date.now, (s, k) => why.set(s, k))
    expect(res.PAGASA).toEqual({ ok: false, rows: 0 })
    expect(res.USGS.ok).toBe(true)
    expect(why.get('PAGASA')).toBe('timeout')
    expect(why.get('GDACS')).toBe('http')
    expect(why.has('USGS')).toBe(false)
  })
  it('index.ts sends the kind as booleans only', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(src).toContain("pagasa_timeout: why.get('PAGASA') === 'timeout'")
    expect(src).not.toMatch(/\.(catch|finally)\(\)\s*=>\s*why/)
  })
})
