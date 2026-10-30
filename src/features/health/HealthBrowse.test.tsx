import { describe, expect, it } from 'vitest'
import { doors } from './HealthBrowse'

describe('More in Health', () => {
  const d = doors(null)

  it('has the four doors in order and no Papers, Library or Videos door (D-100)', () => {
    expect(d.map((x) => x.key)).toEqual(['readings', 'body', 'move', 'visits'])
    expect(d.map((x) => x.href)).toEqual(['#health/readings', '#health/body', '#health/move', '#health/visits'])
    expect(d.some((x) => /papers|library|videos/i.test(x.href + x.label))).toBe(false)
  })

  it('no hue sits beside or under the same hue in the 2-column grid, and no glyph repeats', () => {
    d.forEach((x, i) => {
      if (i % 2 === 0 && d[i + 1]) expect(d[i + 1]!.hue).not.toBe(x.hue)
      if (d[i + 2]) expect(d[i + 2]!.hue).not.toBe(x.hue)
    })
    expect(new Set(d.map((x) => x.icon)).size).toBe(d.length)
  })

  it('the Visits sub line is the next visit when there is one', () => {
    expect(doors('Next visit: Thu 5 Nov').find((x) => x.key === 'visits')!.sub).toBe('Next visit: Thu 5 Nov')
    expect(d.find((x) => x.key === 'visits')!.sub).toBe('What to bring')
  })
})
