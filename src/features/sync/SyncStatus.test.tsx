import { describe, expect, it } from 'vitest'
import { statusText } from './SyncStatus'

const ready = { ready: true, signedIn: true, offline: false }
const none = { waiting: 0, unknown: 0, dead: 0 }

describe('statusText', () => {
  it('is empty until the first check', () => expect(statusText({ ...ready, ready: false }, none)).toBe(''))
  it('signed out', () => expect(statusText({ ...ready, signedIn: false }, { ...none, waiting: 3 })).toBe('Sign in to sync'))
  it('synced', () => expect(statusText(ready, none)).toBe('Synced'))
  it('waiting counts rows we will not send too', () => expect(statusText(ready, { ...none, waiting: 2, unknown: 1 })).toBe('3 waiting'))
  it('offline', () => {
    expect(statusText({ ...ready, offline: true }, none)).toBe('Offline')
    expect(statusText({ ...ready, offline: true }, { ...none, waiting: 2 })).toBe('Offline, 2 waiting')
  })
  it('could not sync', () => expect(statusText(ready, { ...none, dead: 2 })).toBe('2 could not sync'))
})
