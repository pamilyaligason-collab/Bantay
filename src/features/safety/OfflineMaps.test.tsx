import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const flags = vi.hoisted(() => ({ offlineMaps: false }))
vi.mock('./flags', () => ({ FLAGS: flags }))
import OfflineMaps from './OfflineMaps'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('OfflineMaps', () => {
  it('flag off: only the empty state', () => {
    flags.offlineMaps = false
    render(<OfflineMaps />)
    expect(screen.getByText('Offline maps are not ready yet. They arrive with the Bohol map pack.')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to Safety' }).getAttribute('href')).toBe('#safety')
  })
  it('flag on: switches, four regions, Not downloaded, no sizes', async () => {
    flags.offlineMaps = true
    render(<OfflineMaps />)
    for (const r of ['Bohol', 'Mindanao', 'Rest of the Visayas', 'Luzon']) expect(screen.getByText(r)).toBeTruthy()
    expect(screen.getAllByText('Not downloaded')).toHaveLength(4)
    expect(document.body.textContent).not.toMatch(/\d\s?(MB|GB)/)
    fireEvent.click(screen.getByRole('switch', { name: 'Wi-Fi only' }))
    await waitFor(async () => expect(((await db.kv.get('safety.offlinePrefs'))?.value as { wifiOnly: boolean }).wifiOnly).toBe(false))
  })
})
