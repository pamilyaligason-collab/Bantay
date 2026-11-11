// S31 L2: every app icon from assets/icon/*.svg. Run: npm run icons  (needs a Chromium: Playwright's, or PW_CHANNEL=chrome).
// Rasterises with the Playwright already in devDependencies, so no new dependency. Output is committed; rerunning must leave git clean.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..')
const src = (n) => fs.readFileSync(path.join(root, 'assets/icon', n), 'utf8')
const ver = fs.readFileSync(path.join(root, 'src/features/update/iconVersion.ts'), 'utf8')
const slug = ver.match(/ICON_VERSION = '([\d-]+)'/)[1].replace(/-/g, '')
const webIcons = [...ver.matchAll(/\{ name: '([\w-]+)', size: (\d+) \}/g)].map((m) => ({ name: m[1], size: Number(m[2]) }))
const CREAM = '#F6F1E7'
const res = path.join(root, 'android/app/src/main/res')
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const jobs = [] // { file, w, h, svg, radius (css), bg }
const job = (file, w, h, svg, radius = '0', bg = 'transparent') => jobs.push({ file, w, h, svg: src(svg), radius, bg })

for (const [d, k] of Object.entries(DPI)) {
  const legacy = 48 * k, adaptive = 108 * k
  job(`${res}/mipmap-${d}/ic_launcher.png`, legacy, legacy, 'icon.svg', '18%')
  job(`${res}/mipmap-${d}/ic_launcher_round.png`, legacy, legacy, 'icon.svg', '50%')
  job(`${res}/mipmap-${d}/ic_launcher_foreground.png`, adaptive, adaptive, 'foreground.svg')
  job(`${res}/mipmap-${d}/ic_launcher_monochrome.png`, adaptive, adaptive, 'monochrome.svg')
  job(`${res}/drawable-${d}/ic_stat_icon_config_sample.png`, 24 * k, 24 * k, 'notification.svg') // capacitor.config.ts LocalNotifications.smallIcon and the FCM manifest meta-data name this drawable
}
// Splash: cream ground with the mark in a rounded tile. Same pixel sizes the Capacitor template shipped.
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  job(`${res}/drawable-port-${d}/splash.png`, w, h, 'icon.svg', 'splash', CREAM)
  job(`${res}/drawable-land-${d}/splash.png`, h, w, 'icon.svg', 'splash', CREAM)
}
job(`${res}/drawable/splash.png`, 480, 320, 'icon.svg', 'splash', CREAM)
fs.mkdirSync(path.join(root, 'public/icons'), { recursive: true })
for (const f of fs.readdirSync(path.join(root, 'public/icons')).filter((f) => f.endsWith('.png'))) fs.rmSync(path.join(root, 'public/icons', f))
for (const { name, size } of webIcons) job(`${root}/public/icons/${name}-${slug}.png`, size, size, 'icon.svg') // full-bleed: maskable-safe, the OS rounds it

const css = (j) => {
  const tile = Math.round(Math.min(j.w, j.h) * 0.3)
  return j.radius === 'splash'
    ? `<div style="width:${j.w}px;height:${j.h}px;background:${j.bg};display:grid;place-items:center"><img id=i style="width:${tile}px;height:${tile}px;border-radius:22%" src="data:image/svg+xml;base64,${Buffer.from(j.svg).toString('base64')}"></div>`
    : `<div style="width:${j.w}px;height:${j.h}px;border-radius:${j.radius};overflow:hidden;background:${j.bg}"><img id=i style="width:100%;height:100%;display:block" src="data:image/svg+xml;base64,${Buffer.from(j.svg).toString('base64')}"></div>`
}
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined })
const page = await browser.newPage()
for (const j of jobs) {
  await page.setViewportSize({ width: j.w, height: j.h })
  await page.setContent(`<body style="margin:0;background:transparent">${css(j)}</body>`)
  await page.evaluate(() => document.getElementById('i').decode())
  fs.mkdirSync(path.dirname(j.file), { recursive: true })
  await page.screenshot({ path: j.file, omitBackground: true, clip: { x: 0, y: 0, width: j.w, height: j.h } })
}
await browser.close()

const write = (f, s) => fs.writeFileSync(f, s)
const adaptiveXml = () => `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n`
write(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, adaptiveXml())
write(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptiveXml())
const green = src('background.svg').match(/fill="(#[0-9A-Fa-f]{6})"/)[1]
write(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${green}</color>\n</resources>\n`)
fs.copyFileSync(path.join(root, 'assets/icon/icon.svg'), path.join(root, 'public/icon.svg')) // the web 'any' icon is the master
console.log(`icons: ${jobs.length} images, slug ${slug}`)
