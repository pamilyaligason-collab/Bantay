import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { useStoredBasemaps } from './basemap'

const row = (code: string, basemap?: { checksum: string }) => ({ code, version: 1, checksum: 'x', name: code, neighbours: [], places: [], fetchedAt: 1, usedAt: 1, pinned: true, ...(basemap ? { basemap: { ...basemap, bounds: [1, 2, 3, 4] as [number, number, number, number], blob: new Blob(['x']), savedAt: 's' } } : {}) })

describe('useStoredBasemaps', () => {
  beforeEach(async () => { await db.packs.clear() })
  it('lists only rows with a basemap and follows a download and a removal', async () => {
    await db.packs.bulkPut([row('A'), row('B', { checksum: 'b1' })])
    const { result } = renderHook(() => useStoredBasemaps())
    await waitFor(() => expect(result.current.map((s) => s.code)).toEqual(['B']))
    await act(async () => { await db.packs.put(row('A', { checksum: 'a1' })) })
    await waitFor(() => expect(result.current.map((s) => s.code).sort()).toEqual(['A', 'B']))
    await act(async () => { await db.packs.put(row('B')) }) // basemap removed, pack kept
    await waitFor(() => expect(result.current.map((s) => s.code)).toEqual(['A']))
  })
  it('starts empty', () => {
    expect(renderHook(() => useStoredBasemaps()).result.current).toEqual([])
  })
})
