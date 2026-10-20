import 'fake-indexeddb/auto'
import { cleanup, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const t = vi.hoisted(() => ({ track: vi.fn(async () => true) }))
vi.mock('../admin/events', () => ({ track: t.track }))
import { useSeenDaily } from './seen'

function Card() {
  const ref = useRef<HTMLDivElement>(null)
  useSeenDaily(ref, 'card_seen_my_week', true)
  return <div ref={ref}>card</div>
}

let fire: () => void = () => undefined
beforeEach(async () => {
  await db.kv.clear()
  t.track.mockClear()
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: (e: { isIntersecting: boolean }[]) => void) { fire = () => cb([{ isIntersecting: true }]) } observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('useSeenDaily', () => {
  it('sends once, then remembers the day', async () => {
    render(<Card />)
    fire()
    await waitFor(() => expect(t.track).toHaveBeenCalledWith('action', 'card_seen_my_week'))
    await waitFor(async () => expect((await db.kv.get('seen.card_seen_my_week'))?.value).toBeTruthy())
    cleanup()
    render(<Card />)
    fire()
    await new Promise((r) => setTimeout(r, 50))
    expect(t.track).toHaveBeenCalledTimes(1)
  })
  it('a refused event (signed out) does not use up the day', async () => {
    t.track.mockResolvedValueOnce(false)
    render(<Card />)
    fire()
    await waitFor(() => expect(t.track).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(await db.kv.get('seen.card_seen_my_week')).toBeUndefined()
  })
})
