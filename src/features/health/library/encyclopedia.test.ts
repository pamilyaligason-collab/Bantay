import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import lib from '../../../data/medlib/topics.json'
import { BODIES, commonInPh, inSeason, seasonNow, searchTopics, topicHref, type MedLib } from './encyclopedia'

const { topics } = lib as unknown as MedLib
const ids = (r: { id: string }[]) => r.map((t) => t.id)

describe('topics.json shape', () => {
  it('has a version, a source and at least 140 topics with unique ids', () => {
    expect(lib.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(lib.source).toMatch(/MedlinePlus/)
    expect(topics.length).toBeGreaterThanOrEqual(140)
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
  })
  it('every topic has 3 short lines, a go-now line, aka words, a known body and the four sections', () => {
    const bodies: string[] = BODIES.map((b) => b.id)
    for (const t of topics) {
      expect(t.short, t.id).toHaveLength(3)
      expect(t.goNow.length, t.id).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(t.aka) && t.aka.length >= 1, t.id).toBe(true)
      expect(bodies, t.id).toContain(t.body)
      expect(t.sections.map((s) => s.heading), t.id).toEqual(['What it is', 'Signs', 'What helps at home', 'Prevent it'])
      expect(t.links.medlineplus, t.id).toMatch(/^https:\/\/medlineplus\.gov\//)
      expect(t.videos.length, t.id).toBeLessThanOrEqual(2)
      expect([null, 'rainy', 'dry']).toContain(t.season)
    }
  })
  it('every body has topics, and every video id is 11 characters', () => {
    for (const b of BODIES) expect(topics.some((t) => t.body === b.id), b.id).toBe(true)
    for (const t of topics) for (const v of t.videos) expect(v.id).toMatch(/^[\w-]{11}$/)
  })
  it('every picture is a file of at most 60 KB with a CC0, CC BY or CC BY-SA licence', () => {
    const pics = topics.filter((t) => t.picture)
    expect(pics.length).toBeGreaterThanOrEqual(5)
    for (const t of pics) {
      expect(statSync(`public/img/medlib/${t.picture!.file}`).size, t.id).toBeLessThanOrEqual(60_000)
      expect(t.picture!.licence, t.id).toMatch(/^(CC0|CC BY(-SA)? \d\.\d)$/)
      expect(t.picture!.href, t.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    }
  })
  it('names no person, user path or email (public repo)', () => {
    expect(JSON.stringify(lib)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|C:\\Users|\/Users\//i)
  })
})

describe('search', () => {
  it('finds a topic by Tagalog also-called words', () => {
    expect(ids(searchTopics(topics, 'altapresyon'))[0]).toBe('hypertension')
    expect(ids(searchTopics(topics, 'ubo'))).toContain('cough')
    expect(ids(searchTopics(topics, 'sipon'))).toContain('cold')
    expect(ids(searchTopics(topics, 'lagnat'))).toEqual(expect.arrayContaining(['dengue', 'childfever']))
  })
  it('ignores case and accents, ranks a title match first, and returns [] for no match or an empty box', () => {
    expect(ids(searchTopics(topics, '  DENGUE '))[0]).toBe('dengue')
    expect(searchTopics(topics, 'zzzxqq')).toEqual([])
    expect(searchTopics(topics, '   ')).toEqual([])
  })
  it('needs every typed word to match', () => {
    const r = searchTopics(topics, 'kagat ahas')
    expect(ids(r)).toEqual(['snakebite'])
  })
})

describe('season', () => {
  it('rainy season is June to November in Manila time, dry otherwise', () => {
    expect(seasonNow(new Date('2026-06-01T00:00:00+08:00'))).toBe('rainy')
    expect(seasonNow(new Date('2026-11-30T23:59:00+08:00'))).toBe('rainy')
    expect(seasonNow(new Date('2026-12-01T00:00:00+08:00'))).toBe('dry')
    expect(seasonNow(new Date('2026-05-31T23:59:00+08:00'))).toBe('dry')
    expect(seasonNow(new Date('2026-05-31T16:30:00Z'))).toBe('rainy') // 00:30 on 1 June in Manila, still May in UTC
  })
  it('puts dengue, leptospirosis and flu-season topics first in the rainy months and tags only those', () => {
    const rainy = new Date('2026-08-15T12:00:00+08:00')
    const dry = new Date('2026-02-15T12:00:00+08:00')
    const get = (id: string) => topics.find((t) => t.id === id)!
    expect(inSeason(get('dengue'), rainy)).toBe(true)
    expect(inSeason(get('lepto'), rainy)).toBe(true)
    expect(inSeason(get('dengue'), dry)).toBe(false)
    expect(inSeason(get('hypertension'), rainy)).toBe(false)
    const list = commonInPh(topics, rainy)
    const lastSeasonal = list.map((t) => inSeason(t, rainy)).lastIndexOf(true)
    expect(list.slice(0, lastSeasonal + 1).every((t) => inSeason(t, rainy))).toBe(true)
    expect(list.every((t) => t.ph)).toBe(true)
  })
})

describe('addresses', () => {
  it('topicHref uses the #health/library route', () => {
    expect(topicHref('dengue')).toBe('#health/library/e%3Adengue')
  })
})
