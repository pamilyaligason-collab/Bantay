import { describe, expect, it } from 'vitest'
import { fromRow, toRow } from './tables'

describe('meds_taken marked_by (0039): read on pull, never sent', () => {
  const server = { client_id: 'c1', person_id: 'p1', name: 'Metformin', taken_at: '2026-10-20T00:12:00Z', medication_id: 'm1', slot: '08:00', skipped: false, marked_by: 'u-joy', marked_by_name: 'Joy' }
  it('pull keeps who marked it and the first name', () => {
    expect(fromRow('meds_taken', server)).toMatchObject({ clientId: 'c1', markedBy: 'u-joy', markedByName: 'Joy', medicationId: 'm1', slot: '08:00' })
  })
  it('a server row without the columns (0039 not applied) pulls as before', () => {
    const { marked_by: _a, marked_by_name: _b, ...old } = server
    const out = fromRow('meds_taken', old)
    expect(out).not.toHaveProperty('markedBy')
    expect(out).not.toHaveProperty('markedByName')
  })
  it('a null marker (old rows, imports) is dropped, not stored as null', () => {
    expect(fromRow('meds_taken', { ...server, marked_by: null, marked_by_name: null })).not.toHaveProperty('markedBy')
  })
  it('push never carries a client-held marker, even if the local row has one (the server trigger decides)', () => {
    const row = toRow('meds_taken', { personId: 'p1', name: 'Metformin', takenAt: '2026-10-20T00:12:00Z', markedBy: 'u-forged', markedByName: 'Forged' }, 'c1')
    expect(row).not.toHaveProperty('marked_by')
    expect(row).not.toHaveProperty('marked_by_name')
    expect(row).not.toHaveProperty('markedBy')
  })
})
