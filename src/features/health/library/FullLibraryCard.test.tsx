import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullLibraryCard } from './FullLibraryCard'
import { _resetFullLibrary } from './fullLibrary'

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
  const fn = vi.fn(async (_u: string, init?: { signal?: AbortSignal }) => {
    let n = 0
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
  return { fn, release }
}

afterEach(cleanup)
beforeEach(async () => {
  vi.unstubAllGlobals()
  localStorage.clear()
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
    const del = await screen.findByRole('button', { name: /^Delete \(\d+ MB\)$/ })
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
    await u.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Get' }))
    await u.click(await screen.findByRole('button', { name: 'Download' }))
    expect(await screen.findByRole('progressbar')).toBeTruthy()
    expect(f.fn).toHaveBeenCalledTimes(1)
    f.release()
    await screen.findByRole('button', { name: /^Delete \(\d+ MB\)$/ })
  })
})
