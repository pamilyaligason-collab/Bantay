import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { KEY_PHONE_CHECK } from '../phonecheck/keys'

const h = vi.hoisted(() => ({ left: [] as string[] }))
vi.mock('../setup/steps', () => ({ useSetupLeft: () => ({ left: h.left }), turnOnReminders: vi.fn(), notifyState: vi.fn(), notifyDone: vi.fn() }))
vi.mock('../notify/AlertsBanner', () => ({ default: () => null }))
vi.mock('../update/UpdateCard', () => ({ UpdateCard: () => null }))
vi.mock('../update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('./NearbyList', () => ({ default: () => null }))
vi.mock('./WeekLine', () => ({ default: () => null }))
import { turnOnReminders } from '../setup/steps'
import NoticeStack, { AlertsOffCard, alertsAreOff } from './NoticeStack'

beforeEach(async () => { await db.kv.clear(); h.left = [] })
afterEach(cleanup)

describe('alertsAreOff', () => {
  it('only a known false counts; unknown is not off (ML-05)', () => {
    expect(alertsAreOff(undefined, undefined)).toBe(false)
    expect(alertsAreOff({ notif_ok: null }, undefined)).toBe(false)
    expect(alertsAreOff({ notif_ok: true }, { ok: true })).toBe(false)
    expect(alertsAreOff({ notif_ok: false }, undefined)).toBe(true)
    expect(alertsAreOff(undefined, { ok: false })).toBe(true)
  })
})

describe('AlertsOffCard', () => {
  it('is drawn only while the phone check says notifications are off, with the consequence line', async () => {
    const { container } = render(<AlertsOffCard />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { notif_ok: false } })
    expect(await screen.findByText('Reminders will not ring.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })
  it('after two failed tries the action opens the app settings', async () => {
    await db.kv.put({ key: KEY_PHONE_CHECK, value: { notif_ok: false } })
    render(<AlertsOffCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(turnOnReminders).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(await screen.findByRole('button', { name: 'Open app settings' })).toBeTruthy()
    expect(await db.kv.get('alerts.denied')).toBeUndefined() // the count is this visit's only; no stored key outside the contract
  })
})

describe('NoticeStack', () => {
  it('hides the More heading when nothing is under it', () => {
    render(<NoticeStack />)
    expect(document.querySelector('.td-more-g > h2')).toBeTruthy() // CSS hides a group whose only child is the heading
    expect(screen.queryByTestId('setup-row')).toBeNull()
  })
  it('shows the setup row with what is left and never hides it at half done', () => {
    h.left = ['SOS contacts', 'Photo']
    render(<NoticeStack />)
    const row = screen.getByTestId('setup-row')
    expect(row.textContent).toContain('2 left: SOS contacts, Photo')
    expect(row.querySelector('a')!.getAttribute('href')).toBe('#me')
  })
})
