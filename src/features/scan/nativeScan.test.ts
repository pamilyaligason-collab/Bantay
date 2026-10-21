import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ native: false, plugin: false }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => cap.native,
    isPluginAvailable: (n: string) => n === 'DocumentScanner' && cap.plugin,
    convertFileSrc: (u: string) => `http://localhost/_file_${u}`
  }
}))
const scanDocument = vi.hoisted(() => vi.fn())
vi.mock('@capacitor-mlkit/document-scanner', () => ({ DocumentScanner: { scanDocument } }))
import { scannerKind, scanNative } from './nativeScan'

beforeEach(() => { cap.native = false; cap.plugin = false; scanDocument.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('scannerKind', () => {
  it('is web in a browser', () => expect(scannerKind()).toBe('web'))
  it('is web in the app when the plugin is missing (an older APK)', () => { cap.native = true; expect(scannerKind()).toBe('web') })
  it('is web when the plugin exists but this is not the app', () => { cap.plugin = true; expect(scannerKind()).toBe('web') })
  it('is native in the app with the plugin', () => { cap.native = true; cap.plugin = true; expect(scannerKind()).toBe('native') })
})

describe('scanNative', () => {
  it('asks for JPEG pages and turns the file URIs into Blobs in order', async () => {
    scanDocument.mockResolvedValue({ scannedImages: ['file:///a.jpg', 'file:///b.jpg'] })
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { fetched.push(u); return { blob: async () => new Blob([u], { type: 'image/jpeg' }) } }))
    const out = await scanNative()
    expect(scanDocument).toHaveBeenCalledWith(expect.objectContaining({ resultFormats: 'JPEG', scannerMode: 'FULL', pageLimit: 10 }))
    expect(fetched).toEqual(['http://localhost/_file_file:///a.jpg', 'http://localhost/_file_file:///b.jpg'])
    expect(out.map((b) => b.type)).toEqual(['image/jpeg', 'image/jpeg'])
  })
  it('returns no pages when the person closes the scanner', async () => {
    scanDocument.mockRejectedValue(new Error('scan canceled.'))
    expect(await scanNative()).toEqual([])
  })
  it('rethrows other failures', async () => {
    scanDocument.mockRejectedValue(new Error('UNSUPPORTED'))
    await expect(scanNative()).rejects.toThrow('UNSUPPORTED')
  })
})
