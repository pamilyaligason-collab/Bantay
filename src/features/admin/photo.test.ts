import { describe, expect, it } from 'vitest'
import { squareCrop } from './photo'

describe('squareCrop', () => {
  it('centres the square on a landscape picture', () => expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 }))
  it('centres the square on a portrait picture', () => expect(squareCrop(1000, 1601)).toEqual({ sx: 0, sy: 300, side: 1000 }))
  it('keeps a square as it is', () => expect(squareCrop(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 }))
})
