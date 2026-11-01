import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import AlertSettings from './AlertSettings'
import { ALERT_KEY, URGENT_TEXT } from './prefs'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)
const saved = async () => (await db.kv.get(ALERT_KEY))?.value as Record<string, unknown> | undefined

describe('AlertSettings', () => {
  it('shows the urgent definition, the local-save note and a way back', () => {
    render(<AlertSettings />)
    expect(screen.getByText(URGENT_TEXT)).toBeTruthy()
    expect(screen.getByText(/Saved on this phone/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to World' }).getAttribute('href')).toBe('#safety/world')
  })
  it('toggling Philippines-wide warnings saves phWide false', async () => {
    render(<AlertSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Philippines-wide warnings' }))
    await waitFor(async () => expect((await saved())?.phWide).toBe(false))
  })
  it('turning off Hazards near family asks first and writes only on Turn off', async () => {
    render(<AlertSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Hazards near family' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(await saved()).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(async () => expect((await saved())?.nearFamily).toBe(false))
  })
  it('Keep on leaves it unchanged', async () => {
    render(<AlertSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Hazards near family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep on' }))
    expect(await saved()).toBeUndefined()
    expect(screen.getByRole('switch', { name: 'Hazards near family' }).getAttribute('aria-checked')).toBe('true')
  })
  it('has no SMS row while the flag is off', () => {
    render(<AlertSettings />)
    expect(screen.queryByRole('switch', { name: /SMS/ })).toBeNull()
  })
})
