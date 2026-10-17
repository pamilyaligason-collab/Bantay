import { describe, expect, it, vi } from 'vitest'
import { buildRequest, confirmDraft, parseReply, personFor, sourceLink, validateDraft } from './tools'

const people = [{ id: 'p1', name: 'Lola' }, { id: 'p2', name: 'Ben' }]
const api = () => ({ logReading: vi.fn(), logMedTaken: vi.fn(), logActivity: vi.fn() })

describe('parseReply', () => {
  it('turns tool calls into cards and drops unknown ones', () => {
    const { text, cards } = parseReply({
      reply: 'Ok',
      tool_calls: [
        { name: 'log_reading', arguments: { person: 'Lola', test: 'HbA1c', value: 6.1 } },
        { name: 'log_med_taken', arguments: { person: 'Ben', name: 'Losartan' } },
        { name: 'log_activity', arguments: { person: 'Ben', kind: 'walk', minutes: 20 } },
        { name: 'open_screen', arguments: { tab: 'health' } },
        { name: 'open_screen', arguments: { tab: 'https://evil.example' } },
        { name: 'explain_term', arguments: { term: 'HbA1c', answer: 'A 3 month sugar average.', source: 'wikipedia' } },
        { name: 'whats_the_weather', arguments: {} },
        { name: 'delete_everything', arguments: {} }
      ]
    })
    expect(text).toBe('Ok')
    expect(cards.map((c) => c.kind)).toEqual(['draft', 'draft', 'draft', 'open', 'explain', 'weather'])
    expect(cards[0]).toMatchObject({ tool: 'log_reading', fields: { person: 'Lola', test: 'HbA1c', value: '6.1' } })
  })
  it('survives garbage', () => {
    expect(parseReply(null)).toEqual({ text: '', cards: [] })
    expect(parseReply({ tool_calls: 'x' })).toEqual({ text: '', cards: [] })
  })
})

describe('confirmDraft', () => {
  it('calls the matching log fn exactly once', async () => {
    const a = api()
    await confirmDraft('log_reading', { person: 'Lola', test: 'HbA1c', value: '6.1', unit: '%' }, people, a)
    expect(a.logReading).toHaveBeenCalledTimes(1)
    expect(a.logReading.mock.calls[0]![0]).toMatchObject({ personId: 'p1', test: 'HbA1c', value: 6.1, unit: '%' })
    expect(a.logMedTaken).not.toHaveBeenCalled()
    expect(a.logActivity).not.toHaveBeenCalled()
    await confirmDraft('log_med_taken', { person: 'ben', name: 'Losartan' }, people, a)
    expect(a.logMedTaken).toHaveBeenCalledTimes(1)
    expect(a.logMedTaken.mock.calls[0]![0]).toMatchObject({ personId: 'p2', name: 'Losartan' })
    await confirmDraft('log_activity', { person: 'p2', kind: 'walk', minutes: '20', steps: '' }, people, a)
    expect(a.logActivity.mock.calls[0]![0]).toMatchObject({ personId: 'p2', kind: 'walk', minutes: 20, steps: null, source: 'manual' })
  })
  it('refuses incomplete drafts without calling anything', async () => {
    const a = api()
    await expect(confirmDraft('log_reading', { person: 'Lola', test: 'HbA1c', value: 'abc' }, people, a)).rejects.toThrow()
    await expect(confirmDraft('log_med_taken', { person: 'x', name: 'm' }, [], a)).rejects.toThrow()
    expect(validateDraft('log_activity', { person: 'p1', kind: 'walk' }, people)).toBeTruthy()
    expect(a.logReading).not.toHaveBeenCalled()
  })
})

describe('personFor', () => {
  it('returns undefined when nobody matches and blocks the save', async () => {
    const a = api()
    expect(personFor('Somebody Else', people)).toBeUndefined()
    expect(validateDraft('log_med_taken', { person: 'Somebody Else', name: 'm' }, people)).toBe('Pick who this is for.')
    await expect(confirmDraft('log_med_taken', { person: '', name: 'm' }, people, a)).rejects.toThrow()
    expect(a.logMedTaken).not.toHaveBeenCalled()
  })
})

describe('buildRequest', () => {
  it('sends at most the last 10 messages and only role + content', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: 'user' as const, content: `m${i}`, extra: 'x' }))
    const r = buildRequest(msgs, 'health')
    expect(r.messages).toHaveLength(10)
    expect(r.messages[0]!.content).toBe('m15')
    expect(Object.keys(r.messages[0]!)).toEqual(['role', 'content'])
    expect(r.screen).toBe('health')
  })
})

describe('sourceLink', () => {
  it('builds links itself', () => {
    expect(sourceLink('medlineplus', 'HbA1c').url).toMatch(/^https:\/\/vsearch\.nlm\.nih\.gov\/.*HbA1c/)
    expect(sourceLink('wikipedia', 'a b').label).toBe('Read more on Wikipedia (CC BY-SA 4.0)')
    expect(sourceLink('kiwix', 'x', 'http://kiwix.local/').url).toBe('http://kiwix.local/search?pattern=x')
    expect(sourceLink('kiwix', 'x', '').url).toContain('medlineplus')
  })
})
