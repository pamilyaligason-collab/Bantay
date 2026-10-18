import { describe, expect, it, vi } from 'vitest'
import { assertAllowed, buildRequest, classifyType, csvRow, dateFrom, isSkipped, sendToOpenRouter, walk } from '../../../scripts/import/lib.mjs'

describe('request builder', () => {
  const o = { model: 'vendor/paid-model', fallbackModel: 'vendor/other-paid', mime: 'image/jpeg', base64: 'AAAA' }
  it('forces zero data retention and no data collection', () => {
    const b = buildRequest(o)
    expect(b.provider.zdr).toBe(true)
    expect(b.provider.data_collection).toBe('deny')
    expect(b.models).toEqual(['vendor/paid-model', 'vendor/other-paid'])
  })
  it('posts to OpenRouter with the right url, headers and provider fields', async () => {
    let seen: { url: string; init: { headers: Record<string, string>; body: string } } | undefined
    const f = vi.fn(async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      seen = { url, init }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"tests":[],"confidence":1}' } }] }) }
    })
    const out = await sendToOpenRouter(f, buildRequest({ ...o, mime: 'application/pdf' }), 'test-key')
    expect(out.confidence).toBe(1)
    expect(seen!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen!.init.headers.Authorization).toBe('Bearer test-key')
    const sent = JSON.parse(seen!.init.body)
    expect(sent.provider).toEqual({ zdr: true, data_collection: 'deny' })
    expect(sent.messages[0].content[1].type).toBe('file')
  })
  it('error path logs the status only, never the body', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}) })
    const log = vi.fn()
    await expect(sendToOpenRouter(f, buildRequest({ ...o, base64: 'SECRETDOC' }), 'k', log)).rejects.toThrow('500')
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRETDOC')
    expect(log).toHaveBeenCalledWith('OpenRouter failed: 500')
  })
  it('refuses free models', () => {
    expect(() => buildRequest({ ...o, model: 'vendor/model:free' })).toThrow(/paid/)
    expect(() => buildRequest({ ...o, fallbackModel: '' })).toThrow(/paid/)
  })
  it('refuses to run without key or flag', () => {
    const env = { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm' }
    expect(() => assertAllowed(['x'], env)).toThrow(/i-am-lloyd/)
    expect(() => assertAllowed(['--i-am-lloyd'], { OPENROUTER_MODEL: 'm' })).toThrow(/OPENROUTER_API_KEY/)
    expect(() => assertAllowed(['--i-am-lloyd'], env)).not.toThrow()
  })
})

describe('inventory helpers', () => {
  it('classifies and dates from names', () => {
    expect(classifyType('2024.06.11 Laboratory')).toBe('laboratory')
    expect(classifyType('Consultation - DR TEST')).toBe('consultation')
    expect(classifyType('2024.04.04 Ultrasound, Urinalysis')).toBe('ultrasound')
    expect(classifyType('notes')).toBe('other')
    expect(dateFrom('2024.06.11 Laboratory')).toBe('2024-06-11')
    expect(dateFrom('20260728 Test Person.pdf')).toBe('2026-07-28')
    expect(dateFrom('11 Nov 2023')).toBe('')
  })
  it('skips the listed folders', () => {
    for (const s of ['Birth Cert - X.pdf', '- HMO', '- IDs and Documents', '- Insurance', '- Home Lot Documents', 'Visa']) expect(isSkipped(['Test Person', s])).toBe(true)
    expect(isSkipped(['Test Person', '2024.01.01 Laboratory'])).toBe(false)
  })
  it('walks a fake tree, skipping and quoting', async () => {
    const tree: Record<string, { id: string; name: string; mime: string }[]> = {
      root: [{ id: 'p', name: 'Test Person', mime: 'application/vnd.google-apps.folder' }],
      p: [
        { id: 'l', name: '2024.01.02 Laboratory', mime: 'application/vnd.google-apps.folder' },
        { id: 'h', name: '- HMO', mime: 'application/vnd.google-apps.folder' }
      ],
      l: [{ id: 'f1', name: 'a, b.jpg', mime: 'image/jpeg' }],
      h: [{ id: 'f2', name: 'card.jpg', mime: 'image/jpeg' }]
    }
    const rows = await walk(async (id: string) => tree[id], 'root', ['Test Person'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ person: 'Test Person', date: '2024-01-02', type: 'laboratory', file_id: 'f1' })
    expect(csvRow(rows[0])).toContain('"Test Person/2024.01.02 Laboratory/a, b.jpg"')
  })
})
