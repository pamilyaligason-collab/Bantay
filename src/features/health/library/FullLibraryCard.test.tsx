import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullLibraryCard } from './FullLibraryCard'
import { db } from '../../../db'
import { _resetFullLibrary, getStatus } from './fullLibrary'

// Built by scripts/medlib/test_mdwiki_pack.py. The specifier is a variable so tsc does not need @types/node.
const nodeFs = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ nodeFs)
// jsdom has no DecompressionStream (every WebView we ship to does); lend Node's.
const nodeWeb = 'node:stream/web'
globalThis.DecompressionStream ??= (await import(/* @vite-ignore */ nodeWeb)).DecompressionStream
const PACK = new Uint8Array(readFileSync('scripts/medlib/fixtures/mini.pack'))

/** A download that sends half the pack, then waits until release() before sending the rest. */
function gatedFetch() {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const ranges: string[] = []
  const fn = vi.fn(async (_u: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => {
    let n = 0
    const range = init?.headers?.Range ?? ''
    ranges.push(range)
    const from = Number(/bytes=(\d+)-/.exec(range)?.[1]) || 0
    if (from > 0) { // a resume: serve the rest at once, as a real server does for a Range request
      let sent = false
      return {
        ok: true, status: 206,
        headers: { get: (h: string) => (h === 'content-range' ? `bytes ${from}-${PACK.length - 1}/${PACK.length}` : null) },
        body: { cancel: async () => undefined, getReader: () => ({ read: async () => (sent ? { done: true, value: undefined } : (sent = true, { done: false, value: PACK.slice(from) })) }) },
      }
    }
    return {
      ok: true, status: 200,
      headers: { get: (h: string) => (h === 'content-length' ? String(PACK.length) : null) },
      body: { cancel: async () => undefined, getReader: () => ({ read: async () => {
        n++
        if (n === 1) return { done: false, value: PACK.slice(0, PACK.length / 2) }
        await Promise.race([gate, new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))))])
        return n === 2 ? { done: false, value: PACK.slice(PACK.length / 2) } : { done: true, value: undefined }
      } }) },
    }
  })
  return { fn, release, ranges }
}

afterEach(cleanup)
beforeEach(async () => {
  vi.unstubAllGlobals()
  localStorage.clear()
  await db.kv.clear()
  _resetFullLibrary()
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('bantay-medlib'); r.onsuccess = r.onerror = r.onblocked = () => res() })
  _resetFullLibrary()
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: 0, quota: 1e12 }), persist: async () => true } })
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'wifi' } })
})

describe('FullLibraryCard', () => {
  it('idle -> downloading with percent and Cancel -> ready with Delete', async () => {
    const g = gatedFetch()
    vi.stubGlobal('fetch', g.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    expect(await screen.findByText(/Download once on Wi-Fi, then it works offline/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Get' }))
    const bar = await screen.findByRole('progressbar')
    await waitFor(() => expect(bar.getAttribute('aria-valuenow')).toBe(String(Math.floor(Math.floor(PACK.length / 2) / PACK.length * 100))))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    g.release()
    const del = await screen.findByRole('button', { name: 'Delete' })
    expect(screen.getByText(/Ready/)).toBeTruthy()
    await u.click(del)
    await u.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByRole('button', { name: 'Get' })).toBeTruthy()
  })

  it('Cancel stops the download and goes back to Get', async () => {
    vi.stubGlobal('fetch', gatedFetch().fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Get' }))
    await u.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Get' })).toBeTruthy()
    expect(screen.getByText('Download cancelled.')).toBeTruthy()
  })

  it('shows the low-space message', async () => {
    vi.stubGlobal('fetch', gatedFetch().fn)
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: 0, quota: 1000 }), persist: async () => true } })
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Get' }))
    expect(await screen.findByText(/Not enough free space/)).toBeTruthy()
  })

  it('asks before downloading when Wi-Fi is not confirmed', async () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Get' }))
    expect(await screen.findByText(/Wi-Fi is not confirmed\. Download \d+ MB anyway\?/)).toBeTruthy()
    expect(f.fn).not.toHaveBeenCalled()
    await u.click(screen.getAllByRole('button', { name: 'Not now' }).at(-1)!) // the Wi-Fi confirm row, below the consent question
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Get' }))
    await u.click(await screen.findByRole('button', { name: 'Download' }))
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(f.fn).toHaveBeenCalledTimes(1)
    f.release()
    await screen.findByRole('button', { name: 'Delete' })
  })
})

const conn = (type?: string, saveData = false) => Object.assign(new EventTarget(), { type, saveData })
const setConn = (c: unknown) => Object.defineProperty(navigator, 'connection', { configurable: true, value: c })
const consentRow = async () => (await db.kv.get('medlib.auto'))?.value

describe('FullLibraryCard automatic download (D-167)', () => {
  it('asks once, remembers Yes, and starts on Wi-Fi', async () => {
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    const r = render(<FullLibraryCard />)
    expect(await screen.findByText(/Download the full medical library \(\d+ MB\) on Wi-Fi automatically\?/)).toBeTruthy()
    expect(f.fn).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Yes' }))
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(await consentRow()).toBe('yes')
    f.release()
    await screen.findByRole('button', { name: 'Delete' })
    r.unmount()
    render(<FullLibraryCard />)
    await screen.findByRole('button', { name: 'Delete' })
    expect(screen.queryByText(/automatically\?/)).toBeNull()
  })

  it('Not now is remembered and never asks again, nothing downloads', async () => {
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    const r = render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(await consentRow()).toBe('no')
    r.unmount()
    render(<FullLibraryCard />)
    expect(await screen.findByText('Automatic Wi-Fi download is off.')).toBeTruthy()
    expect(screen.queryByText(/automatically\?/)).toBeNull()
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('with consent saved, a new app start resumes by itself on Wi-Fi', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    render(<FullLibraryCard />)
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(f.fn).toHaveBeenCalledTimes(1)
    f.release()
    await screen.findByRole('button', { name: 'Delete' })
  })

  it('consent but mobile data: no download until Wi-Fi, a tap still asks first', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    setConn(conn('cellular'))
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    expect(await screen.findByText('Automatic Wi-Fi download is on.')).toBeTruthy()
    expect(f.fn).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Get' }))
    expect(await screen.findByText(/Wi-Fi is not confirmed/)).toBeTruthy()
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('data saver on Wi-Fi also waits for a tap', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    setConn(conn('wifi', true))
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    render(<FullLibraryCard />)
    await screen.findByText('Automatic Wi-Fi download is on.')
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('pauses on mobile data keeping the partial file, resumes when Wi-Fi returns', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const c = conn('wifi')
    setConn(c)
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    render(<FullLibraryCard />)
    await screen.findByRole('progressbar')
    await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).not.toBe('0'))
    c.type = 'cellular'
    act(() => { c.dispatchEvent(new Event('change')) })
    expect(await screen.findByText(/Paused\. It carries on when Bantay is open on Wi-Fi\./)).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy() // partial kept, not erased
    const half = (await getStatus()).bytes
    expect(half).toBe(Math.floor(PACK.length / 2)) // slice() floors the half the gated fetch sent
    c.type = 'wifi'
    act(() => { c.dispatchEvent(new Event('change')) })
    await screen.findByRole('button', { name: 'Delete' }) // the second request carried on from the kept bytes and finished
    expect(f.fn).toHaveBeenCalledTimes(2)
    expect(f.ranges).toEqual(['bytes=0-', `bytes=${half}-`])
    expect(await getStatus()).toMatchObject({ state: 'ready', bytes: PACK.length, total: PACK.length })
  })

  it('an automatic download keeps pausing on mobile data after the card is gone, and a new card attaches to it', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const c = conn('wifi')
    setConn(c)
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const first = render(<FullLibraryCard />)
    await screen.findByRole('progressbar')
    first.unmount()
    // remounted mid-download: progress is shown and Cancel works on the running download
    const again = render(<FullLibraryCard />)
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(f.fn).toHaveBeenCalledTimes(1)
    again.unmount()
    c.type = 'cellular'
    act(() => { c.dispatchEvent(new Event('change')) })
    await waitFor(async () => expect((await getStatus()).state).not.toBe('downloading'))
    expect((await getStatus()).bytes).toBeGreaterThan(0) // partial kept for the resume
    expect(f.fn).toHaveBeenCalledTimes(1)
  })

  it('a remounted card can Cancel the running download', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />).unmount()
    // the first card started the download on mount; a second one attaches
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(async () => expect((await getStatus()).state).not.toBe('downloading'))
  })

  it('a manual Get on Wi-Fi also pauses when the connection turns to mobile data', async () => {
    const c = conn('wifi')
    setConn(c)
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Get' }))
    await screen.findByRole('progressbar')
    c.type = 'cellular'
    act(() => { c.dispatchEvent(new Event('change')) })
    expect(await screen.findByText(/Paused\. It carries on when Bantay is open on Wi-Fi\./)).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('a change event that does not change the type does not pause', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const c = conn('wifi')
    setConn(c)
    vi.stubGlobal('fetch', gatedFetch().fn)
    render(<FullLibraryCard />)
    await screen.findByRole('progressbar')
    act(() => { c.dispatchEvent(new Event('change')) })
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('after a permanent failure the card does not start again by itself on the next open', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const missing = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => null }, body: null }))
    vi.stubGlobal('fetch', missing)
    const first = render(<FullLibraryCard />)
    expect(await screen.findByText(/not available yet \(HTTP 404\)/)).toBeTruthy()
    expect(missing).toHaveBeenCalledTimes(1)
    first.unmount()
    render(<FullLibraryCard />)
    await screen.findByText('Automatic Wi-Fi download is on.')
    expect(missing).toHaveBeenCalledTimes(1)
  })

  it('a manual cellular download is not paused by a network change', async () => {
    const c = conn('cellular')
    setConn(c)
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Get' }))
    await u.click(await screen.findByRole('button', { name: 'Download' }))
    await screen.findByRole('progressbar')
    act(() => { c.dispatchEvent(new Event('change')) })
    expect(screen.getByRole('progressbar')).toBeTruthy()
    f.release()
    await screen.findByRole('button', { name: 'Delete' })
  })

  it('Delete asks to confirm, Keep leaves it, Yes frees it and turns the consent off', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const f = gatedFetch()
    vi.stubGlobal('fetch', f.fn)
    const u = userEvent.setup()
    render(<FullLibraryCard />)
    await screen.findByRole('progressbar')
    f.release()
    await u.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/It will not download again by itself/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByText(/Ready · \d+ MB/)).toBeTruthy()
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await u.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByRole('button', { name: 'Get' })).toBeTruthy()
    expect(await consentRow()).toBe('no')
    expect(f.fn).toHaveBeenCalledTimes(1) // no re-download after delete
  })

  it('the consent can be switched in the same card', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'no' })
    const u = userEvent.setup()
    setConn(conn('cellular'))
    render(<FullLibraryCard />)
    await u.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(await consentRow()).toBe('yes')
    await u.click(await screen.findByRole('button', { name: 'Turn off' }))
    expect(await consentRow()).toBe('no')
  })
})
