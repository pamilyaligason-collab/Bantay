import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '../../db'
import { describe, expect, it, vi } from 'vitest'
import { buildReadings, EMPTY_DRAFT, parseDraft, readDevicePhoto, toTyped, type Typed } from './reading'

const T: Typed = { systolic: '', diastolic: '', pulse: '', value: '', unit: '' }

describe('parseDraft', () => {
  it('keeps numbers, turns everything else into null (never 0)', () => {
    expect(parseDraft({ kind: 'bp', systolic: 128, diastolic: '82', pulse: null, value: undefined, unit: 'mmHg', confidence: 0.9 }))
      .toEqual({ kind: 'bp', systolic: 128, diastolic: null, pulse: null, value: null, unit: 'mmHg', confidence: 0.9 })
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT)
    expect(parseDraft({ kind: 'robot' }).kind).toBeNull()
  })
  it('toTyped leaves unread fields empty', () => {
    expect(toTyped({ ...EMPTY_DRAFT, kind: 'bp', systolic: 128 })).toMatchObject({ systolic: '128', diastolic: '', pulse: '', unit: 'mmHg' })
    expect(toTyped(EMPTY_DRAFT).value).toBe('')
    expect(toTyped({ ...EMPTY_DRAFT, kind: 'glucose', value: 5.6, unit: 'mmol/L' })).toMatchObject({ value: '5.6', unit: 'mmol/L' })
  })
})

describe('buildReadings', () => {
  it('blood pressure: top, bottom and optional pulse in the units the app uses', () => {
    expect(buildReadings('bp', { ...T, systolic: '128', diastolic: '82', pulse: '71' })).toEqual({ ok: true, readings: [
      { test: 'bp_systolic', value: 128, unit: 'mmHg' }, { test: 'bp_diastolic', value: 82, unit: 'mmHg' }, { test: 'heart_rate', value: 71, unit: 'bpm' }] })
    expect(buildReadings('bp', { ...T, systolic: '128', diastolic: '82' })).toMatchObject({ ok: true, readings: [{}, {}] })
  })
  it('blood pressure: empty, swapped or silly numbers are refused, empty is not 0', () => {
    expect(buildReadings('bp', T)).toMatchObject({ ok: false })
    expect(buildReadings('bp', { ...T, systolic: '128' })).toMatchObject({ ok: false })
    expect(buildReadings('bp', { ...T, systolic: '80', diastolic: '120' })).toMatchObject({ ok: false })
    expect(buildReadings('bp', { ...T, systolic: '900', diastolic: '80' })).toMatchObject({ ok: false })
    expect(buildReadings('bp', { ...T, systolic: '128', diastolic: '82', pulse: '5' })).toMatchObject({ ok: false })
  })
  it('glucose mmol/L is converted to mg/dL with the existing factor; mg/dL is kept', () => {
    expect(buildReadings('glucose', { ...T, value: '5.6', unit: 'mmol/L' })).toEqual({ ok: true, readings: [{ test: 'glucose', value: 100.9, unit: 'mg/dL' }] })
    expect(buildReadings('glucose', { ...T, value: '110', unit: 'mg/dL' })).toEqual({ ok: true, readings: [{ test: 'glucose', value: 110, unit: 'mg/dL' }] })
    expect(buildReadings('glucose', { ...T, value: '5.6', unit: 'mg/dL' })).toMatchObject({ ok: false }) // 5.6 mg/dL is not a sugar
    expect(buildReadings('glucose', { ...T, value: '', unit: 'mg/dL' })).toMatchObject({ ok: false })
    expect(buildReadings('glucose', { ...T, value: '100', unit: '' })).toMatchObject({ ok: false })
  })
  it('weight lb, temperature F and oxygen', () => {
    expect(buildReadings('weight', { ...T, value: '137', unit: 'lb' })).toEqual({ ok: true, readings: [{ test: 'weight', value: 62.1, unit: 'kg' }] })
    expect(buildReadings('weight', { ...T, value: '62.4', unit: 'kg' })).toMatchObject({ ok: true, readings: [{ value: 62.4 }] })
    expect(buildReadings('temp', { ...T, value: '98.6', unit: 'F' })).toEqual({ ok: true, readings: [{ test: 'temperature', value: 37, unit: 'C' }] })
    expect(buildReadings('temp', { ...T, value: '368', unit: 'C' })).toMatchObject({ ok: false })
    expect(buildReadings('spo2', { ...T, value: '97', unit: '%' })).toEqual({ ok: true, readings: [{ test: 'spo2', value: 97, unit: '%' }] })
    expect(buildReadings('spo2', { ...T, value: '140', unit: '%' })).toMatchObject({ ok: false })
  })
})

describe('readDevicePhoto', () => {
  const photo = new Blob(['x'], { type: 'image/jpeg' })
  const client = (invoke: () => Promise<unknown>) => ({ functions: { invoke } }) as unknown as SupabaseClient
  it('sends mode reading with the image and returns the draft', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, reading: { kind: 'glucose', value: 5.6, unit: 'mmol/L', confidence: 0.8 } }, error: null }))
    const r = await readDevicePhoto(client(invoke), photo)
    expect(invoke).toHaveBeenCalledWith('records-extract', { body: { mode: 'reading', mime: 'image/jpeg', image_base64: 'eA==' } })
    expect(r).toEqual({ failed: false, draft: { ...EMPTY_DRAFT, kind: 'glucose', value: 5.6, unit: 'mmol/L', confidence: 0.8 } })
  })
  it('offline, no client or a server error gives an empty draft and failed', async () => {
    expect(await readDevicePhoto(null, photo)).toEqual({ failed: true, draft: EMPTY_DRAFT })
    expect(await readDevicePhoto(client(async () => ({ data: null, error: { message: 'x' } })), photo)).toEqual({ failed: true, draft: EMPTY_DRAFT })
    expect(await readDevicePhoto(client(async () => ({ data: null, error: { context: { status: 429 } } })), photo)).toEqual({ failed: true, limited: true, draft: EMPTY_DRAFT })
    expect(await readDevicePhoto(client(async () => ({ data: { ok: false, error: 'rate_limited' }, error: null })), photo)).toMatchObject({ failed: true, limited: true })
    expect(await readDevicePhoto(client(async () => { throw new Error('offline') }), photo)).toEqual({ failed: true, draft: EMPTY_DRAFT })
  })
  it('privacy.ai off: the photo is not sent (no invoke) and the result says off', async () => {
    await db.kv.put({ key: 'privacy.ai', value: false })
    const invoke = vi.fn(async () => ({ data: { ok: true, reading: {} }, error: null }))
    expect(await readDevicePhoto(client(invoke), photo)).toEqual({ failed: true, off: true, draft: EMPTY_DRAFT })
    expect(invoke).not.toHaveBeenCalled()
    await db.kv.put({ key: 'privacy.ai', value: true })
    await readDevicePhoto(client(invoke), photo)
    expect(invoke).toHaveBeenCalledTimes(1)
    await db.kv.clear()
  })
})
