import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ state: 'denied' as 'granted' | 'denied' | 'unavailable', request: vi.fn() }))
vi.mock('../sos/call', () => ({ callPermission: async () => h.state, requestCallPermission: h.request }))
import Wizard from './Wizard'

beforeEach(async () => {
  await db.kv.clear(); h.state = 'denied'; h.request.mockReset(); h.request.mockImplementation(async () => { h.state = 'granted'; return 'granted' })
})
afterEach(() => cleanup())

describe('SOS contacts card asks for CALL_PHONE (the only setup ask)', () => {
  it('shows the ask when calling is not allowed yet; the tap prompts once and the card goes away', async () => {
    render(<Wizard start="sos" onDone={() => undefined} />)
    const btn = await screen.findByRole('button', { name: 'Allow calling' })
    expect(h.request).not.toHaveBeenCalled() // opening the card never prompts
    await userEvent.click(btn)
    expect(h.request).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Allow calling' })).toBeNull())
  })
  it.each(['granted', 'unavailable'] as const)('%s: no ask is shown', async (state) => {
    h.state = state
    render(<Wizard start="sos" onDone={() => undefined} />)
    await screen.findByLabelText('Contact 1 name')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: 'Allow calling' })).toBeNull()
  })
})
