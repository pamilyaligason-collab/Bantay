// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runErase, secretOk, type ErasePort } from './logic.ts'

const port = (over: Partial<ErasePort> = {}, log: string[] = []): ErasePort => ({
  due: async () => [{ userId: 'u1', erased: false }, { userId: 'u2', erased: false }],
  paths: async (u) => (u === 'u1' ? [{ bucket: 'records', path: 'a/1.pdf' }, { bucket: 'records', path: 'a/2.pdf' }, { bucket: 'avatars', path: 'p.jpg' }] : []),
  removeObjects: async (b, p) => { log.push(`rm ${b} ${p.length}`); return true },
  eraseUser: async (u) => { log.push(`db ${u}`); return true },
  lockAuth: async (u) => { log.push(`auth ${u}`); return true },
  ...over
})

describe('erase run', () => {
  it('removes storage per bucket before the database, then locks the login, then counts', async () => {
    const log: string[] = []
    expect(await runErase(port({}, log))).toEqual({ due: 2, erased: 2, failed: 0 })
    expect(log).toEqual(['rm records 2', 'rm avatars 1', 'db u1', 'auth u1', 'db u2', 'auth u2'])
  })
  it('a storage failure skips the database step for that user only', async () => {
    const log: string[] = []
    const s = await runErase(port({ removeObjects: async () => false }, log))
    expect(s).toEqual({ due: 2, erased: 1, failed: 1 })
    expect(log).toEqual(['db u2', 'auth u2'])
  })
  it('a database failure or a throw counts as failed and continues', async () => {
    const s = await runErase(port({ eraseUser: async (u) => { if (u === 'u1') throw new Error('x'); return false } }))
    expect(s).toEqual({ due: 2, erased: 0, failed: 2 })
  })
  it('a failed auth lock is reported as failed, never as erased (no silent success)', async () => {
    expect(await runErase(port({ lockAuth: async (u) => u === 'u2' }))).toEqual({ due: 2, erased: 1, failed: 1 })
    expect(await runErase(port({ lockAuth: async () => { throw new Error('x') } }))).toEqual({ due: 2, erased: 0, failed: 2 })
  })
  it('a user whose data is already gone only gets the auth lock retried', async () => {
    const log: string[] = []
    const s = await runErase(port({ due: async () => [{ userId: 'u1', erased: true }] }, log))
    expect(s).toEqual({ due: 1, erased: 1, failed: 0 })
    expect(log).toEqual(['auth u1'])
  })
  it('nothing due is a clean run', async () => expect(await runErase(port({ due: async () => [] }))).toEqual({ due: 0, erased: 0, failed: 0 }))
  it('secret check: constant-time match, short or missing secret refuses all', () => {
    const s = 's'.repeat(32)
    expect(secretOk(s, s)).toBe(true)
    expect(secretOk('t'.repeat(32), s)).toBe(false)
    expect(secretOk(null, s)).toBe(false)
    expect(secretOk('short', 'short')).toBe(false)
    expect(secretOk('', undefined)).toBe(false)
  })
})
