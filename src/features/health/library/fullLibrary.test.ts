import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetFullLibrary, download, getStatus, readArticle, remove, searchFullLibrary, FullLibraryError } from './fullLibrary'

// Built by scripts/medlib/test_mdwiki_pack.py (Hypertension, Diabetes mellitus). The specifier is a variable so tsc does not need @types/node.
const nodeFs = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ nodeFs)
// jsdom has no DecompressionStream (every WebView we ship to does); lend Node's.
const nodeWeb = 'node:stream/web'
globalThis.DecompressionStream ??= (await import(/* @vite-ignore */ nodeWeb)).DecompressionStream
const PACK = new Uint8Array(readFileSync('scripts/medlib/fixtures/mini.pack')) // vitest runs from the repo root)

/** fetch stand-in that honours Range (unless ignoreRange) and drops the connection after `dropAfter` bytes of a fresh (non-Range) request. */
function fakeFetch(opts: { ignoreRange?: boolean; dropAfter?: number } = {}) {
  const calls: Array<string | undefined> = []
  const fn = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
    const range = init?.headers?.Range
    calls.push(range)
    const partial = !!range && !opts.ignoreRange
    const from = partial ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0
    const drop = opts.dropAfter !== undefined && from === 0
    const body = PACK.slice(from, drop ? opts.dropAfter : undefined)
    let n = 0
    return {
      ok: true, status: partial ? 206 : 200,
      headers: { get: (h: string) => (h === 'content-length' ? String(PACK.length - from) : h === 'content-range' && partial ? `bytes ${from}-${PACK.length - 1}/${PACK.length}` : null) },
      body: {
        cancel: async () => undefined,
        getReader: () => ({ read: async () => {
          n++
          if (n === 1) return { done: false, value: body }
          if (drop) throw new Error('connection lost')
          return { done: true, value: undefined }
        } }),
      },
    }
  })
  return { fn, calls }
}

const storage = (usage: number, quota: number) => {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage, quota }), persist: vi.fn(async () => true) } })
}

beforeEach(async () => {
  vi.unstubAllGlobals()
  localStorage.clear()
  _resetFullLibrary()
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('bantay-medlib'); r.onsuccess = r.onerror = r.onblocked = () => res() })
  _resetFullLibrary()
  storage(0, 10 * 1024 * 1024 * 1024)
})

describe('full library pack', () => {
  it('downloads, reports progress, then searches titles and reads an article', async () => {
    vi.stubGlobal('fetch', fakeFetch().fn)
    expect((await getStatus()).state).toBe('none')
    expect(await searchFullLibrary('hyper')).toEqual([])
    const seen: number[] = []
    await download({ onProgress: (p) => seen.push(p.bytes) })
    expect(seen[seen.length - 1]).toBe(PACK.length)
    expect(await getStatus()).toMatchObject({ state: 'ready', bytes: PACK.length, total: PACK.length })
    expect(navigator.storage.persist).toHaveBeenCalled()
    expect(await searchFullLibrary('hyper')).toEqual([{ title: 'Hypertension', snippet: 'High blood pressure is common.', key: 'Hypertension' }])
    expect((await searchFullLibrary('MELLITUS'))[0].key).toBe('Diabetes mellitus')
    expect(await searchFullLibrary('zzz')).toEqual([])
    const a = await readArticle('Hypertension')
    expect(a?.text).toBe('High blood pressure is common.\n\n## Treatment\n- Salt less\n- Walk daily')
    expect(a?.url).toBe('https://mdwiki.org/wiki/Hypertension')
    expect(await readArticle('Nope')).toBeNull()
  })

  it('resumes with a Range request after the connection drops', async () => {
    const f = fakeFetch({ dropAfter: 300 })
    vi.stubGlobal('fetch', f.fn)
    await expect(download()).rejects.toBeInstanceOf(FullLibraryError)
    expect(await getStatus()).toMatchObject({ state: 'error', bytes: 300 })
    await download()
    expect(f.calls).toEqual([undefined, 'bytes=300-'])
    expect(await getStatus()).toMatchObject({ state: 'ready', bytes: PACK.length })
    expect(await searchFullLibrary('diabetes')).toHaveLength(1)
  })

  it('starts over when the server ignores Range', async () => {
    vi.stubGlobal('fetch', fakeFetch({ dropAfter: 300 }).fn)
    await expect(download()).rejects.toThrow()
    vi.stubGlobal('fetch', fakeFetch({ ignoreRange: true }).fn)
    await download()
    expect(await getStatus()).toMatchObject({ state: 'ready', bytes: PACK.length })
    expect(await readArticle('Diabetes mellitus')).not.toBeNull()
  })

  it('refuses with a clear message when there is too little space, and stores nothing', async () => {
    storage(0, 100 * 1024 * 1024) // under the 200 MB headroom
    vi.stubGlobal('fetch', fakeFetch().fn)
    const err = await download().catch((e) => e)
    expect(err).toBeInstanceOf(FullLibraryError)
    expect(err.code).toBe('low-space')
    expect(err.message).toMatch(/Not enough free space/)
    expect((await getStatus()).bytes).toBe(0)
  })

  it('asks first when the connection is known not to be Wi-Fi', async () => {
    const f = fakeFetch()
    vi.stubGlobal('fetch', f.fn)
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular' } })
    const err = await download().catch((e) => e)
    expect(err.code).toBe('needs-confirm')
    expect(f.fn).not.toHaveBeenCalled()
    await download({ confirmed: true })
    expect((await getStatus()).state).toBe('ready')
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
  })

  it('cancel erases the partial download; remove deletes a ready pack', async () => {
    const c = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => { c.abort(); throw new Error('aborted') }))
    const err = await download({ signal: c.signal }).catch((e) => e)
    expect(err.code).toBe('aborted')
    expect((await getStatus()).state).toBe('none')
    vi.stubGlobal('fetch', fakeFetch().fn)
    await download()
    expect((await getStatus()).state).toBe('ready')
    await remove()
    expect(await getStatus()).toMatchObject({ state: 'none', bytes: 0 })
    expect(await searchFullLibrary('hyper')).toEqual([])
    expect(await readArticle('Hypertension')).toBeNull()
  })
})
