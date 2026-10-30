import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MedicalId } from '../medid/card'

const state = vi.hoisted(() => ({ card: null as unknown, acting: false }))
vi.mock('../medid/useMedicalId', () => ({ useMedicalId: () => ({ card: state.card, photo: null, fromCache: false, ready: true, other: state.acting }) }))
vi.mock('../records/useRecordsServer', () => ({ useQueue: () => ({ byPerson: { p1: 2 } }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'p1', useActing: () => ({ acting: state.acting, personId: 'p1', name: state.acting ? 'Mama' : '' }) }))

import ProfileCard, { idLine } from './ProfileCard'

const full: MedicalId = { name: 'Mama', age: 68, bloodType: 'A+', allergies: ['Penicillin'], conditions: ['Diabetes', 'Hypertension'], medicines: ['Atorvastatin 20 mg', 'Losartan 50 mg', 'Metformin 500 mg', 'Amlodipine 5 mg', 'Aspirin 80 mg', 'Vitamin D3 1000 IU'], calls: [{ name: 'Ate Joy', phone: '0917 000 0001' }], missing: [] }
afterEach(() => { cleanup(); state.acting = false })

describe('idLine', () => {
  it('joins only what is known, never 0', () => {
    expect(idLine({ name: 'Mama', age: 68, bloodType: 'A+' })).toBe('Mama · 68 · A+')
    expect(idLine({ name: 'Mama', age: null, bloodType: null })).toBe('Mama')
    expect(idLine({ name: '', age: 0, bloodType: null })).toBe('Me · 0')
  })
})

describe('ProfileCard', () => {
  it('shows every Medical ID field and lists all six medicines in full from the Medicines stat', () => {
    state.card = full
    render(<ProfileCard />)
    const card = screen.getByTestId('profilecard')
    expect(within(card).getByText('Mama · 68 · A+')).toBeTruthy()
    expect(within(card).getByText('Penicillin')).toBeTruthy()
    expect(within(card).getByText('Medicines').previousElementSibling!.textContent).toBe('6')
    expect(within(card).getByText('Conditions').previousElementSibling!.textContent).toBe('2')
    expect(within(card).getByRole('link', { name: 'Call Ate Joy' }).getAttribute('href')).toBe('tel:09170000001')
    expect(within(card).getByRole('link', { name: /Show to a doctor/ }).getAttribute('href')).toBe('#medid')
    expect(within(card).getByRole('link', { name: /Papers/ }).textContent).toBe('Papers2')
    fireEvent.click(within(card).getByRole('button', { name: /^Medicines, 6/ }))
    const list = screen.getByRole('list', { name: 'All medicines' })
    expect(within(list).getAllByRole('listitem').map((l) => l.textContent)).toEqual(full.medicines)
    expect(within(list).getByText('Atorvastatin 20 mg')).toBeTruthy() // a long name is never cut
  })

  it('the card grows to fit: no height cap or clipping in its CSS', () => {
    const css = readFileSync(resolve(__dirname, 'family.css'), 'utf8')
    const rule = css.split('\n').filter((l) => /^\.fm2-id(-name)? /.test(l)).join('\n')
    expect(rule).not.toMatch(/max-height|overflow:\s*hidden|text-overflow|line-clamp/)
  })

  it('missing answers are Add chips, never 0 or a blank', () => {
    state.card = { name: 'Mama', age: null, bloodType: null, allergies: [], conditions: [], medicines: [], calls: [], missing: ['bloodType', 'allergies', 'conditions', 'medicines', 'calls'] }
    render(<ProfileCard />)
    expect(screen.getByRole('link', { name: 'Add blood type' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add allergies' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Add' }).length).toBe(3)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('while acting the pencil and Scan are off and there are no Add links', () => {
    state.acting = true
    state.card = { ...full, bloodType: null, medicines: [] }
    render(<ProfileCard />)
    expect((screen.getByRole('button', { name: 'Edit name and photo' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Scan/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('link', { name: /^Add/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Show to a doctor/ }).getAttribute('href')).toBe('#medid/p1')
  })
})
