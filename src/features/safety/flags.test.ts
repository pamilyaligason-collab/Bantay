import { describe, expect, it } from 'vitest'
import { DEFAULTS, FLAGS, readFlags } from './flags'

describe('safety flags', () => {
  it('has exactly the eight keys, only the map flags on (D-132, D-133)', () => {
    expect(Object.keys(FLAGS).sort()).toEqual(['digest', 'eonet', 'firstAidOffline', 'localPacks', 'offlineMaps', 'phivolcs', 'smsFallback', 'worldFeeds'])
    expect(Object.entries(DEFAULTS).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['localPacks', 'offlineMaps'])
  })
  it('reads an override and ignores garbage', () => {
    expect(readFlags('{"worldFeeds":true}')).toEqual({ ...DEFAULTS, worldFeeds: true })
    expect(readFlags('garbage')).toEqual(DEFAULTS)
    expect(readFlags('{"nope":true}')).toEqual(DEFAULTS)
    expect(readFlags(null)).toEqual(DEFAULTS)
  })
})
