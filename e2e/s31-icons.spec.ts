import { expect, test } from '@playwright/test'

// S31 L2: the built app serves its manifest, every manifest icon and the icon links in the page head.
test('manifest icons and head icon links all load (200)', async ({ page, request }) => {
  await page.goto('/')
  const links = await page.$$eval('link[rel="icon"], link[rel="apple-touch-icon"]', (ls) => ls.map((l) => (l as HTMLLinkElement).getAttribute('href') ?? ''))
  expect(links).toContain('/icon.svg')
  expect(links.some((h) => /apple-touch-icon-\d+\.png$/.test(h))).toBe(true)
  for (const h of links) expect((await request.get(h)).status(), h).toBe(200)

  const mHref = await page.$eval('link[rel="manifest"]', (l) => (l as HTMLLinkElement).getAttribute('href') ?? '')
  const mRes = await request.get(mHref)
  expect(mRes.status()).toBe(200)
  const icons = (await mRes.json()).icons as { src: string; sizes: string; type: string; purpose: string }[]
  expect(icons.map((i) => i.purpose)).toEqual(['any', 'any', 'any', 'maskable'])
  for (const i of icons) {
    const r = await request.get(new URL(i.src, page.url()).href)
    expect(r.status(), i.src).toBe(200)
    expect(r.headers()['content-type'], i.src).toContain(i.type === 'image/svg+xml' ? 'svg' : 'png')
  }
})
