import { describe, expect, it } from 'vitest'
import { familyGlance } from './familyLine'

const others = [{ id: 'ma', name: 'Ma' }, { id: 'pa', name: 'Pa' }]
const at = (h: number) => new Date(2026, 9, 19, h, 0)

describe('familyGlance', () => {
  it('counts the others who checked in today', () => {
    expect(familyGlance(others, { ma: at(8).toISOString() }, at(10))).toMatchObject({ ok: 1, total: 2, attention: false, note: 'Pa has not checked in yet' })
  })
  it('flags who has not checked in, but only from noon', () => {
    expect(familyGlance(others, { ma: at(8).toISOString() }, at(13))).toMatchObject({ attention: true, note: 'Pa has not checked in yet' })
    expect(familyGlance(others, {}, at(13))).toMatchObject({ attention: true, note: 'Ma and 1 more have not checked in yet' })
  })
  it('only says everyone is in when everyone is; never "nobody needs a look" with a gap', () => {
    expect(familyGlance(others, { ma: at(8).toISOString(), pa: at(9).toISOString() }, at(13))).toMatchObject({ note: 'Everyone has checked in', attention: false })
    expect(familyGlance(others, { ma: at(8).toISOString() }, at(9))!.note).not.toMatch(/Nobody|Everyone/)
  })
  it('yesterday does not count; nobody else gives no line', () => {
    expect(familyGlance(others, { ma: new Date(2026, 9, 18, 9).toISOString() }, at(10))!.ok).toBe(0)
    expect(familyGlance([], {}, at(10))).toBeNull()
  })
})
