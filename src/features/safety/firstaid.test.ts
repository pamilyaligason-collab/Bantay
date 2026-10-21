import { describe, expect, it } from 'vitest'
import { VIDEO_ID } from '../health/library/videosLogic'
import { FOOTER, TOPICS, topicOf } from './FirstAid'
import { idsLine } from './SafetyHub'

const WANT = ['choking', 'cpr', 'bleeding', 'burns', 'stroke', 'heart-attack', 'heat-stroke', 'seizure', 'fainting', 'fracture', 'drowning', 'snake-bite', 'dog-bite-rabies', 'low-sugar', 'allergic-reaction', 'dengue-warning-signs', 'falls']

describe('firstaid.json', () => {
  it('has every planned topic once', () => {
    expect(TOPICS.map((t) => t.id).sort()).toEqual([...WANT].sort())
  })
  it('stroke and dengue are the wide, first two', () => {
    expect(TOPICS.filter((t) => t.urgency === 'high').map((t) => t.id)).toEqual(['stroke', 'dengue-warning-signs'])
    expect(TOPICS.slice(0, 2).map((t) => t.id)).toEqual(['stroke', 'dengue-warning-signs'])
  })
  for (const t of TOPICS) {
    it(`${t.id}: 3-5 steps, 911 box, sources, valid video id`, () => {
      expect(t.title && t.tl).toBeTruthy()
      expect(t.steps.length).toBeGreaterThanOrEqual(3)
      expect(t.steps.length).toBeLessThanOrEqual(5)
      expect(t.call911.length).toBeGreaterThan(0)
      expect(t.sources.length).toBeGreaterThan(0)
      for (const s of t.sources) { expect(s.label).toBeTruthy(); expect(s.url).toMatch(/^https:\/\//) }
      if (t.video) { expect(t.video.id).toMatch(VIDEO_ID); expect(t.video.title && t.video.channel).toBeTruthy() }
    })
  }
  it('dengue and falls have no video', () => {
    expect(TOPICS.find((t) => t.id === 'dengue-warning-signs')!.video).toBeNull()
    expect(TOPICS.find((t) => t.id === 'falls')!.video).toBeNull()
  })
  it('topicOf resolves a hash and rejects unknown ids', () => {
    expect(topicOf('#safety/firstaid/choking')?.id).toBe('choking')
    expect(topicOf('#safety/firstaid/nope')).toBeNull()
    expect(FOOTER).toBe('General first-aid guidance, not a diagnosis.')
  })
  it('IDs row line: count or the prompt', () => {
    expect(idsLine(3)).toBe('3 saved')
    expect(idsLine(0)).toBe('Add your PhilHealth, Senior ID, HMO')
    expect(idsLine(null)).toBe('Add your PhilHealth, Senior ID, HMO')
  })
})
