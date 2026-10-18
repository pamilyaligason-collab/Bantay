import { describe, expect, it } from 'vitest'
import { AppUpdater } from './plugin'

describe('AppUpdater web stub', () => {
  it('download rejects with code and message "network"', async () => {
    const err = await AppUpdater.download({ url: 'x', sha256: 'x', size: 1 }).catch((e) => e)
    expect(err.message).toBe('network')
    expect(err.code).toBe('network')
  })
  it('reports no native shell', async () => {
    expect((await AppUpdater.info()).versionCode).toBe(0)
  })
})
