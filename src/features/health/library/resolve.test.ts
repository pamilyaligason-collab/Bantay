import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { LAB_GLOSSARY } from '../labGlossary'
import { resolveHref, resolveKey } from './resolve'

vi.mock('./fullLibrary', () => ({ searchFullLibrary: vi.fn(async (q: string) => (q.toLowerCase() === 'sarcoidosis' ? [{ title: 'Sarcoidosis', snippet: '', key: 'Sarcoidosis' }, { title: 'Sarcoidosis x', snippet: '', key: 'x' }] : [])) }))

describe('one explainer resolver (S26, D-161)', () => {
  it('ALT, AST and creatinine resolve offline to the lab glossary, by label, code or long alias', async () => {
    expect(await resolveKey('ALT')).toBe('t:alt')
    expect(await resolveKey('alt')).toBe('t:alt')
    expect(await resolveKey('SGOT')).toBe('t:ast')
    expect(await resolveKey('Creatinine')).toBe('t:creatinine')
    expect(await resolveKey('alanine aminotransferase', 'c')).toBe('t:alt')
    expect(await resolveHref('ALT')).toBe('#health/library/t%3Aalt')
  })
  it('an exact curated topic (title or also-called) opens offline', async () => {
    expect(await resolveKey('Type 2 diabetes', 'c')).toMatch(/^e:diabetes/)
    expect((await resolveHref('Asthma', 'c')).startsWith('#health/library/e%3A')).toBe(true)
  })
  it('the full library is used for an exact title only; otherwise the online key stays', async () => {
    expect(await resolveKey('Sarcoidosis', 'c')).toBe('f:Sarcoidosis')
    expect(await resolveKey('Sarcoid', 'c')).toBe('c:Sarcoid')
    expect(await resolveKey('zzzz medicine')).toBe('s:zzzz medicine')
  })
  it('every glossary LOINC is a well-formed code and unique', () => {
    const l = LAB_GLOSSARY.map((e) => e.loinc).filter(Boolean) as string[]
    expect(l.length).toBe(LAB_GLOSSARY.length)
    expect(new Set(l).size).toBe(l.length)
    for (const c of l) expect(c).toMatch(/^\d{1,5}-\d$/)
    expect(LAB_GLOSSARY.find((e) => e.code === 'alt')!.loinc).toBe('1742-6')
    expect(LAB_GLOSSARY.find((e) => e.code === 'ast')!.loinc).toBe('1920-8')
    expect(LAB_GLOSSARY.find((e) => e.code === 'creatinine')!.loinc).toBe('2160-0')
  })
})
