import { describe, expect, it } from 'vitest'
import { loggedByText } from './ViewAs'
import type { Visible } from './viewAsData'

const v = (id: string, auth: string | null, name: string): Visible => ({ person: { id, display_name: name, auth_user_id: auth, created_by: null, archived_at: null, photo_path: null }, relation: 'carer', records: true })
const mama = v('p-mama', 'u-mama', 'Mama')
const lola = v('p-lola', 'u-lola', 'Lola')

describe('loggedByText (0044 "who logged" line)', () => {
  it('is empty when the column is absent or null (a server before 0044, an old row): unknown is never "self"', () => {
    expect(loggedByText(undefined, mama, [mama, lola])).toBe('')
    expect(loggedByText(null, mama, [mama, lola])).toBe('')
  })
  it('is empty when the person logged it themselves', () => expect(loggedByText('u-mama', mama, [mama, lola])).toBe(''))
  it('names another member the viewed person can see, else says another member', () => {
    expect(loggedByText('u-lola', mama, [mama, lola])).toBe(' · logged by Lola')
    expect(loggedByText('u-admin', mama, [mama, lola])).toBe(' · logged by another member')
  })
})
