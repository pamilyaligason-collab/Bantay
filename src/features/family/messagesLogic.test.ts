import { describe, expect, it } from 'vitest'
import { bubbleStatus, classifyFile, messengerHref, mmss, pickRecorderMime, shortName, stamp } from './messagesLogic'

describe('bubble status', () => {
  it('a flag beats a check-in; no news when nothing is known', () => {
    expect(bubbleStatus({ checkedIn: true, flag: '2 to check' }).key).toBe('look')
    expect(bubbleStatus({ checkedIn: true, flag: 'All up to date' })).toMatchObject({ key: 'ok', emoji: '✅' })
    expect(bubbleStatus({ checkedIn: false, flag: null })).toMatchObject({ key: 'quiet', word: 'No news' })
    expect(bubbleStatus({ checkedIn: false, flag: 'All up to date' }).key).toBe('quiet')
  })
})
describe('voice note format', () => {
  it('takes the first the phone can record, or null', () => {
    expect(pickRecorderMime((m) => m.startsWith('audio/webm'))).toEqual({ mime: 'audio/webm;codecs=opus', ext: 'webm' })
    expect(pickRecorderMime((m) => m === 'audio/mp4')).toEqual({ mime: 'audio/mp4', ext: 'm4a' })
    expect(pickRecorderMime(() => false)).toBeNull()
    expect(pickRecorderMime(() => { throw new Error('x') })).toBeNull()
  })
})
describe('attachments', () => {
  it('limits size and type', () => {
    expect(classifyFile({ type: 'image/png', name: 'a.png', size: 5 })).toEqual({ kind: 'photo' })
    expect(classifyFile({ type: 'image/png', name: 'a.png', size: 10 * 1024 * 1024 + 1 })).toEqual({ error: 'big' })
    expect(classifyFile({ type: 'application/pdf', name: 'rx.pdf', size: 5 })).toMatchObject({ kind: 'file', ext: 'pdf' })
    expect(classifyFile({ type: '', name: 'note.DOCX', size: 5 })).toMatchObject({ kind: 'file', ext: 'docx' })
    expect(classifyFile({ type: 'application/x-msdownload', name: 'a.exe', size: 5 })).toEqual({ error: 'type' })
  })
})
describe('messenger and small helpers', () => {
  it('opens Messenger itself without a handle', () => {
    expect(messengerHref(null)).toEqual({ href: 'https://www.messenger.com/', label: 'Use Messenger for video' })
    expect(messengerHref('lola.remy')).toEqual({ href: 'https://m.me/lola.remy', label: 'Video call on Messenger' })
    expect(messengerHref('a/b?x')).toMatchObject({ label: 'Use Messenger for video' })
  })
  it('formats', () => {
    expect(mmss(65)).toBe('1:05')
    expect(stamp('nope')).toBeNull()
    expect(stamp(new Date().toISOString())).toMatch(/\d/)
    expect(shortName(null)).toBe('File')
    expect(shortName('<b>x'.repeat(30)).length).toBeLessThanOrEqual(40)
  })
})
