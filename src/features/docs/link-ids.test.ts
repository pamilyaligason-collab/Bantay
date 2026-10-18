// @vitest-environment node
// Synthetic data only: "Test Person", made-up ids.
import { describe, expect, it } from 'vitest'
import { buildIdLinkSql, guessType } from '../../../scripts/import/link-ids.mjs'

const PID = '11111111-1111-4111-8111-111111111111'
const F = 'application/vnd.google-apps.folder'
const folder = (id: string, title: string, parentId?: string) => ({ id, title, mimeType: F, parentId })
const file = (id: string, title: string, parentId: string, mimeType = 'image/jpeg', fileSize = '1234') => ({ id, title, mimeType, parentId, fileSize })

const rows = [
  folder('root', 'Medical'),
  folder('tp', 'Test Person', 'root'),
  folder('ids', 'IDs and Documents', 'tp'),
  folder('n1', '1. Senior ID', 'ids'),
  folder('n2', '2. Birth certificate', 'ids'),
  folder('ins', 'Insurance', 'tp'),
  folder('nobody', 'Nobody Known', 'root'),
  folder('nids', 'IDs and Documents', 'nobody'),
  folder('labs', 'Labs 2026', 'tp'),
  file('f1', 'front.jpg', 'n1'),
  file('f2', "Test O'Brien PhilSys 1234-5678-9012.pdf", 'ids', 'application/pdf', '99'),
  file('f3', 'Passport.png', 'ids', 'image/png'),
  file('f4', 'scan.jpg', 'n2'),
  file('f5', 'Birth Certificate.jpg', 'ids'),
  file('f6', 'Maxicare card.jpg', 'ins'),
  file('f7', 'Insurance letter.docx', 'ins', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  file('f8', 'Senior ID.jpg', 'nids'),
  file('f9', 'cbc.jpg', 'labs'),
  file('f10', 'Driver licence.jpg', 'ids'),
  file('f11', 'Land title.jpg', 'ids'),
  file('f12', 'Visa.jpg', 'ids'),
  file('f13', 'Member data.jpg', 'ins')
]

describe('link-ids', () => {
  const { sql, summary } = buildIdLinkSql({ rows, peopleMap: { 'test person': PID } })

  it('links cards, skips certificates, land, visa, non-images and unknown people, and counts them', () => {
    expect(summary).toEqual({ files: 13, linked: 6, id_card: 4, insurance_card: 2, not_a_card: 4, not_in_card_folder: 1, wrong_type: 1, unknown_person: 1 })
  })
  it('guesses the card type from folder and file names', () => {
    expect(guessType('1. Senior ID / front.jpg')).toBe('senior')
    expect(guessType('Maxicare card')).toBe('hmo')
    expect(guessType('Intellicare')).toBe('hmo')
    expect(guessType('PhilHealth')).toBe('philhealth')
    expect(guessType('National ID')).toBe('philsys')
    expect(guessType("Driver's licence")).toBe('drivers')
    expect(guessType('UMID')).toBe('umid')
    expect(guessType('Passport')).toBe('passport')
    expect(guessType('something else')).toBe('other')
    expect(sql).toMatch(/'senior', 'draft'\) on conflict do nothing/)
    expect(sql).toMatch(/'insurance_card', 'hmo', 'draft'\)/)
    expect(sql).toMatch(/'id_card', 'passport', 'draft'\)/)
    expect(sql).toMatch(/'id_card', 'drivers', 'draft'\)/)
    expect(sql).toMatch(/'id_card', 'philsys', 'draft'\)/)
  })
  it('every row is a draft, idempotent, and kept out of the extraction queue', () => {
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    const stmts = sql.split('\n').filter((l) => l.startsWith('insert'))
    expect(stmts).toHaveLength(12)
    expect(stmts.every((l) => l.endsWith('on conflict do nothing;'))).toBe(true)
    expect(stmts.filter((l) => l.includes('public.source_files')).every((l) => l.includes("'skipped', 'id_card'"))).toBe(true)
    expect(sql).not.toMatch(/confirmed/)
  })
  it('ids are deterministic uuid v5 (same input, same SQL)', () => {
    expect(buildIdLinkSql({ rows, peopleMap: { 'test person': PID } }).sql).toBe(sql)
    expect(sql).toMatch(/values \('[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/)
  })
  it('escapes quotes and never copies a number printed in a file name', () => {
    expect(sql).not.toMatch(/1234-5678|9012/)
    expect(sql).toContain("Test O''Brien PhilSys #-#-#.pdf")
    expect(sql).toContain(', 99,') // size from Drive metadata
  })
  it('unknown person is skipped, not guessed', () => {
    expect(sql).not.toContain("'f8'")
    expect(buildIdLinkSql({ rows, peopleMap: {} }).summary.linked).toBe(0)
  })
  it('a bad people-map id throws without echoing it', () => {
    expect(() => buildIdLinkSql({ rows, peopleMap: { x: 'not-a-uuid' } })).toThrow('people-map has an invalid id')
  })
})
