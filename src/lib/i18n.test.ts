import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { getLang, loadLang, setLang, STRINGS, t, type StrKey } from './i18n'

beforeEach(async () => { await db.kv.clear(); await setLang('en') })

describe('t', () => {
  it('has a Filipino string for every English key, none blank, none identical by accident', () => {
    for (const k of Object.keys(STRINGS.en) as StrKey[]) {
      expect(STRINGS.fil[k], k).toBeTruthy()
      expect(STRINGS.fil[k], k).not.toBe(STRINGS.en[k])
    }
  })
  it('keeps the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    for (const k of Object.keys(STRINGS.en) as StrKey[]) expect(ph(STRINGS.fil[k]), k).toBe(ph(STRINGS.en[k]))
  })
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(t('med.body', { time: '8:00 AM' }, 'en')).toBe('It is 8:00 AM. Open Bantay to see what is due.')
    expect(t('med.body', { time: '8:00 AM' }, 'fil')).toBe('8:00 AM na. Pakibuksan ang Bantay para makita ang dapat inumin.')
    expect(t('med.body', {}, 'en')).toContain('{time}')
  })
  it('no string carries a medicine name or a health value (B-7)', () => {
    for (const lang of ['en', 'fil'] as const) for (const k of ['med.title', 'med.body'] as const) expect(t(k, { time: '8:00 AM' }, lang)).not.toMatch(/mg|mmHg|bpm|mg\/dL/i)
  })
  it('uses the current language when none is given', async () => {
    expect(t('med.title')).toBe('Medicine time')
    await setLang('fil')
    expect(getLang()).toBe('fil')
    expect(t('med.title')).toBe('Oras na ng gamot')
  })
})

describe('kv lang', () => {
  it('setLang saves, loadLang reads, a bad value falls back to English', async () => {
    await setLang('fil')
    expect((await db.kv.get('lang'))?.value).toBe('fil')
    expect(await loadLang()).toBe('fil')
    await db.kv.put({ key: 'lang', value: 'xx' })
    expect(await loadLang()).toBe('en')
  })
})
