import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../sensors/health', async (orig) => ({ ...(await orig<object>()), currentPersonId: async () => null, getState: async () => ({ enabled: [] }) }))
import { useSetupLeft } from './steps'

beforeEach(async () => { await db.kv.clear() })

describe('useSetupLeft', () => {
  it('lists the short names of what is still to do; a skipped Reminders step stays on it', async () => {
    const { result } = renderHook(() => useSetupLeft())
    await waitFor(() => expect(result.current.left.length).toBeGreaterThan(0))
    expect(result.current.left).toContain('Reminders')
    expect(result.current.left).toContain('Where you are')
    expect(result.current.left).toContain('SOS contacts')
    expect(result.current.left).not.toContain('Health data') // Android only
  })

  it('a step that is done leaves the row', async () => {
    await db.kv.put({ key: 'loc.asked', value: true })
    await db.kv.put({ key: 'profile.photo', value: 'data:image/jpeg;base64,AA==' })
    const { result } = renderHook(() => useSetupLeft())
    await waitFor(() => expect(result.current.left.length).toBeGreaterThan(0))
    expect(result.current.left).not.toContain('Where you are')
    expect(result.current.left).not.toContain('Photo')
    expect(result.current.left).toContain('Reminders')
  })
})
