import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { LAB_GLOSSARY } from '../labGlossary'
import { LAB_TITLES, labTitle } from './labTitles'
import { resolveKey } from './resolve'
import Article from './Article'

// S28: a lab never reads "MedlinePlus has nothing on this" because the glossary chunk failed to load.
const sw = vi.hoisted(() => ({ noGlossary: false, failNext: 0, pack: [] as string[] }))
vi.mock('../../auth/client', () => ({ supabase: null }))
vi.mock('../../auth/session', () => ({ getAccessToken: async () => null, getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../labsLogic', async (orig) => {
  const m = await orig<typeof import('../labsLogic')>()
  return {
    ...m,
    loadLabGlossary: () => (sw.noGlossary || sw.failNext-- > 0 ? Promise.reject(new Error('chunk')) : m.loadLabGlossary()),
    useLabGlossary: () => (sw.noGlossary ? null : m.useLabGlossary()),
  }
})
vi.mock('./fullLibrary', () => ({
  FULL_LIBRARY_HOSTED: true,
  MDWIKI_CREDIT: 'credit', MDWIKI_LICENCE_URL: 'https://example.org/',
  searchFullLibrary: async (q: string) => sw.pack.filter((t) => t.toLowerCase().includes(q.toLowerCase())).map((title) => ({ title, snippet: '', key: title })),
  readArticle: async (k: string) => (sw.pack.includes(k) ? { key: k, title: k, text: 'Plain article text.', url: 'https://example.org/a' } : null),
}))

const LABS: [string, string][] = [['ALT', 'alt'], ['AST', 'ast'], ['Creatinine', 'creatinine'], ['HbA1c', 'hba1c'], ['LDL cholesterol', 'ldl']]
const connect = { feed: { entry: [{ title: 'Lab note', summary: 'A short lab summary from MedlinePlus.', link: [{ href: 'https://medlineplus.gov/lab-tests/x/' }] }] } }

beforeEach(async () => {
  sw.noGlossary = false; sw.failNext = 0; sw.pack = []
  await db.kv.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => connect }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('lab titles map', () => {
  it('has one row per glossary lab, with the same code, LOINC and every name and alias', () => {
    expect(LAB_TITLES.map((l) => l.code).sort()).toEqual(LAB_GLOSSARY.map((l) => l.code).sort())
    for (const e of LAB_GLOSSARY) {
      const t = labTitle(e.code)!
      expect(t.loinc).toBe(e.loinc)
      for (const n of [e.code, e.name, ...e.aliases]) expect(labTitle(n)?.code, n).toBe(e.code)
    }
  })
  it('ALT maps to the mdwiki title the pack holds', () => { expect(labTitle('SGPT')?.title).toBe('Alanine transaminase') })
})

describe('lab explainer without a silent null (S28)', () => {
  it.each(LABS)('%s with the glossary loaded opens its own note offline', async (label, code) => {
    expect(await resolveKey(label)).toBe(`t:${code}`)
    render(<Article rawKey={`s:${label}`} />)
    expect((await screen.findByTestId('lab-measures')).textContent!.trim().length).toBeGreaterThan(20)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(LABS)('%s with the glossary failing and the full library ready resolves to the library or LOINC, never the medicine path', async (label, code) => {
    sw.noGlossary = true
    sw.pack = ['Alanine transaminase', 'Transaminase', 'Glycated hemoglobin', 'Low-density lipoprotein']
    const k = await resolveKey(label)
    expect(k).toBe({ alt: 'f:Alanine transaminase', ast: 'f:Transaminase', creatinine: `l:2160-0`, hba1c: 'f:Glycated hemoglobin', ldl: 'f:Low-density lipoprotein' }[code])
    render(<Article rawKey={`s:${label}`} />)
    if (k.startsWith('f:')) expect((await screen.findByText('Plain article text.')).textContent).toBe('Plain article text.')
    else expect((await screen.findByText('A short lab summary from MedlinePlus.')).textContent).toContain('lab summary') // LOINC path shows the MedlinePlus Connect summary, not just any node
    for (const c of (fetch as ReturnType<typeof vi.fn>).mock.calls) expect(String(c[0])).not.toContain('6.88') // RxNorm
  })

  it.each(LABS)('%s with the glossary failing and no library asks MedlinePlus Connect by LOINC and shows the summary', async (label, code) => {
    sw.noGlossary = true
    expect(await resolveKey(label)).toBe(`l:${labTitle(code)!.loinc}`)
    render(<Article rawKey={`s:${label}`} />)
    expect(await screen.findByText('A short lab summary from MedlinePlus.')).toBeTruthy()
    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(urls.length).toBe(1)
    expect(urls[0]).toContain(encodeURIComponent('2.16.840.1.113883.6.1')) // LOINC code system
    expect(urls[0]).toContain(`mainSearchCriteria.v.c=${encodeURIComponent(labTitle(code)!.loinc)}`)
  })

  it('a glossary load that fails once is retried, so the lab still gets its own note', async () => {
    sw.failNext = 1
    expect(await resolveKey('ALT')).toBe('t:alt')
  })

  it('a word that is not a lab still takes the normal path', async () => {
    expect(await resolveKey('zzzz medicine')).toBe('s:zzzz medicine')
  })
})
