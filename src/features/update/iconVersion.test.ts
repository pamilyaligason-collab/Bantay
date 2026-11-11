import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ICON_VERSION, WEB_ICONS, iconSlug, iconUrl } from './iconVersion'

const RES = 'android/app/src/main/res'
const DPI: Record<string, number> = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const png = (p: string) => {
  expect(existsSync(p), p).toBe(true)
  const b = readFileSync(p)
  expect(b.subarray(1, 4).toString('latin1'), p + ' is a PNG').toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('S31 L2 generated icon set', () => {
  it('version and slug', () => {
    expect(ICON_VERSION).toBe('2026-11-11')
    expect(iconSlug()).toBe('20261111')
    expect(iconUrl('icon-192')).toBe('/icons/icon-192-20261111.png')
  })
  it('web icons exist at the right pixel size', () => {
    for (const { name, size } of WEB_ICONS) expect(png('public' + iconUrl(name)), name).toEqual([size, size])
  })
  it('android launcher, adaptive layers, themed icon and notification icon exist at every density', () => {
    for (const [d, k] of Object.entries(DPI)) {
      expect(png(`${RES}/mipmap-${d}/ic_launcher.png`)).toEqual([48 * k, 48 * k])
      expect(png(`${RES}/mipmap-${d}/ic_launcher_round.png`)).toEqual([48 * k, 48 * k])
      expect(png(`${RES}/mipmap-${d}/ic_launcher_foreground.png`)).toEqual([108 * k, 108 * k])
      expect(png(`${RES}/mipmap-${d}/ic_launcher_monochrome.png`)).toEqual([108 * k, 108 * k])
      expect(png(`${RES}/drawable-${d}/ic_stat_icon_config_sample.png`)).toEqual([24 * k, 24 * k])
    }
  })
  it('splash drawables keep the template sizes, portrait and landscape', () => {
    const S: Record<string, number[]> = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }
    for (const [d, [w, h]] of Object.entries(S)) {
      expect(png(`${RES}/drawable-port-${d}/splash.png`)).toEqual([w, h])
      expect(png(`${RES}/drawable-land-${d}/splash.png`)).toEqual([h, w])
    }
    expect(png(`${RES}/drawable/splash.png`)).toEqual([480, 320])
  })
  it('adaptive xml carries a monochrome layer and points at files that exist', () => {
    for (const f of ['ic_launcher', 'ic_launcher_round']) {
      const x = readFileSync(`${RES}/mipmap-anydpi-v26/${f}.xml`, 'utf8')
      expect(x).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>')
      expect(x).toContain('@mipmap/ic_launcher_foreground')
      expect(x).toContain('@color/ic_launcher_background')
    }
    expect(readFileSync(`${RES}/values/ic_launcher_background.xml`, 'utf8')).toContain('#1E6B4E')
  })
  it('index.html icon links and the manifest icons resolve to generated files', () => {
    const html = readFileSync('index.html', 'utf8')
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toContain('/icon.svg')
    expect(hrefs).toContain(iconUrl('apple-touch-icon'))
    for (const h of hrefs) expect(existsSync('public' + h), h).toBe(true)
    const cfg = readFileSync('vite.config.ts', 'utf8')
    for (const n of ['icon-192', 'icon-512', 'icon-maskable-512']) expect(cfg).toContain(`iconUrl('${n}')`)
    expect(cfg).toContain("src: 'icon.svg', sizes: 'any'")
  })
  it('notification small icon: local config names the generated drawable, push snippet points at it', () => {
    const cfg = readFileSync('capacitor.config.ts', 'utf8')
    const name = /smallIcon: '(\w+)'/.exec(cfg)![1]
    expect(cfg).toContain("iconColor: '#1E6B4E'")
    for (const d of Object.keys(DPI)) expect(existsSync(`${RES}/drawable-${d}/${name}.png`), d).toBe(true)
    const snip = readFileSync('docs/s31/manifest-icon-snippet.xml', 'utf8')
    expect(snip).toContain(`android:resource="@drawable/${name}"`)
    expect(snip).toContain('com.google.firebase.messaging.default_notification_icon')
  })
  it('public icon.svg is the master', () => {
    expect(readFileSync('public/icon.svg', 'utf8')).toBe(readFileSync('assets/icon/icon.svg', 'utf8'))
  })
})
