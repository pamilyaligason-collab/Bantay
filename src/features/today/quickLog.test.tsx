import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { h, stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }), h: { storm: null as null | { title: string; body: string }, feel: vi.fn(), result: 'told' as string, checkIn: vi.fn(), act: vi.fn(), read: vi.fn(), take: vi.fn(), meds: [] as unknown[], baby: false, can: null as null | { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null } } }))

vi.mock('./useMyTakes', () => ({ useMyMedications: () => h.meds, useMyDoseRows: () => [] }))
vi.mock('../setup/useProfile', () => ({ useSelfPersonId: () => 'p1' }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'p1', useActingCan: () => h.can }))
vi.mock('../log/store', async (orig) => ({ ...(await orig<typeof import('../log/store')>()), logActivity: (a: unknown) => { h.act(a); return Promise.resolve(1) }, logReading: (r: unknown) => { h.read(r); return Promise.resolve(1) } }))
vi.mock('../sensors/QuickWalk', () => stub('walk'))
vi.mock('../exercise/MovePanel', () => ({ default: (p: { lockLog?: string; hideRing?: boolean }) => <div data-testid="move" data-lock={p.lockLog ?? ''} data-other={String(!!p.hideRing)} /> }))
vi.mock('../nutrition/PlateSheet', () => stub('meal'))
vi.mock('../nutrition/SaltSummary', () => stub('salt'))
vi.mock('../nutrition/WaterSheet', () => stub('water'))
vi.mock('../nutrition/hooks', () => ({ useGoal: () => ({ waterMl: h.baby ? null : 1500 }) })) // no water goal under 1 year
vi.mock('../health/bpcheck/BpCheckButton', () => ({ default: () => <button type="button">Guided check</button> }))
vi.mock('./actions', async (orig) => ({ ...(await orig<typeof import('./actions')>()), logFeeling: (f: string, id?: string) => { h.feel(f, id); return Promise.resolve(h.result) }, checkIn: (id?: string) => { h.checkIn(id); return Promise.resolve('ok') }, takeMedication: (m: unknown, _t: unknown, id?: string) => { h.take(m, id); return Promise.resolve('ok') } }))
import { MoodSheet, MoreSheet } from './QuickLog'
const mood = (notify: (m: string) => void = () => undefined) => render(<MoodSheet onClose={() => undefined} notify={notify} />)
const more = (notify: (m: string) => void = () => undefined) => render(<MoreSheet onClose={() => undefined} notify={notify} />)

afterEach(() => { cleanup(); h.storm = null; h.result = 'told'; h.can = null; h.meds = []; h.baby = false; for (const f of [h.feel, h.checkIn, h.act, h.read, h.take]) f.mockReset() })

describe('log sheets (MoodSheet, MoreSheet)', () => {
  it('More holds the readings that lost their tile, then Dose taken, Food, Walk, Move, Pain, Sleep, Temperature, Mood and Water; each opens its sheet', () => {
    more()
    expect([...screen.getByRole('dialog', { name: 'More' }).querySelectorAll('button.td-opt')].map((b) => b.textContent)).toEqual(['Blood pressure', 'Sugar', 'Weight', 'Dose taken', 'Food', 'Walk', 'Move', 'Pain', 'Sleep', 'Temperature', 'Mood', 'Water'])
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByRole('dialog', { name: 'Meal' })).toBeTruthy()
  })
  it('a baby under 1 year has no Water option in More', () => {
    h.baby = true
    more()
    const names = [...screen.getByRole('dialog', { name: 'More' }).querySelectorAll('button.td-opt')].map((b) => b.textContent)
    expect(names).not.toContain('Water')
    expect(names).toHaveLength(11)
  })
  it('acting with log rights, More > Move is locked as on the Move screen: Done would log to the admin', () => {
    h.can = { log: true, edit: true, rollcall: true, mood: true, reason: null }
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByTestId('move').getAttribute('data-lock')).toBe('Move logs are yours only. Tap Back to me to log.')
    expect(screen.getByTestId('move').getAttribute('data-other')).toBe('true')
  })
  it('acting with log rights, More > Walk is locked: it logs to the signed-in person, so the walk logger is not offered', () => {
    h.can = { log: true, edit: true, rollcall: true, mood: true, reason: null }
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    expect(screen.queryByTestId('walk')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('Walk logs are yours only. Tap Back to me to log.')
  })
  it('your own More > Walk has the walk logger and no lock', () => {
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    expect(screen.getByTestId('walk')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('your own More > Move is not locked', () => {
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByTestId('move').getAttribute('data-lock')).toBe('')
    expect(screen.getByTestId('move').getAttribute('data-other')).toBe('false')
  })
  it('the BP sheet offers the guided check', () => {
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Blood pressure' }))
    expect(screen.getByRole('button', { name: 'Guided check' })).toBeTruthy()
  })
  it('a face logs once and the toast says the family will see it in Bantay', async () => {
    const notify = vi.fn()
    mood(notify)
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved. Your family will see it in Bantay.'))
    expect(h.feel).toHaveBeenCalledTimes(1)
    expect(h.feel).toHaveBeenCalledWith('unwell', 'p1') // the acting person's id (own id when not acting)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('an Unwell alert that did not reach the server is not reported as told', async () => {
    h.result = 'untold'
    const notify = vi.fn()
    mood(notify)
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls[0]![0]).toMatch(/We will tell them when you are online/)
  })
  it('Temperature, Sleep and Pain write the reading or activity for the viewed person, and a bad number writes nothing', async () => {
    const notify = vi.fn()
    more(notify)
    fireEvent.click(screen.getByRole('button', { name: 'Temperature' }))
    fireEvent.change(screen.getByLabelText('Temperature (°C)'), { target: { value: '52' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toMatch(/30 to 45/)
    expect(h.read).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Temperature (°C)'), { target: { value: '37.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved temperature 37.5 °C (99.5 °F)'))
    expect(h.read).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', test: 'temperature', value: 37.5, unit: '°C' }))
    // a Fahrenheit entry (the unit toggle) is stored in Celsius: 98.6 F = 37 C; the Celsius box refuses 98.6
    cleanup(); h.read.mockClear(); more(notify); fireEvent.click(screen.getByRole('button', { name: 'Temperature' }))
    fireEvent.click(screen.getByRole('button', { name: '°F' }))
    fireEvent.change(screen.getByLabelText('Temperature (°F)'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toMatch(/86 to 113/)
    fireEvent.change(screen.getByLabelText('Temperature (°F)'), { target: { value: '98.6' } })
    expect(screen.getByText('37 °C (98.6 °F)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved temperature 37 °C (98.6 °F)'))
    expect(h.read).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', test: 'temperature', value: 37, unit: '°C' }))
    cleanup(); more(notify); fireEvent.click(screen.getByRole('button', { name: 'Sleep' }))
    fireEvent.change(screen.getByLabelText('Hours slept last night'), { target: { value: '6.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.act).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', kind: 'sleep', minutes: 390 })))
    cleanup(); more(notify); fireEvent.click(screen.getByRole('button', { name: 'Pain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Moderate' }))
    await waitFor(() => expect(h.act).toHaveBeenCalledWith(expect.objectContaining({ personId: 'p1', kind: 'pain-5' })))
  })
  it("Dose taken logs the medicine under the medicine's own person, never the admin", async () => {
    h.meds = [{ id: 1, serverId: 's9', personId: 'mama', name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['08:00'] } }]
    more()
    fireEvent.click(screen.getByRole('button', { name: 'Dose taken' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Losartan' }))
    await waitFor(() => expect(h.take).toHaveBeenCalledWith(expect.objectContaining({ name: 'Losartan' }), 'mama'))
  })
  it('acting without the log right: the More items are locked with View only, Mood stays open', () => {
    h.can = { log: false, edit: false, rollcall: false, mood: true, reason: 'You can see Mama but not log for her.' }
    more()
    expect((screen.getByRole('button', { name: 'Blood pressure, view only' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Mood' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
