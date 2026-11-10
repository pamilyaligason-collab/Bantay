import { describe, expect, it } from 'vitest'
import { emergencyTitle, localGate } from './gateClient'

describe('localGate (same rules as the server gate)', () => {
  it('Taglish chest pain with trouble breathing is an emergency; the body is Tagalog', async () => {
    const e = await localGate('masakit dibdib ko tapos hirap huminga', 'ph')
    expect(e?.kind).toBe('chest')
    expect(e?.call).toEqual(['911'])
    expect(e?.text).toMatch(/^Hindi sasagot si Jack/)
  })
  it('self-harm carries the 1553 crisis line and then 911, even after an earlier "no" (release review B1)', async () => {
    for (const t of ['I want to die', 'I have no medicine left and I want to die']) {
      const e = await localGate(t, 'ph')
      expect(e?.kind).toBe('selfharm')
      expect(e?.call).toEqual(['1553', '911'])
      expect(e?.text).toMatch(/1553/)
    }
  })
  it('self-harm in the US carries 988 and 911, never 1553 (S30 L8, D1); an unknown place carries both lines', async () => {
    const us = await localGate('I want to die', 'us')
    expect(us?.call).toEqual(['988', '911'])
    expect(us?.text).toMatch(/988/)
    expect(us?.text).not.toMatch(/1553|NCMH/)
    const tl = await localGate('gusto ko nang mamatay', 'us')
    expect(tl?.kind).toBe('selfharm')
    expect(tl?.call).toEqual(['988', '911'])
    expect(tl?.text).toMatch(/^Pasensya na/)
    const both = await localGate('I want to die', null)
    expect(both?.call).toEqual(['988', '1553', '911'])
    expect(both?.text).toMatch(/988/)
    expect(both?.text).toMatch(/1553/)
  })
  it('other emergencies are the same in every place: 911 only', async () => {
    for (const r of ['ph', 'us', null] as const) expect((await localGate('I cant breathe', r))?.call).toEqual(['911'])
  })
  it('with no region given it is read from the phone (the stored fix, then the phone country) and still answers', async () => {
    const e = await localGate('I want to die')
    expect(e?.kind).toBe('selfharm')
    expect(e!.call).toContain('911')
    expect(e!.call.length).toBeGreaterThanOrEqual(2)
  })
  it('English breathing is English text; ordinary questions and negated symptoms are not emergencies', async () => {
    expect((await localGate('I cant breathe'))?.text).toMatch(/^Jack won't answer this one/)
    expect(await localGate('What does HbA1c mean?')).toBeNull()
    expect(await localGate('I took my losartan')).toBeNull()
    expect(await localGate('no chest pain today')).toBeNull()
    expect(await localGate('')).toBeNull()
  })
  it('every kind has a title; an unknown kind falls back', () => {
    for (const k of ['chest', 'breathing', 'stroke', 'unconscious', 'bleeding', 'seizure', 'selfharm', 'poison', 'allergy', 'bp', 'sugar']) expect(emergencyTitle(k)).not.toBe('This may be an emergency')
    expect(emergencyTitle('zzz')).toBe('This may be an emergency')
  })
})
