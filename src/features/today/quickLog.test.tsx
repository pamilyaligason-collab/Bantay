import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { h, stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }), h: { storm: null as null | { title: string; body: string }, feel: vi.fn(), result: 'told' as string } }))
vi.mock('./useStorm', () => ({ useStorm: () => h.storm }))
vi.mock('./useMyTakes', () => ({ useMyMedications: () => [], useMyDoseRows: () => [] }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('../sensors/QuickWalk', () => stub('walk'))
vi.mock('../exercise/MovePanel', () => stub('move'))
vi.mock('../nutrition/PlateSheet', () => stub('meal'))
vi.mock('../nutrition/SaltSummary', () => stub('salt'))
vi.mock('../nutrition/WaterSheet', () => stub('water'))
vi.mock('../health/bpcheck/BpCheckButton', () => ({ default: () => <button type="button">Guided check</button> }))
vi.mock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), logFeeling: (f: string) => { h.feel(f); return Promise.resolve(h.result) } }))
import QuickLog from './QuickLog'

afterEach(() => { cleanup(); h.storm = null; h.result = 'told'; h.feel.mockReset() })

describe('QuickLog (today-log)', () => {
  it('six tiles: BP, Sugar, Weight, How are you?, Water, More', () => {
    render(<QuickLog notify={() => undefined} />)
    const tiles = screen.getByRole('group', { name: 'Quick log' }).querySelectorAll('button')
    expect([...tiles].map((b) => b.textContent)).toEqual(['BP', 'Sugar', 'Weight', 'How are you?', 'Water', 'More'])
  })
  it('in a storm the mood tile reads Is everyone safe?', () => {
    h.storm = { title: 'Pepito is near', body: 'about 300 km east' }
    render(<QuickLog notify={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Log how you feel' }).textContent).toBe('Is everyone safe?')
  })
  it('More holds Dose taken, Food, Walk and Move; each opens its sheet', () => {
    render(<QuickLog notify={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'More things to log' }))
    expect([...screen.getByRole('dialog', { name: 'More' }).querySelectorAll('button.td-opt')].map((b) => b.textContent)).toEqual(['Dose taken', 'Food', 'Walk', 'Move'])
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByRole('dialog', { name: 'Meal' })).toBeTruthy()
  })
  it('the BP sheet offers the guided check', () => {
    render(<QuickLog notify={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log blood pressure' }))
    expect(screen.getByRole('button', { name: 'Guided check' })).toBeTruthy()
  })
  it('a face logs once and the toast says the family will see it in Bantay', async () => {
    const notify = vi.fn()
    render(<QuickLog notify={notify} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log how you feel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved. Your family will see it in Bantay.'))
    expect(h.feel).toHaveBeenCalledTimes(1)
    expect(h.feel).toHaveBeenCalledWith('unwell')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('an Unwell alert that did not reach the server is not reported as told', async () => {
    h.result = 'untold'
    const notify = vi.fn()
    render(<QuickLog notify={notify} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log how you feel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls[0]![0]).toMatch(/has not seen this/)
  })
})
