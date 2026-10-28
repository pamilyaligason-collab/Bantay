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
