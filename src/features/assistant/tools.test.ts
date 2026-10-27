import { describe, expect, it, vi } from 'vitest'
import { personChoices, buildRequest, cardScrollTop, dateWords, personMatches, confirmDraft, confirmTask, parseReply, personFor, recordsAnswer, sourceLink, taskArgs, validateDraft } from './tools'
import type { Reading } from '../health/ranges'

describe('add task + records answer cards', () => {
  it('parseReply makes task and records cards, drops ones with no title or test', () => {
    const { cards } = parseReply({ tool_calls: [
      { name: 'add_task', arguments: { title: ' Buy rice ', due: '2026-10-25', assignee: 'Ben' } },
      { name: 'add_task', arguments: { title: '  ' } },
      { name: 'records_answer', arguments: { person: 'Lola', test: 'HbA1c' } },
      { name: 'records_answer', arguments: { person: 'Lola' } }
    ] })
    expect(cards).toEqual([
      { kind: 'task', id: 'c0', title: 'Buy rice', due: '2026-10-25', assignee: 'Ben' },
      { kind: 'records', id: 'c2', person: 'Lola', test: 'HbA1c' }
    ])
  })
  it('taskArgs keeps only what is valid and guesses nobody', () => {
    expect(taskArgs('Buy rice', '2026-10-25', 'ben', people)).toEqual({ title: 'Buy rice', due: '2026-10-25', assigneePersonId: 'p2' })
    expect(taskArgs('Buy rice', 'tomorrow', 'Somebody', people)).toEqual({ title: 'Buy rice' })
    expect(taskArgs('  ', '', '', people)).toBeNull()
  })
  it('confirmTask calls addTask once with the contract shape, and not at all when empty', async () => {
    const add = vi.fn(async () => undefined)
    await confirmTask('Buy rice', '2026-10-25', 'Lola', people, add)
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith({ title: 'Buy rice', due: '2026-10-25', assigneePersonId: 'p1' })
    await expect(confirmTask('', '', '', people, add)).rejects.toThrow()
    expect(add).toHaveBeenCalledTimes(1)
  })
})

const rd = (o: Partial<Reading>): Reading => ({ personId: 'p1', takenAt: '2026-10-02T04:00:00.000Z', test: 'hba1c', value: 6.8, unit: '%', ...o })
describe('recordsAnswer', () => {
  it('answers from the newest confirmed lab reading with the lab range and a citation', () => {
    const a = recordsAnswer([rd({ takenAt: '2026-03-01T04:00:00.000Z', value: 7.1 }), rd({ sourceFileId: 'f1', confirmedAt: '2026-10-03T00:00:00Z', labLow: 4, labHigh: 5.6 })], 'Lola', 'HbA1c')
    expect(a.text).toContain('6.8 %')
    expect(a.text).toContain('2 Oct 2026')
    expect(a.text).toContain("above range (the lab's range: 4 to 5.6)")
    expect(a.text).toContain('not a diagnosis')
    expect(a.cite).toBe('From your lab result on 2 Oct 2026')
  })
  it('ignores an imported reading nobody has checked yet', () => {
    const a = recordsAnswer([rd({ sourceFileId: 'f1' })], 'Lola', 'hba1c')
    expect(a.text).toContain('do not have a saved')
    expect(a.cite).toBe('')
  })
  it('never turns an unknown value into a number', () => {
    expect(recordsAnswer([rd({ value: Number.NaN })], 'Lola', 'hba1c').cite).toBe('')
  })
  it('joins blood pressure from the same moment and cites what was logged', () => {
    const a = recordsAnswer([rd({ test: 'bp_systolic', value: 130, unit: 'mmHg' }), rd({ test: 'bp_diastolic', value: 85, unit: 'mmHg' })], 'Lola', 'blood pressure')
    expect(a.text).toContain('130/85 mmHg')
    expect(a.cite).toBe('From what you logged on 2 Oct 2026')
  })
  it('says so when there is no range to compare with', () => {
    expect(recordsAnswer([rd({ test: 'weight', value: 60, unit: 'kg' })], 'Lola', 'weight').text).toContain('no range')
  })
})

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

describe('loose name hits are suggestions', () => {
  it('Lol with only Lolita is not a match but is offered first', () => {
    const ppl = [{ id: 'x', name: 'Ben' }, { id: 'l', name: 'Lolita' }]
    expect(personFor('Lol', ppl)).toBeUndefined()
    expect(personChoices('Lol', ppl).map((p) => p.id)).toEqual(['l', 'x'])
    expect(validateDraft('log_med_taken', { person: 'Lol', name: 'Losartan' }, ppl)).toBe('Pick who this is for.')
  })
})

describe('buildRequest empty turns and card scroll', () => {
  it('drops assistant turns with no text', () => {
    const r = buildRequest([{ role: 'user', content: 'hi' }, { role: 'assistant', content: '' }, { role: 'user', content: 'again' }], 'today')
    expect(r.messages.map((m) => m.content)).toEqual(['hi', 'again'])
  })
  it('scrolls to the card top when it fits, to the end when taller than the list', () => {
    expect(cardScrollTop(100, 200, 300, 900)).toBe(100)
    expect(cardScrollTop(100, 400, 300, 900)).toBe(900)
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

describe('personFor first names, nicknames and aliases', () => {
  const fam = [{ id: 'a', name: 'Rosalino Roc', aliases: ['Papang'] }, { id: 'b', name: 'Maria Roc', aliases: ['Ma'] }, { id: 'c', name: 'Rosa Cruz' }]
  it('matches case-insensitively by first name, alias and nickname', () => {
    expect(personFor('rosalino', fam)?.id).toBe('a')
    expect(personFor('PAPANG', fam)?.id).toBe('a')
    expect(personFor('Ma', fam)?.id).toBe('b')
    expect(personFor('Lino', fam)).toBeUndefined() // nickname-style hit is a suggestion only
    expect(personMatches('Lino', fam).map((p) => p.id)).toEqual(['a'])
    expect(personFor('Rosalino Roc', fam)?.id).toBe('a')
  })
  it('is undefined when unclear, with all candidates listed', () => {
    expect(personFor('Roc', fam)).toBeUndefined()
    expect(personMatches('Roc', fam).map((p) => p.id)).toEqual(['a', 'b'])
    expect(personFor('', fam)).toBeUndefined()
    expect(personFor('Zed', fam)).toBeUndefined()
  })
})

describe('dateWords', () => {
  it('writes dates in words and leaves other text alone', () => {
    expect(dateWords('2026-10-23')).toBe('Fri, Oct 23')
    expect(dateWords('tomorrow')).toBe('tomorrow')
  })
})

describe('confirmDraft log_med_taken resolves the name to a medication', () => {
  const ppl = [{ id: 'p1', name: 'Lola' }]
  const mk = () => ({ logReading: vi.fn(), logMedTaken: vi.fn(), logActivity: vi.fn() })
  const meds = [{ personId: 'p1', name: 'Drug A 50 mg tab', serverId: 'srv-a', medStatus: 'active' as const, schedule: { v: 1, times: ['08:00', '20:00'] } }]
  it('passes medicationId and the nearest open slot for a name with strength and form words', async () => {
    const a = mk()
    await confirmDraft('log_med_taken', { person: 'Lola', name: 'drug a 500mg tablet', takenAt: new Date(2026, 9, 20, 8, 10).toISOString() }, ppl, a, new Date(2026, 9, 20, 9, 0), meds)
    expect(a.logMedTaken.mock.calls[0]![0]).toMatchObject({ personId: 'p1', name: 'Drug A 50 mg tab', medicationId: 'srv-a', slot: '08:00' })
  })
  it('an unknown name still logs by name, with no medicationId', async () => {
    const a = mk()
    await confirmDraft('log_med_taken', { person: 'Lola', name: 'Vitamin Z' }, ppl, a, new Date(2026, 9, 20, 9, 0), meds)
    const arg = a.logMedTaken.mock.calls[0]![0]
    expect(arg).toMatchObject({ personId: 'p1', name: 'Vitamin Z' })
    expect(arg).not.toHaveProperty('medicationId')
  })
  it('a medication that has no server id yet is logged by name', async () => {
    const a = mk()
    await confirmDraft('log_med_taken', { person: 'Lola', name: 'Drug A' }, ppl, a, new Date(2026, 9, 20, 9, 0), [{ ...meds[0]!, serverId: undefined }])
    expect(a.logMedTaken.mock.calls[0]![0]).not.toHaveProperty('medicationId')
  })
})

describe('server emergency reply and plausible-range drafts (S10)', () => {
  it('parseReply keeps the server 911 card: digit-only numbers, text moved into the card', () => {
    const r = parseReply({ reply: 'Call now.', tool_calls: [], emergency: { kind: 'selfharm', call: ['1553', '911', 'x<b>'] } })
    expect(r).toEqual({ text: '', cards: [], emergency: { kind: 'selfharm', call: ['1553', '911'], text: 'Call now.' } })
    expect(parseReply({ emergency: { kind: 'chest', call: [] } }).emergency?.call).toEqual(['911'])
    expect(parseReply({ reply: 'hi', emergency: {} })).toEqual({ text: 'hi', cards: [] })
  })
  it('a reading draft outside the add-sheet plausible range cannot be confirmed; mmol/L sugar and unknown tests pass', () => {
    const ppl = [{ id: 'p1', name: 'Lola' }]
    const d = (test: string, value: string, unit = '') => validateDraft('log_reading', { person: 'p1', test, value, unit }, ppl)
    expect(d('weight', '700', 'kg')).toBe('Check the number: it looks too small or too big.')
    expect(d('Blood sugar', '2000')).toBe('Check the number: it looks too small or too big.')
    expect(d('pulse', '10')).toBe('Check the number: it looks too small or too big.')
    expect(d('weight', '62', 'kg')).toBeNull()
    expect(d('blood sugar', '6.1', 'mmol/L')).toBeNull()
    expect(d('blood sugar', '6.1')).toBeNull()
    expect(d('HbA1c', '6.1', '%')).toBeNull()
  })
})
