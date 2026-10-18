import { describe, expect, it } from 'vitest'
import { batteryStatus } from './settingsOpener'

describe('settingsOpener on web', () => {
  it('batteryStatus on web reports ignoring=true so the step is not shown', async () => {
    expect(await batteryStatus()).toEqual({ ignoring: true })
  })
})
