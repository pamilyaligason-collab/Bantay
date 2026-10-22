import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHONE_ACTIONS, ViewAsPreview } from './ViewAs'
import { auditArgs, latestReadings, visibleTo, type ViewPerson } from './viewAsData'

afterEach(cleanup)

const P = (id: string, name: string, o: Partial<ViewPerson> = {}): ViewPerson => ({ id, display_name: name, auth_user_id: null, created_by: null, archived_at: null, photo_path: null, ...o })
const M = 'u-member'
const PEOPLE = [
  P('p-self', 'Test Member', { auth_user_id: M, created_by: M }),
  P('p-mum', 'Test Mum', { auth_user_id: 'u-mum' }),
  P('p-kid', 'Test Kid', { created_by: M }),
  P('p-dad', 'Test Dad', { auth_user_id: 'u-dad' }),
  P('p-old', 'Test Gone', { archived_at: '2026-10-01T00:00:00Z' }),
  P('p-made', 'Test Made', { created_by: M })
]
const CARERS = [
  { carer_id: M, person_id: 'p-mum', can_write: false },
  { carer_id: M, person_id: 'p-kid', can_write: true },
  { carer_id: M, person_id: 'p-old', can_write: true },
  { carer_id: 'u-dad', person_id: 'p-self', can_write: false }
]

describe('visibleTo mirrors people_read and the records policies', () => {
  const v = visibleTo(M, PEOPLE, CARERS)
  it('shows self, carer links and creator rows; hides strangers and archived people', () => {
    expect(v.shown.map((x) => [x.person.id, x.relation, x.records])).toEqual([
      ['p-self', 'self', true], ['p-kid', 'writer', true], ['p-mum', 'carer', true], ['p-made', 'creator', false]
    ])
    expect(v.hidden.map((p) => p.id).sort()).toEqual(['p-dad', 'p-old'])
  })
  it('an archived person stays visible to themselves', () => {
    const r = visibleTo('u-x', [P('p-x', 'Test X', { auth_user_id: 'u-x', archived_at: '2026-10-01T00:00:00Z' })], [])
    expect(r.shown.map((s) => s.relation)).toEqual(['self'])
  })
  it('someone with no links sees only themselves', () => {
    expect(visibleTo('u-mum', PEOPLE, CARERS).shown.map((s) => s.person.id)).toEqual(['p-mum'])
  })
})

describe('latestReadings', () => {
  it('keeps the newest per test and drops unknown values (never 0)', () => {
    const r = latestReadings([
      { test: 'bp_sys', value: 120, unit: 'mmHg', taken_at: '2026-10-01T00:00:00Z' },
      { test: 'bp_sys', value: 130, unit: 'mmHg', taken_at: '2026-10-05T00:00:00Z' },
      { test: 'weight', value: null, unit: 'kg', taken_at: '2026-10-05T00:00:00Z' }
    ])
    expect(r.map((x) => [x.test, x.value])).toEqual([['bp_sys', 130]])
  })
})

describe('audit event shape', () => {
  it('carries the person id and nothing else', () => {
    expect(auditArgs('p-self')).toEqual({ p_person: 'p-self' })
  })
})

describe('ViewAsPreview', () => {
  const v = visibleTo(M, PEOPLE, CARERS)
  const preview = { meds: [{ name: 'Test Med', dose: '1 tab', strength: '5 mg', schedule: ['08:00'], as_needed: false }], readings: [], docs: [] }
  const draw = (logged: boolean | null = true) => render(<ViewAsPreview name="Test Member" shown={v.shown} hidden={v.hidden} selected="p-self" onSelect={vi.fn()} preview={preview} logged={logged} />)

  it('lists only what the member can see and names who is hidden', () => {
    draw()
    const people = screen.getByRole('navigation', { name: /People Test Member can see/ })
    expect(within(people).getAllByRole('button')).toHaveLength(4)
    expect(within(people).queryByText('Test Dad')).toBeNull()
    expect(screen.getByTestId('va-hidden').textContent).toContain('Test Dad')
    expect(screen.getByTestId('va-hidden').textContent).toContain('Test Gone')
  })
  it('says preview only and approximation', () => {
    draw()
    expect(screen.getByRole('status').textContent).toMatch(/Preview only/)
    expect(screen.getByRole('status').textContent).toMatch(/approximation/)
  })
  it('has no inputs and every phone action is disabled', () => {
    const { container } = draw()
    expect(container.querySelectorAll('input, textarea, select, form')).toHaveLength(0)
    const acts = container.querySelectorAll<HTMLButtonElement>('[data-va-actions] button')
    expect(acts).toHaveLength(PHONE_ACTIONS.length)
    acts.forEach((b) => expect(b.disabled).toBe(true))
    // the only enabled buttons are the person selectors (navigation inside the preview)
    const enabled = [...container.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled)
    enabled.forEach((b) => expect(b.closest('nav')).not.toBeNull())
  })
  it('warns when the view could not be logged', () => {
    draw(false)
    expect(screen.getByRole('status').textContent).toMatch(/could not be added to History/)
  })
  it('a creator without a carers link sees the name but no records', () => {
    render(<ViewAsPreview name="Test Member" shown={v.shown} hidden={[]} selected="p-made" onSelect={vi.fn()} preview={null} logged={null} />)
    expect(screen.getByText(/shows the name and no records/)).toBeTruthy()
  })
})
