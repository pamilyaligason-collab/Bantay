import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../sensors/SensorSettings', () => ({ default: () => null }))
vi.mock('../today/SetupCard', () => ({ default: () => null }))
vi.mock('../family/FamilyPhones', () => ({ default: () => null }))
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => [] }))
vi.mock('./useAccount', () => ({ useAccount: () => ({ member: null, roster: [] }) }))

import PhoneGroup from './PhoneGroup'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('Settings > Phone > Update Bantay by itself', () => {
  it('is on by default, says what it does, and saves off then on', async () => {
    render(<PhoneGroup />)
    const sw = await screen.findByRole('switch', { name: 'Update Bantay by itself' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Checks once in a while and installs new versions on Wi-Fi. Android may ask you to tap Install the first time.')).toBeTruthy()
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect((await db.kv.get('update.auto'))?.value).toBe(false))
    fireEvent.click(sw)
    await waitFor(async () => expect((await db.kv.get('update.auto'))?.value).toBe(true))
  })
  it('shows a saved off', async () => {
    await db.kv.put({ key: 'update.auto', value: false })
    render(<PhoneGroup />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Update Bantay by itself' }).getAttribute('aria-checked')).toBe('false'))
  })
})
