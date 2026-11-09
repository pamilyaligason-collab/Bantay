import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet, PACK_NAME } from '../../../../functions/medlib/[file]'

afterEach(() => { vi.unstubAllGlobals() })
const call = (file: string, h: Record<string, string> = {}) => onRequestGet({ request: new Request('https://bantay.pages.dev/medlib/' + file, { headers: h }), params: { file } })

describe('medlib Pages Function (same-origin pack download)', () => {
  it('only dated pack names pass; anything else is 404 and never fetched', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    for (const bad of ['bantay-2.8.0.apk', 'medlib-mdwiki.pack', '../x', 'medlib-mdwiki-2026-11-01.pack/x']) expect((await call(bad)).status).toBe(404)
    expect(f).not.toHaveBeenCalled()
    expect(PACK_NAME.test('medlib-mdwiki-2026-11-09.pack')).toBe(true)
  })
  it('forwards Range and If-Range to the release asset and passes 206 with its range headers back', async () => {
    const f = vi.fn(async () => new Response('abc', { status: 206, headers: { 'content-range': 'bytes 10-12/900', 'content-length': '3', etag: '"v1"', 'set-cookie': 'x=1' } }))
    vi.stubGlobal('fetch', f)
    const r = await call('medlib-mdwiki-2026-11-09.pack', { range: 'bytes=10-', 'if-range': '"v1"', cookie: 'secret=1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://github.com/pamilyaligason-collab/Bantay/releases/download/medlib-v1/medlib-mdwiki-2026-11-09.pack')
    const sent = new Headers(init.headers)
    expect(sent.get('range')).toBe('bytes=10-')
    expect(sent.get('if-range')).toBe('"v1"')
    expect(sent.get('cookie')).toBeNull() // nothing else from the app goes to GitHub
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe('bytes 10-12/900')
    expect(r.headers.get('etag')).toBe('"v1"')
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(await r.text()).toBe('abc')
  })
  it('passes a missing asset through as 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })))
    expect((await call('medlib-mdwiki-2026-11-09.pack')).status).toBe(404)
  })
})
