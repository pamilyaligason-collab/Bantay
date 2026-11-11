import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  facts: {} as Record<string, unknown>,
  acted: [] as string[],
  upd: { shell: { versionCode: 2008000, versionName: '2.8.0' }, decision: { kind: 'none' }, latest: null, checkedAt: 1, checking: false, failed: false } as Record<string, unknown>,
  info: { versionCode: 2008000, versionName: '2.8.0', canInstall: true }
}))
vi.mock('./all/facts', () => ({ readFacts: async () => m.facts, visit: { testSent: false } }))
vi.mock('./all/actions', () => ({ act: async (id: string) => { m.acted.push(id); if (id === 'location') m.facts = { ...m.facts, location: 'granted' } } }))
vi.mock('../update/useUpdate', () => ({ useUpdate: () => m.upd, checkForUpdate: async () => m.upd }))
vi.mock('../update/job', () => ({ useJob: () => ({ phase: 'idle', done: 0, total: 0 }), getJob: () => ({ phase: 'idle', done: 0, total: 0 }), startJob: vi.fn() }))
vi.mock('../update/plugin', () => ({ AppUpdater: { info: async () => m.info, openInstallPermission: vi.fn() } }))
vi.mock('./steps', () => ({ onResume: () => () => undefined }))
vi.mock('../shell/Icon', () => ({ Icon: ({ name }: { name: string }) => <i data-icon={name} /> }))
vi.mock('../shell/SubHeader', () => ({ SubHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('../shell/useKv', () => ({ useKv: (_k: string, d: unknown) => [d, vi.fn(), true] }))

import AllScreen from './AllScreen'

const ON = { display: true, exact: true, battery: true }
beforeEach(() => {
  m.acted = []
  m.facts = { native: true, notifSupported: true, notif: { display: false, exact: false, battery: false }, location: 'ask', health: 'unavailable', library: 'none', libraryMB: 178, maps: 'none', testSent: false }
})
afterEach(cleanup)

describe('Set up everything screen (Android app)', () => {
  it('lists the steps with status words and one primary Do all', async () => {
    render(<AllScreen />)
    await screen.findByText(/steps left/)
    expect(screen.getByText('Reminders and alerts')).toBeTruthy()
    expect(screen.getAllByText('Needs one tap').length).toBeGreaterThan(2)
    expect(screen.getByText('Not on this phone')).toBeTruthy() // Health Connect missing is shown, not faked as done
    expect(screen.getAllByTestId('do-all')).toHaveLength(1)
  })
  it('a row button does exactly its own step', async () => {
    render(<AllScreen />)
    await screen.findByText(/steps left/)
    fireEvent.click(screen.getByRole('button', { name: 'Where you are: Share my location' }))
    await waitFor(() => expect(m.acted).toEqual(['location']))
  })
  it('Do all stops at the first step still waiting for the person and says which', async () => {
    render(<AllScreen />)
    await screen.findByText(/steps left/)
    fireEvent.click(screen.getByTestId('do-all'))
    await screen.findByText(/Waiting on "Reminders and alerts"/)
    expect(m.acted).toEqual(['notifications'])
  })
  it('with everything on it says All set and offers no Do all', async () => {
    m.facts = { ...m.facts, notif: ON, location: 'granted', testSent: true }
    render(<AllScreen />)
    await screen.findByText('All set')
    expect(screen.queryByTestId('do-all')).toBeNull()
  })
})
