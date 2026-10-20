import { describe, expect, it } from 'vitest'
import { embedUrl, forTopic, playable, TOPICS, VIDEO_ID, VIDEOS, videosAvailable } from './videos'

describe('videos playlist', () => {
  it('every entry is either a flagged placeholder or a real 11-character id', () => {
    for (const v of VIDEOS) expect(v.placeholder || VIDEO_ID.test(v.id)).toBe(true)
    expect(new Set(VIDEOS.map((v) => v.id)).size).toBe(VIDEOS.length)
  })
  it('a placeholder never gets an embed address; a real id gets youtube-nocookie', () => {
    expect(embedUrl(VIDEOS[0]!)).toBeNull()
    const real = { ...VIDEOS[0]!, id: 'dQw4w9WgXcQ', placeholder: false }
    expect(playable(real)).toBe(true)
    expect(embedUrl(real)).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
    expect(playable({ ...real, id: 'short' })).toBe(false)
  })
  it('the entry points stay hidden while every id is a placeholder', () => {
    expect(VIDEOS.every((v) => v.placeholder)).toBe(true)
    expect(videosAvailable()).toBe(false)
  })
  it('topics filter the list', () => {
    expect(TOPICS[0]).toBe('All')
    expect(forTopic('Diabetes').every((v) => v.topic === 'Diabetes')).toBe(true)
    expect(forTopic('All')).toHaveLength(VIDEOS.length)
  })
})
