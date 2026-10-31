import 'fake-indexeddb/auto'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const who = vi.hoisted(() => ({ gate: null as null | (() => void), signedIn: true, hang: false }))
vi.mock('../auth/session', () => ({
  getMember: () => who.hang ? new Promise(() => {}) : who.signedIn
    ? new Promise((res) => { who.gate = () => res({ userId: 'u1', personId: 'me', role: 'admin', handle: null }) })
    : Promise.reject(new Error('no auth'))
}))
vi.mock('./useRecordsServer', () => ({ usePeople: (p: unknown[]) => p }))
import { hdb } from './store'
import { resetPersonChoice, useHealthData } from './useHealthData'

function Probe() { const d = useHealthData(); return <p data-testid="who">{d.ready ? d.personId || '(none)' : 'loading'}</p> }
beforeEach(async () => {
  resetPersonChoice(); who.gate = null; who.signedIn = true; who.hang = false
  await hdb.people.clear(); await hdb.readings.clear()
  await hdb.people.bulkPut([{ id: 'ma', name: 'Ma' }, { id: 'me', name: 'Zed' }, { id: 'aa', name: 'Ann' }] as never)
  await hdb.readings.put({ id: 'r1', personId: 'ma', test: 'bp_systolic', value: 140, unit: 'mmHg', takenAt: new Date().toISOString() } as never)
})
afterEach(cleanup)

describe('useHealthData default person', () => {
  it('waits for the member, then lands on Me even though only Ma has readings', async () => {
    render(<Probe />)
    await waitFor(() => expect(who.gate).not.toBeNull())
    await new Promise((r) => setTimeout(r, 300)) // let the Dexie load finish first
    expect(screen.getByTestId('who').textContent).toBe('loading') // ready only once the member is known
    act(() => who.gate!())
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('me'))
  })
  it('with nobody signed in it lands on the first person with readings', async () => {
    who.signedIn = false
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('ma'))
  })
  it('a getMember that never settles does not keep Health loading', async () => {
    who.hang = true
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('ma'), { timeout: 6000 })
  })
})
