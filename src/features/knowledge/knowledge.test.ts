import { describe, expect, it } from 'vitest'
import { seedSql, spliceSeed, validate, type Topic } from '../../../scripts/knowledge/build.mjs'
import topicsRaw from '../../../scripts/knowledge/topics.json?raw'
import migration from '../../../supabase/migrations/0025_knowledge.sql?raw'

const topics = JSON.parse(topicsRaw) as Topic[]
const one: Topic = { slug: 'x-y', title_en: 'T', title_tl: 'T', summary: 'A plain summary that is long enough to pass the check.', source_name: 'NHS', source_url: 'https://www.nhs.uk/a/', reviewed_at: '2026-10-22', synonyms: ['abc'] }

describe('knowledge topics.json', () => {
  it('is valid and holds about 40 topics', () => {
    expect(validate(topics)).toEqual([])
    expect(topics.length).toBeGreaterThanOrEqual(40)
  })
  it('covers the topics the family needs', () => {
    const slugs = new Set(topics.map((t) => t.slug))
    for (const s of ['high-blood-pressure', 'bp-reading', 'low-salt-eating', 'potassium-kidneys', 'type-2-diabetes', 'cholesterol', 'statins', 'dehydration', 'heat-illness', 'falls', 'dizziness', 'stroke-fast', 'heart-attack', 'call-911', 'sleep', 'stress', 'med-amlodipine', 'med-metformin', 'med-atorvastatin', 'med-aspirin', 'med-furosemide', 'med-insulin']) expect(slugs, s).toContain(s)
  })
  it('knows Tagalog and Taglish words', () => {
    const find = (term: string) => topics.filter((t) => t.synonyms.includes(term)).map((t) => t.slug)
    expect(find('altapresyon')).toContain('high-blood-pressure')
    expect(find('asukal')).toContain('type-2-diabetes')
    expect(find('nahihilo')).toContain('dizziness')
    expect(find('maalat')).toContain('low-salt-eating')
    expect(find('hindi makatulog')).toContain('insomnia')
  })
  it('keeps the emergency topics pointing at 911', () => {
    for (const s of ['stroke-fast', 'heart-attack', 'call-911']) expect(topics.find((t) => t.slug === s)?.summary, s).toContain('911')
  })
})

describe('knowledge build', () => {
  it('rejects bad input', () => {
    expect(validate([one])).toEqual([])
    expect(validate([])).not.toEqual([])
    expect(validate([{ ...one, source_url: 'http://www.nhs.uk/a/' }])).toHaveLength(1)
    expect(validate([{ ...one, source_url: 'https://example.com/a' }])).toHaveLength(1)
    expect(validate([{ ...one, synonyms: ['Has Capital'] }])).toHaveLength(1)
    expect(validate([{ ...one, synonyms: ['a.b+'] }])).toHaveLength(1)
    expect(validate([{ ...one, synonyms: [] }])).toHaveLength(1)
    expect(validate([{ ...one, summary: 'short' }])).toHaveLength(1)
    expect(validate([{ ...one, reviewed_at: '22/10/2026' }])).toHaveLength(1)
    expect(validate([one, one])).toContain('x-y: duplicate slug')
  })
  it('doubles single quotes so a summary cannot break the SQL', () => {
    const sql = seedSql([{ ...one, summary: "It's a plain summary that is long enough to pass the check." }])
    expect(sql).toContain("It''s a plain summary")
    expect(sql).not.toMatch(/[^']'s a plain/)
  })
  it('writes every topic and synonym once', () => {
    const sql = seedSql(topics)
    for (const t of topics) expect(sql, t.slug).toContain(`('${t.slug}', '`)
    const pairs = sql.slice(sql.indexOf('insert into public.knowledge_synonyms')).match(/^ {2}\('/gm) ?? []
    expect(pairs.length).toBe(new Set(topics.flatMap((t) => t.synonyms.map((s) => `${s}|${t.slug}`))).size)
  })
  it('splice replaces only the marked block and is repeatable', () => {
    const once = spliceSeed(migration, seedSql(topics))
    expect(spliceSeed(once, seedSql(topics))).toBe(once)
    expect(() => spliceSeed('no markers', 'x')).toThrow(/markers/)
  })
  it('the committed migration is what topics.json produces', () => {
    expect(spliceSeed(migration, seedSql(topics))).toBe(migration)
  })
})

describe('0025_knowledge.sql', () => {
  it('locks the tables to signed-in readers and the function to the caller', () => {
    expect(migration).toMatch(/revoke all on public\.%I from public, anon, authenticated/)
    expect(migration).toMatch(/grant select on public\.%I to authenticated/)
    expect(migration).toMatch(/security invoker/)
    expect(migration).toMatch(/revoke all on function public\.search_knowledge\(text, integer\) from public, anon/)
    expect(migration).not.toMatch(/grant (insert|update|delete)/i)
  })
})
