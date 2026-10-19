// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleBase, handleCandidate, pickHandle } from './handle.ts'
import { normalizeHandle } from './pin.ts'

describe('sign-in name rule', () => {
  it.each([
    ['Macleo Fe', 'macleofe'],
    ['  LOLA   Reyes ', 'lolareyes'],
    ['José Peña-Ñ', 'josepenan'],
    ["Ana-Marie O'Neil", 'anamarieoneil'],
    ['7 Lola', 'lola'],
    ['Jo', 'jox'],
    ['李', 'member'],
    ['', 'member'],
    ['Maria Cristina Dela Cruz Santos', 'mariacristinadelacru']
  ])('%s -> %s', (name, want) => expect(handleBase(name)).toBe(want))

  it('every result is a handle the server accepts', () => {
    for (const n of ['Macleo Fe', '9', 'Zoë', '!!!', 'a'.repeat(80)]) {
      for (const k of [1, 2, 10, 123]) expect(normalizeHandle(handleCandidate(n, k))).not.toBeNull()
    }
  })
  it('numbers collisions and keeps the total within 20 characters', () => {
    expect(handleCandidate('Macleo Fe', 2)).toBe('macleofe2')
    const long = handleCandidate('Maria Cristina Dela Cruz Santos', 12)
    expect(long).toBe('mariacristinadelac12')
    expect(long.length).toBe(20)
  })
  it('pickHandle takes the first free one', () => {
    expect(pickHandle('Macleo Fe', new Set())).toBe('macleofe')
    expect(pickHandle('Macleo Fe', new Set(['macleofe', 'macleofe2']))).toBe('macleofe3')
  })
})
