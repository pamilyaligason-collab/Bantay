// @vitest-environment node
// S30 E1: the coarse region ('ph' | 'us' | 'unknown') the app sends. It only changes safety rule 5, the "one family" line and the self-harm card; a Philippine member sees what they saw before.
import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, handleAsk, parseBody, systemFor, type Env, type ModelReply, type OwnData, type Port } from './logic.ts'

const env: Env = { model: 'm1', fallback: 'm2' }
const none: OwnData = { meds: [], labs: [], allergies: [], tokens: [], lookups: [] }
const ok = (reply: string): ModelReply => ({ reply, tool_calls: [], usage: { tokensIn: 1, tokensOut: 1, cost: 0 } })
const body = (text: string, extra: Record<string, unknown> = {}) => JSON.stringify({ screen: 'today', messages: [{ role: 'user', content: text }], ...extra })
const port = () => ({ user: async () => 'u1', takeSlot: vi.fn(async () => true), knowledge: async () => [], own: async () => none, medline: async () => null, chat: vi.fn(async () => ok('Drink water.')), spendUsd: async () => 0, addSpend: async () => {}, now: () => 1 }) as unknown as Port & { chat: ReturnType<typeof vi.fn> }

const PH_RULE5 = 'For hazards, point to PHIVOLCS, PAGASA and the local DRRMO.'
const PH_LINE = 'used by one family in the Philippines. The person asking is a family member'

describe('parseBody region', () => {
  it.each([['ph', 'ph'], ['us', 'us'], ['unknown', 'unknown']])('keeps %s', (r, want) => {
    expect(parseBody(body('hi', { region: r }))!.region).toBe(want)
  })
  it.each([[undefined], [null], ['US'], ['us-tx'], [''], [5], [{ a: 1 }], ['ph '], ['__proto__']])('anything else (%j) is ph', (r) => {
    expect(parseBody(body('hi', { region: r }))!.region).toBe('ph')
  })
  it('a missing field is ph (an old app version)', () => {
    expect(parseBody(body('hi'))!.region).toBe('ph')
  })
})

describe('prompt by region', () => {
  const p = (r: 'ph' | 'us' | 'unknown') => buildPrompt('today', 'en', [], [], none, r)
  it('ph and unknown are the unchanged prompt, byte for byte', () => {
    expect(p('ph')).toContain(PH_RULE5)
    expect(p('ph')).toContain(PH_LINE)
    expect(p('unknown')).toBe(p('ph'))
    expect(buildPrompt('today', 'en', [], [], none)).toBe(p('ph')) // old five-argument callers
  })
  it('us points to 911, 988 and the National Weather Service, not PHIVOLCS or PAGASA for where the person is', () => {
    const s = p('us')
    expect(s).toContain('weather.gov')
    expect(s).toContain('911')
    expect(s).toContain('988')
    expect(s).not.toContain(PH_RULE5)
    expect(s).not.toContain(PH_LINE)
    expect(s).toContain('The person asking is in the United States right now')
    expect(s).toContain('Never claim Bantay warns of earthquakes') // the never-claim part of rule 5 stays
  })
  it('the other nine rules are identical in both', () => {
    const rules = (s: string) => s.split('\n').filter((l) => /^(?:[1-46-9]|10)\. /.test(l))
    expect(rules(systemFor('us'))).toEqual(rules(systemFor('ph')))
    expect(rules(systemFor('ph'))).toHaveLength(9)
  })
})

describe('handleAsk region', () => {
  it('sends the region-specific system prompt to the model', async () => {
    const us = port()
    await handleAsk(us, env, body('Is it going to storm?', { region: 'us' }))
    expect(JSON.stringify(us.chat.mock.calls[0]![1])).toContain('weather.gov')
    const ph = port()
    await handleAsk(ph, env, body('Is it going to storm?', { region: 'ph' }))
    expect(JSON.stringify(ph.chat.mock.calls[0]![1])).toContain('PHIVOLCS, PAGASA')
    const none2 = port()
    await handleAsk(none2, env, body('Is it going to storm?'))
    expect(JSON.stringify(none2.chat.mock.calls[0]![1])).toContain('PHIVOLCS, PAGASA')
  })
  it('self-harm card: a US member is given 988 and 911, never 1553; ph and unknown keep 1553 and 911', async () => {
    const us = await handleAsk(port(), env, body('I want to die', { region: 'us' }))
    const u = us.body as { reply: string; emergency: { call: string[] } }
    expect(u.emergency.call).toEqual(['988', '911'])
    expect(u.reply).toContain('988')
    expect(u.reply).not.toContain('1553')
    const tl = await handleAsk(port(), env, body('ayaw ko nang mabuhay', { region: 'us' }))
    expect((tl.body as { reply: string }).reply).toContain('Hindi ka nag-iisa')
    expect((tl.body as { reply: string }).reply).not.toContain('1553')
    for (const extra of [{ region: 'ph' }, {}]) { // {} = an older app that sends no region: the Philippine card, as before
      const o = await handleAsk(port(), env, body('I want to die', extra))
      expect((o.body as { emergency: { call: string[] } }).emergency.call).toEqual(['1553', '911'])
      expect((o.body as { reply: string }).reply).toContain('1553')
    }
    const unk = await handleAsk(port(), env, body('I want to die', { region: 'unknown' }))
    expect((unk.body as { emergency: { call: string[] } }).emergency.call).toEqual(['988', '1553', '911'])
    expect((unk.body as { reply: string }).reply).toContain('In the United States, call or text 988 (free). In the Philippines, call the NCMH crisis hotline 1553 (free).')
  })
  it('a medical emergency card is 911 in every region, and takes no model call', async () => {
    for (const region of ['ph', 'us', 'unknown']) {
      const p = port()
      const o = await handleAsk(p, env, body('I have chest pain', { region }))
      expect((o.body as { emergency: { call: string[] } }).emergency.call).toEqual(['911'])
      expect(p.chat).not.toHaveBeenCalled()
    }
  })
})
