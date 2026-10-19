import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { ageOf, buildMedicalId, hasData, show } from './card'
import MedicalId from './MedicalId'
import { CACHE_KEY } from './useMedicalId'

const NOW = new Date(2026, 9, 19)

describe('buildMedicalId', () => {
  it('builds every field from a full profile', () => {
    const c = buildMedicalId({
      name: ' Maria ', now: NOW,
      profile: { birthdate: '1958-10-20', bloodType: 'O+', allergies: ['Penicillin'], conditions: ['Diabetes', ' '], medicines: ['Losartan 50 mg'] },
      contacts: [{ name: 'Lloyd', phone: '0917 000 0000' }]
    })
    expect(c).toMatchObject({ name: 'Maria', age: 67, bloodType: 'O+', allergies: ['Penicillin'], conditions: ['Diabetes'], medicines: ['Losartan 50 mg'], missing: [] })
    expect(c.calls).toEqual([{ name: 'Lloyd', phone: '0917 000 0000' }])
  })
  it('keeps missing fields null or empty, never 0 or invented', () => {
    const c = buildMedicalId({ name: '', now: NOW, profile: null, contacts: [] })
    expect(c.age).toBeNull()
    expect(c.bloodType).toBeNull()
    expect(c.allergies).toEqual([])
    expect(c.missing).toEqual(['bloodType', 'allergies', 'conditions', 'medicines', 'calls'])
    expect(hasData(c)).toBe(false)
    expect(show(c.bloodType)).toBe('Not added')
    expect(show(c.allergies)).toBe('Not added')
  })
  it('reads UNKNOWN as "Not sure", counts it as answered, and ignores contacts with no phone', () => {
    const c = buildMedicalId({ name: 'A', now: NOW, profile: { allergies: ['UNKNOWN'] }, contacts: [{ name: 'X', phone: ' ' }] })
    expect(show(c.allergies)).toBe('Not sure')
    expect(c.missing).not.toContain('allergies')
    expect(c.calls).toEqual([])
  })
  it('age: birthday not yet this year, bad and future dates', () => {
    expect(ageOf('1958-10-20', NOW)).toBe(67)
    expect(ageOf('1958-10-19', NOW)).toBe(68)
    expect(ageOf('nope', NOW)).toBeNull()
    expect(ageOf(null, NOW)).toBeNull()
    expect(ageOf('2030-01-01', NOW)).toBeNull()
  })
})

describe('MedicalId screen offline', () => {
  beforeEach(async () => { await db.kv.clear(); await db.profiles.clear() })
  afterEach(cleanup)

  it('shows the cached card when there is no profile row yet', async () => {
    const card = buildMedicalId({ name: 'Maria', now: NOW, profile: { bloodType: 'A-', allergies: ['Penicillin'], conditions: [], medicines: [] }, contacts: [] })
    await db.kv.put({ key: 'profile.selfId', value: 'p1' })
    await db.kv.put({ key: CACHE_KEY, value: { personId: 'p1', card, at: 1 } })
    render(<MedicalId />)
    await waitFor(() => expect(screen.getByText('A-')).toBeTruthy())
    expect(screen.getByText('Penicillin')).toBeTruthy()
    expect(screen.getByText(/saved on this phone/i)).toBeTruthy()
  })

  it('shows Not added for a person with a blank profile, without crashing', async () => {
    await db.kv.put({ key: 'profile.selfId', value: 'p2' })
    render(<MedicalId />)
    await waitFor(() => expect(screen.getAllByText('Not added').length).toBe(5))
  })
})

describe('MedicalId for another person (#medid/<id>)', () => {
  beforeEach(async () => { await db.kv.clear(); await db.profiles.clear() })
  afterEach(() => { cleanup(); location.hash = '' })

  it('shows that person\'s profile and none of the signed-in person\'s contacts', async () => {
    await db.kv.put({ key: 'profile.selfId', value: 'me1' })
    await db.kv.put({ key: 'sos.contacts', value: [{ name: 'Mine', phone: '0917 111 1111' }] })
    await db.profiles.put({ id: 'p2', bloodType: 'B+', allergies: ['Shellfish'], conditions: [], medicines: [] } as never)
    location.hash = '#medid/p2'
    render(<MedicalId />)
    await waitFor(() => expect(screen.getByText('B+')).toBeTruthy())
    expect(screen.getByText('Shellfish')).toBeTruthy()
    expect(screen.queryByText(/Mine/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('#family/people/p2')
  })
})
