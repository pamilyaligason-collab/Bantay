import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { h, stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }), h: { storm: null as null | { title: string; body: string }, feel: vi.fn(), result: 'told' as string, checkIn: vi.fn(), act: vi.fn(), read: vi.fn(), can: null as null | { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null } } }))
vi.mock('./useStorm', () => ({ useStorm: () => h.storm }))
vi.mock('./useMyTakes', () => ({ useMyMedications: () => [], useMyDoseRows: () => [] }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'p1', useActingCan: () => h.can }))
vi.mock('../log/store', async (orig) => ({ ...(await orig<typeof import('../log/store')>()), logActivity: (a: unknown) => { h.act(a); return Promise.resolve(1) }, logReading: (r: unknown) => { h.read(r); return Promise.resolve(1) } }))
vi.mock('../sensors/QuickWalk', () => stub('walk'))
vi.mock('../exercise/MovePanel', () => stub('move'))
vi.mock('../nutrition/PlateSheet', () => stub('meal'))
vi.mock('../nutrition/SaltSummary', () => stub('salt'))
vi.mock('../nutrition/WaterSheet', () => stub('water'))
vi.mock('../health/bpcheck/BpCheckButton', () => ({ default: () => <button type="button">Guided check</button> }))
vi.mock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), logFeeling: (f: string, id?: string) => { h.feel(f, id); return Promise.resolve(h.result) }, checkIn: (id?: string) => { h.checkIn(id); return Promise.resolve('ok') } }))
import QuickLog from './QuickLog'

afterEach(() => { cleanup(); h.storm = null; h.result = 'told'; h.can = null; for (const f of [h.feel, h.checkIn, h.act, h.read]) f.mockReset() })

describe('QuickLog (today-log)', () => {
  it("six tiles plus the small I'm OK beside How are you?", () => {
    render(<QuickLog notify={() => undefined} />)
    const tiles = screen.getByRole('group', { name: 'Quick log' }).querySelectorAll('button')
    expect([...tiles].map((b) => b.textContent)).toEqual(['BP', 'Sugar', 'Weight', 'How are you?', "I'm OK", 'Water', 'More'])
  })
  it('in a storm the mood tile reads Is everyone safe?', () => {
    h.storm = { title: 'Pepito is near', body: 'about 300 km east' }
    render(<QuickLog notify={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Log how you feel' }).textContent).toBe('Is everyone safe?')
  })
  it('More holds Dose taken, Food, Walk, Move, Pain, Sleep, Temperature, Mood and Water; each opens its sheet', () => {
    render(<QuickLog notify={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'More things to log' }))
    expect([...screen.getByRole('dialog', { name: 'More' }).querySelectorAll('button.td-opt')].map((b) => b.textContent)).toEqual(['Dose taken', 'Food', 'Walk', 'Move', 'Pain', 'Sleep', 'Temperature', 'Mood', 'Water'])
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
    expect(h.feel).toHaveBeenCalledWith('unwell', 'p1') // the acting person's id (own id when not acting)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('an Unwell alert that did not reach the server is not reported as told', async () => {
    h.result = 'untold'
    const notify = vi.fn()
    render(<QuickLog notify={notify} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log how you feel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls[0]![0]).toMatch(/We will tell them when you are online/)
  })
  it("I'm OK checks in for the viewed person and says so (D-100)", async () => {
    const notify = vi.fn()
    render(<QuickLog notify={notify} />)
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved. Your family can see you are OK.'))
    expect(h.checkIn).toHaveBeenCalledWith('p1')
  })
  it('Temperature, Sleep and Pain write the reading or activity for the viewed person, and a bad number writes nothing', async () => {
    const notify = vi.fn()
    render(<QuickLog notify={notify} />)
    const more = () => fireEvent.click(screen.getByRole('button', { name: 'More things to log' }))
    more(); fireEvent.click(screen.getByRole('button', { name: 'Temperature' }))
    fireEvent.change(screen.getByLabelText('Temperature (°C)'), { target: { value: '52' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toMatch(/30 to 45/)
    expect(h.read).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Temperature (°C)'), { target: { value: '37.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved temperature 37.5 °C'))
    expect(h.read).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', test: 'temperature', value: 37.5, unit: '°C' }))
    more(); fireEvent.click(screen.getByRole('button', { name: 'Sleep' }))
    fireEvent.change(screen.getByLabelText('Hours slept last night'), { target: { value: '6.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.act).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', kind: 'sleep', minutes: 390 })))
    more(); fireEvent.click(screen.getByRole('button', { name: 'Pain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Moderate' }))
    await waitFor(() => expect(h.act).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', kind: 'pain-5' })))
  })
  it('acting without the log right: tiles are locked with View only and the reason; the mood tile follows the mood right', () => {
    h.can = { log: false, edit: false, rollcall: false, mood: true, reason: 'You can see Mama but not log for her.' }
    render(<QuickLog notify={() => undefined} />)
    expect((screen.getByRole('button', { name: 'Log blood pressure, view only' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'More things to log, view only' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Log how you feel' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/View only\. You can see Mama but not log for her\./)).toBeTruthy()
  })
})
