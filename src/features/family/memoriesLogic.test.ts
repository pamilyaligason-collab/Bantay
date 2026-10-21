import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitWithin, hasExifMarker, isNotSetUp, shortDay, stripToJpeg } from './memoriesLogic'

// A JPEG as bytes: SOI, optional segments, a tiny scan, EOI. Segment = FF marker, 2-byte length (counts itself), payload.
const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const jfif = seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const exif = seg(0xe1, [...ascii('Exif'), 0, 0, ...ascii('II*'), 0, ...ascii('GPS 10.31N 123.89E')]) // camera + GPS stand-in
const xmp = seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'))
const dqt = seg(0xdb, new Array(65).fill(1))
const scan = [0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0x56, 0xff, 0xd9]
const jpeg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat(), ...scan])

describe('hasExifMarker', () => {
  it('finds Exif (camera, time, GPS) and XMP in the APP1 segment', () => {
    expect(hasExifMarker(jpeg(jfif, exif, dqt))).toBe(true)
    expect(hasExifMarker(jpeg(jfif, xmp, dqt))).toBe(true)
    expect(hasExifMarker(jpeg(exif))).toBe(true)
  })
  it('is false for a clean JPEG (canvas output has JFIF and tables only)', () => {
    expect(hasExifMarker(jpeg(jfif, dqt))).toBe(false)
    expect(hasExifMarker(jpeg())).toBe(false)
  })
  it('does not mistake 0xFFE1 bytes inside the image data for a segment', () => {
    expect(hasExifMarker(new Uint8Array([0xff, 0xd8, ...jfif, 0xff, 0xda, 0x00, 0x02, 0xff, 0xe1, 0x00, 0x02, 0xff, 0xd9]))).toBe(false)
  })
  it('is false for something that is not a JPEG', () => {
    expect(hasExifMarker(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(hasExifMarker(new Uint8Array())).toBe(false)
  })
})

describe('fitWithin', () => {
  it('shrinks the longest side to 1600 and keeps the ratio', () => expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 }))
  it('works for portrait photos', () => expect(fitWithin(3000, 4000)).toEqual({ w: 1200, h: 1600 }))
  it('never enlarges', () => expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 }))
  it('zero or unknown size gives 0x0, not NaN', () => { expect(fitWithin(0, 100)).toEqual({ w: 0, h: 0 }); expect(fitWithin(NaN, 100)).toEqual({ w: 0, h: 0 }) })
})

// jsdom has no canvas, so the browser parts are stood in for. What is real here: the output is whatever the canvas encodes (pixels only),
// never the input bytes, and it is checked with the same marker scan as above. The e2e build has no sign-in, so the picker is not reachable there; a real-camera-photo check is left for the phone test.
describe('stripToJpeg', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = (opts: { w: number; h: number; ctx?: boolean; out?: 'jpeg' | 'png' | null }) => {
    const drawn: number[][] = []
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: opts.w, height: opts.h, close: vi.fn() })))
    const real = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return real(tag)
      return {
        width: 0, height: 0,
        getContext: () => (opts.ctx === false ? null : { drawImage: (...a: number[]) => drawn.push(a) }),
        toBlob(cb: (b: Blob | null) => void, type: string) {
          cb(opts.out === null ? null : new Blob([jpeg(jfif, dqt)], { type: opts.out === 'png' ? 'image/png' : type })) // a canvas encodes fresh pixels: JFIF + tables, no APP1
        }
      }
    }) as typeof document.createElement)
    return drawn
  }
  const withGps = () => new Blob([jpeg(jfif, exif, dqt)], { type: 'image/jpeg' })

  it('returns a new JPEG with no APP1 marker, from an input that had one', async () => {
    const input = withGps()
    expect(hasExifMarker(new Uint8Array(await input.arrayBuffer()))).toBe(true)
    stub({ w: 4000, h: 3000 })
    const out = await stripToJpeg(input)
    expect(out).not.toBe(input)
    expect(out!.type).toBe('image/jpeg')
    expect(hasExifMarker(new Uint8Array(await out!.arrayBuffer()))).toBe(false)
  })
  it('asks for the camera rotation to be applied and draws at most 1600 px', async () => {
    const drawn = stub({ w: 4000, h: 3000 })
    await stripToJpeg(withGps())
    expect((createImageBitmap as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ imageOrientation: 'from-image' })
    expect(drawn[0]!.slice(1)).toEqual([0, 0, 1600, 1200])
  })
  it('gives null for an unreadable file, no canvas context, or a non-JPEG result', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad') }))
    expect(await stripToJpeg(new Blob(['x']))).toBeNull()
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    stub({ w: 100, h: 100, ctx: false })
    expect(await stripToJpeg(new Blob(['x']))).toBeNull()
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    stub({ w: 100, h: 100, out: 'png' })
    expect(await stripToJpeg(new Blob(['x']))).toBeNull()
  })
})

describe('helpers', () => {
  it('shortDay', () => { expect(shortDay('2026-10-12')).toMatch(/12/); expect(shortDay(null)).toBeNull(); expect(shortDay('soon')).toBeNull() })
  it('isNotSetUp recognises a missing table or bucket, not other failures', () => {
    expect(isNotSetUp({ code: '42P01' })).toBe(true)
    expect(isNotSetUp({ code: 'PGRST205', message: "Could not find the table 'public.family_photos' in the schema cache" })).toBe(true)
    expect(isNotSetUp({ message: 'Bucket not found', statusCode: '404' })).toBe(true)
    expect(isNotSetUp({ code: '42501' })).toBe(false)
    expect(isNotSetUp(null)).toBe(false)
  })
})
