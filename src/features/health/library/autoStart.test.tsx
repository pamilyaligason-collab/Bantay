import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { FullLibraryCard } from './FullLibraryCard'
import { startLibraryAuto, tryAutoLibrary } from './autoStart'
import { _resetFullLibrary, getStatus } from './fullLibrary'

const nodeFs = 'node:fs'
const { readFileSync } = await import(/* @vite-ignore */ nodeFs)
const nodeWeb = 'node:stream/web'
globalThis.DecompressionStream ??= (await import(/* @vite-ignore */ nodeWeb)).DecompressionStream
const PACK = new Uint8Array(readFileSync('scripts/medlib/fixtures/mini.pack'))

/** The whole pack in one 200 answer. */
const okFetch = () => vi.fn(async () => {
  let sent = false
  return {
    ok: true, status: 200,
    headers: { get: (h: string) => (h === 'content-length' ? String(PACK.length) : null) },
    body: { cancel: async () => undefined, getReader: () => ({ read: async () => (sent ? { done: true, value: undefined } : (sent = true, { done: false, value: PACK })) }) },
  }
})
const conn = (value: object) => Object.defineProperty(navigator, 'connection', { configurable: true, value })

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(async () => {
  vi.unstubAllGlobals()
  localStorage.clear()
  await db.kv.clear()
  _resetFullLibrary()
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('bantay-medlib'); r.onsuccess = r.onerror = r.onblocked = () => res() })
  _resetFullLibrary()
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: 0, quota: 1e12 }), persist: async () => true } })
  conn({ type: 'wifi' })
})

describe('library auto-download from app start (S28)', () => {
  it('saved yes + Wi-Fi: downloads without the Library page, once, even when asked twice at the same time', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const f = okFetch(); vi.stubGlobal('fetch', f)
    const r = await Promise.all([tryAutoLibrary(), tryAutoLibrary()])
    expect(r.filter(Boolean).length).toBe(1)
    expect(f).toHaveBeenCalledTimes(1)
    expect((await getStatus()).state).toBe('ready')
    expect(await tryAutoLibrary()).toBe(false) // already on the phone: nothing more
    expect(f).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['never asked', undefined],
    ['answered no', 'no'],
  ])('%s: nothing is downloaded', async (_n, v) => {
    if (v) await db.kv.put({ key: 'medlib.auto', value: v })
    const f = okFetch(); vi.stubGlobal('fetch', f)
    expect(await tryAutoLibrary()).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it.each([
    ['mobile data', { type: 'cellular' }],
    ['unknown link', {}],
    ['data saver on Wi-Fi', { type: 'wifi', saveData: true }],
  ])('%s: nothing is downloaded', async (_n, c) => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    conn(c)
    const f = okFetch(); vi.stubGlobal('fetch', f)
    expect(await tryAutoLibrary()).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('a permanent earlier failure blocks it until the app version changes', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    localStorage.setItem('bantay.medlib.fail', JSON.stringify({ permanent: true, at: Date.now(), v: 'dev' }))
    const f = okFetch(); vi.stubGlobal('fetch', f)
    expect(await tryAutoLibrary()).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('startLibraryAuto waits for idle time, then downloads; the stop function cancels a pending start', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    const f = okFetch(); vi.stubGlobal('fetch', f)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stop = startLibraryAuto()
    expect(f).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    vi.useRealTimers()
    await waitFor(async () => expect((await getStatus()).state).toBe('ready'))
    stop()
    const f2 = okFetch(); vi.stubGlobal('fetch', f2)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    startLibraryAuto()() // started and stopped before the idle timer fires
    await vi.advanceTimersByTimeAsync(10000)
    expect(f2).not.toHaveBeenCalled()
  })
})

describe('Library page parts (S28)', () => {
  const ready = async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    vi.stubGlobal('fetch', okFetch())
    expect(await tryAutoLibrary()).toBe(true)
  }
  it('once ready the card is gone and the small delete row shows the size', async () => {
    await ready()
    render(<><FullLibraryCard part="top" /><FullLibraryCard part="bottom" /></>)
    await screen.findByRole('button', { name: /Delete the full library \(\d+ MB\)/ })
    expect(screen.queryByTestId('full-library')).toBeNull()
    expect(screen.queryByText(/Download once on Wi-Fi/)).toBeNull()
  })
  it('the delete row asks first, Keep leaves it, Yes frees it, turns the consent off and tells the page', async () => {
    await ready()
    const onChange = vi.fn()
    const u = userEvent.setup()
    render(<FullLibraryCard part="bottom" onChange={onChange} />)
    await u.click(await screen.findByRole('button', { name: /Delete the full library/ }))
    await u.click(screen.getByRole('button', { name: 'Keep' }))
    expect((await getStatus()).state).toBe('ready')
    await u.click(screen.getByRole('button', { name: /Delete the full library/ }))
    await u.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect((await getStatus()).state).toBe('none')
    expect((await db.kv.get('medlib.auto'))?.value).toBe('no')
  })
  it('before it is ready the top card shows and the bottom row shows nothing, and the bottom never starts a download', async () => {
    await db.kv.put({ key: 'medlib.auto', value: 'yes' })
    conn({ type: 'cellular' })
    const f = okFetch(); vi.stubGlobal('fetch', f)
    render(<><FullLibraryCard part="top" /><FullLibraryCard part="bottom" /></>)
    expect(await screen.findByText(/Download once on Wi-Fi/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Delete the full library/ })).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
