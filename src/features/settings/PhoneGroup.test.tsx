import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../sensors/SensorSettings', () => ({ default: () => null }))
vi.mock('../today/SetupCard', () => ({ default: () => null }))
vi.mock('../family/FamilyPhones', () => ({ default: () => null }))
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => [] }))
const nat = vi.hoisted(() => ({ android: true }))
vi.mock('../safety/settingsOpener', () => ({ isNativeAndroid: () => nat.android }))
vi.mock('./useAccount', () => ({ useAccount: () => ({ member: null, roster: [] }) }))

import PhoneGroup from './PhoneGroup'

beforeEach(async () => { await db.kv.clear(); nat.android = true })
afterEach(cleanup)

describe('Settings > Phone > Update Bantay by itself', () => {
  it('is on by default, says what it does, and saves off then on', async () => {
    render(<PhoneGroup />)
    const sw = await screen.findByRole('switch', { name: 'Update Bantay by itself' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Checks once in a while for a new version on Wi-Fi and installs it, or tells you when one is ready to install.')).toBeTruthy()
    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('false')
    await waitFor(async () => expect((await db.kv.get('update.auto'))?.value).toBe(false))
    fireEvent.click(sw)
    await waitFor(async () => expect((await db.kv.get('update.auto'))?.value).toBe(true))
  })
  it('web build: no row (the runner is native Android only)', () => {
    nat.android = false
    render(<PhoneGroup />)
    expect(screen.queryByRole('switch', { name: 'Update Bantay by itself' })).toBeNull()
  })
  it('shows a saved off', async () => {
    await db.kv.put({ key: 'update.auto', value: false })
    render(<PhoneGroup />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Update Bantay by itself' }).getAttribute('aria-checked')).toBe('false'))
  })
})
