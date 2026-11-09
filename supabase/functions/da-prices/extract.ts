// PDF bytes -> text items with position (str, x, y, page). Kept apart from prices.ts so the parser stays pure and testable in vitest.
// pdfjs 6.4.299 is the version the app already pins in package.json (dev); the legacy build runs under Deno without a worker or a canvas.
import { getDocument } from 'npm:pdfjs-dist@6.4.299/legacy/build/pdf.mjs'
import type { Item } from './prices.ts'

export async function extractItems(data: Uint8Array): Promise<Item[]> {
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 })
  const doc = await task.promise
  const out: Item[] = []
  for (let page = 1; page <= doc.numPages; page++) {
    const tc = await (await doc.getPage(page)).getTextContent()
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      if (typeof it.str === 'string' && it.str.trim() && it.transform) out.push({ str: it.str, x: Math.round(it.transform[4]! * 10) / 10, y: Math.round(it.transform[5]! * 10) / 10, page })
    }
  }
  await task.destroy()
  return out
}
