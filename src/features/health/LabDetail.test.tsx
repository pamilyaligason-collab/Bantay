import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../records/useRecordsServer', () => ({ useConfirmedDocs: () => [] }))
vi.mock('./useVisits', () => ({ useVisits: () => ({ next: null }) }))

import { LabDetail } from './LabDetail'
import { labInfo } from './labsLogic'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('LabDetail Add', () => {
  it('two quick adds both land in the visit list', async () => {
    const qs = labInfo('ldl').questions
    render(<LabDetail code="ldl" readings={[{ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'ldl', value: 162, unit: 'mg/dL' }]} personId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: `Add to visit list: ${qs[0]}` }))
    fireEvent.click(screen.getByRole('button', { name: `Add to visit list: ${qs[1]}` }))
    await waitFor(async () => expect((await db.kv.get('visits.questions.p1'))?.value).toEqual(qs))
  })
})

describe('LabDetail plain words', () => {
  it('says where the value sits and offers Ask at next visit when out of range', () => {
    const { container } = render(<LabDetail code="creatinine" readings={[{ personId: 'p1', takenAt: '2026-10-02T12:00:00', test: 'creatinine', value: 2.6, unit: 'mg/dL', labLow: 0.6, labHigh: 1.3 }]} personId="p1" />)
    expect(container.querySelector('.lr-say')?.textContent).toBe('2.6 is about 2 times the top of normal.')
    expect(screen.getByRole('link', { name: 'Ask at next visit' }).getAttribute('href')).toBe('#health/visits')
  })
})
