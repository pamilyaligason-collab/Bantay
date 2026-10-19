import { describe, expect, it } from 'vitest'
import { dedupeDocs } from './Records'

describe('dedupeDocs', () => {
  it('keeps two different confirmed documents of the same kind, provider and day', () => {
    const a = { doc: { id: 'a' } }, b = { doc: { id: 'b' } }
    expect(dedupeDocs([a, b])).toEqual([a, b])
  })
  it('drops a repeat of the same document id', () => {
    const a = { doc: { id: 'a' } }
    expect(dedupeDocs([a, a])).toEqual([a])
  })
})
