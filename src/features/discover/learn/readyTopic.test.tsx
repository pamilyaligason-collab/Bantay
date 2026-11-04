import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { playable, VIDEOS, VIDEO_ID } from '../../health/library/videosLogic'
import ReadyTopic from './ReadyTopic'
import { DISCOVER_VIDEOS, READY_READS, READY_TOPICS, READY_VIDEOS } from './ready'

afterEach(cleanup)

describe('D-117 list', () => {
  it('every video is real, playable, unique, in a known topic, and apart from the health list', () => {
    expect(READY_VIDEOS).toHaveLength(14)
    expect(READY_VIDEOS.every((v) => playable(v) && VIDEO_ID.test(v.id) && v.minutes === null)).toBe(true)
    expect(new Set(DISCOVER_VIDEOS.map((v) => v.id)).size).toBe(DISCOVER_VIDEOS.length)
    expect(VIDEOS.some((v) => READY_VIDEOS.some((r) => r.id === v.id))).toBe(false)
    expect(new Set(READY_VIDEOS.map((v) => v.topic))).toEqual(new Set(READY_TOPICS.map((t) => t.video)))
  })
  it('every read is an https link with a source and a check date, in a known topic', () => {
    expect(READY_READS).toHaveLength(11)
    for (const r of READY_READS) {
      expect(r.url.startsWith('https://')).toBe(true)
      expect(r.source && /^\d{4}-\d{2}-\d{2}$/.test(r.checked)).toBeTruthy()
      expect(READY_TOPICS.some((t) => t.id === r.topic)).toBe(true)
    }
  })
  it('no fear words or weapons in any title', () => {
    const text = [...READY_VIDEOS.map((v) => v.title), ...READY_READS.map((r) => r.title)].join(' ').replaceAll('In case of crisis or war', '') // the Swedish agency's own brochure title, a household guide
    expect(text).not.toMatch(/(war|weapon|gun|bomb|attack|panic|doomsday|survival)/i)
  })
})

describe('Learn topic page', () => {
  it('lists the topic videos as click-to-load players and its reads as outside links', () => {
    const { container } = render(<ReadyTopic id="repairs" />)
    expect(screen.getByTestId('ready-repairs')).toBeTruthy()
    expect(container.querySelectorAll('.ry-video').length).toBe(6)
    expect(container.querySelector('iframe')).toBeNull()
    const links = Array.from(container.querySelectorAll('a.lr-tile'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(READY_READS.filter((r) => r.topic === 'repairs').map((r) => r.url))
  })
  it('an unknown topic draws nothing', () => {
    expect(render(<ReadyTopic id="nope" />).container.textContent).toBe('')
  })
})
