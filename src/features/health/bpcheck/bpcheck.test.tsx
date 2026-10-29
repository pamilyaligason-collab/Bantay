import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'

vi.mock('../../auth/client', () => ({ supabase: null }))
vi.mock('../../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))

import { ldb } from '../../log/store'
import { hdb } from '../../records/store'
import AddReadingSheet from '../AddReadingSheet'
import { entrySpec } from '../readingPreview'
import BpCheck from './BpCheck'
import CrisisCard from './CrisisCard'

beforeEach(async () => {
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), ldb.meds.clear()])
  vi.clearAllMocks()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })
const rows = () => hdb.readings.toArray()

describe('guided check', () => {
  it('two readings with a rest between: average 134/84 says Above target, and the 7-day number is shown', async () => {
    render(<BpCheck personId="p1" forName="Mama" onClose={() => undefined} />)
    type('Top', '138'); type('Bottom', '86'); type('Pulse', '74')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('bp-check').getAttribute('data-step')).toBe('two'))
    expect((await rows()).map((r) => `${r.test}:${r.value}`).sort()).toEqual(['bp_diastolic:86', 'bp_systolic:138', 'heart_rate:74']) // saved at once, before the second reading
    expect(await db.outbox.count()).toBe(3)
    expect(screen.getByRole('timer')).toBeTruthy()
    expect(screen.queryByLabelText('Top')).toBeNull() // no second reading before the minute is up

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 }) // the rest is judged on the clock; the real interval notices within half a second
    await waitFor(() => expect(screen.getByLabelText('Top')).toBeTruthy())
    type('Top', '130'); type('Bottom', '82')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('bp-avg').textContent).toBe('134/84'))
    expect(screen.getAllByText('Above target').length).toBeGreaterThan(0)
    expect(screen.getByTestId('bp-week').textContent).toBe('134/84') // 138 and 130 are the only readings of the week
    expect(screen.getByText('1 of 7 days')).toBeTruthy()
    expect((await rows()).filter((r) => r.test === 'bp_systolic').length).toBe(2) // each reading kept as its own row
  })

  it('numbers that cannot be a reading save nothing and say why', async () => {
    render(<BpCheck personId="p1" forName="Mama" onClose={() => undefined} />)
    type('Top', '80'); type('Bottom', '120')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('alert').textContent).toMatch(/higher than the bottom/)
    expect(await rows()).toEqual([])
  })

  it('a dangerous first reading is saved, then asks about symptoms first: no timer, no averaging', async () => {
    render(<BpCheck personId="p1" forName="Mama" onClose={() => undefined} />)
    type('Top', '190'); type('Bottom', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const card = await screen.findByTestId('crisis-card')
    expect(card.textContent).toMatch(/chest pain/)
    expect(screen.queryByRole('timer')).toBeNull()
    expect((await rows()).find((r) => r.test === 'bp_systolic')!.value).toBe(190)
    expect(await db.outbox.count()).toBe(2) // the family row on the server comes from this write; it never waits on the screen
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByRole('link', { name: 'Call 911' }).getAttribute('href')).toBe('tel:911')
  })
})

describe('crisis card', () => {
  it('blood pressure, no symptoms: rest 5 minutes, re-check, call the doctor today; the family line never promises a push or an alert nobody gets', () => {
    render(<CrisisCard kind="bp" doctor="Dr. Santos" onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.getByText(/Rest for 5 minutes/)).toBeTruthy()
    expect(screen.getByText(/180\/120 or more, call Dr\. Santos today/)).toBeTruthy()
    expect(screen.queryByText('Your family will see this in Bantay.')).toBeNull() // DS-1: no writer carer known, so no promise
    expect(screen.getByText('Tell your family now. Bantay may not reach them.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Call 911' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/notif|lock screen|I'm OK/i)
  })
  it('a reading older than 2 hours (outside the 0035 alert) does not promise the family line', () => {
    render(<CrisisCard kind="bp" fresh={false} onClose={() => undefined} />)
    expect(screen.queryByText('Your family will see this in Bantay.')).toBeNull()
  })
  it('low sugar: the rule of 15 with the 911 line for someone who is confused', () => {
    render(<CrisisCard kind="low_sugar" onClose={() => undefined} />)
    expect(screen.getByText(/15 g of fast sugar/)).toBeTruthy()
    expect(screen.getByText(/Wait 15 minutes/)).toBeTruthy()
    expect(screen.getByText(/call your doctor|If you are confused/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call 911' }).getAttribute('href')).toBe('tel:911')
  })
  it('oxygen under 90: re-check first, 911 if breathless', () => {
    render(<CrisisCard kind="low_spo2" onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.getByText(/check again in a minute/)).toBeTruthy()
    expect(screen.getByText(/short of breath, call 911/)).toBeTruthy()
    cleanup()
    render(<CrisisCard kind="low_spo2" onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByRole('link', { name: 'Call 911' })).toBeTruthy()
  })
})

describe('add reading sheet crisis', () => {
  it('185/95 is saved first, then the sheet shows the symptom question instead of closing', async () => {
    const onClose = vi.fn()
    render(<AddReadingSheet spec={entrySpec('bp_systolic')!} personId="p1" forName="Mama" onClose={onClose} onSaved={() => undefined} />)
    type('Top', '185'); type('Bottom', '95')
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    await screen.findByTestId('crisis-card')
    expect(onClose).not.toHaveBeenCalled()
    expect((await rows()).map((r) => r.value).sort((a, b) => a - b)).toEqual([95, 185])
  })
  it('sugar 60 mg/dL opens the rule of 15; sugar 95 just closes', async () => {
    const onClose = vi.fn()
    render(<AddReadingSheet spec={entrySpec('fasting_glucose')!} personId="p1" forName="Mama" onClose={onClose} onSaved={() => undefined} />)
    type('Fasting sugar (mg/dL)', '60')
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    expect((await screen.findByTestId('crisis-card')).getAttribute('data-kind')).toBe('low_sugar')
    cleanup()
    render(<AddReadingSheet spec={entrySpec('fasting_glucose')!} personId="p1" forName="Mama" onClose={onClose} onSaved={() => undefined} />)
    type('Fasting sugar (mg/dL)', '95')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save reading' })) })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
