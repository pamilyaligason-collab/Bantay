/** Memories (opt-in family photos), pure and browser-image helpers. No storage, no network. */
export const MAX_SIDE = 1600
export const CAPTION_MAX = 140

/** Size that fits inside max x max, never enlarging. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 }
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** True when a JPEG carries any APP1 segment (0xFFE1): Exif (camera, time, GPS) or XMP. Walks the marker segments up to the image data. */
export function hasExifMarker(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return false
    const m = bytes[i + 1]!
    if (m === 0xe1) return true
    if (m === 0xda || m === 0xd9) return false // start of scan: no more metadata segments
    if (m === 0xff) { i++; continue } // fill byte
    i += 2 + ((bytes[i + 2]! << 8) | bytes[i + 3]!)
  }
  return false
}

/** Re-encodes a picture through a canvas as a fresh JPEG (longest side 1600 px). A canvas carries pixels only, so Exif, GPS, camera and XMP never reach the output.
 *  createImageBitmap applies the camera's rotation before the metadata is gone. Null when the file is not a readable picture. */
export async function stripToJpeg(file: Blob, max = MAX_SIDE): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { w, h } = fitWithin(bmp.width, bmp.height, max)
    if (!w) { bmp.close?.(); return null }
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) { bmp.close?.(); return null }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    return out && out.type === 'image/jpeg' ? out : null
  } catch { return null }
}

/** Newest first for the grid: the day it was taken (else the day it was added), then the time it was added. */
export function newestFirst<T extends { takenOn: string | null; createdAt: string }>(list: T[]): T[] {
  const day = (p: T) => (p.takenOn ?? p.createdAt).slice(0, 10)
  return [...list].sort((a, b) => day(b).localeCompare(day(a)) || b.createdAt.localeCompare(a.createdAt))
}

/** True when this phone's browser can share a picture file (Web Share API with files). No new dependency; where it cannot, the Share button is not shown. */
export function canShareFiles(): boolean {
  try { return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'a.jpg', { type: 'image/jpeg' })] }) } catch { return false }
}

/** One tap share: the picture goes to the phone's share sheet as a file (not as a link: a signed link expires). 'cancelled' when the person closed the sheet. Never logs the caption. */
export async function sharePhoto(url: string, caption: string | null): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const blob = await (await fetch(url)).blob()
    await navigator.share({ files: [new File([blob], 'family-photo.jpg', { type: blob.type || 'image/jpeg' })], ...(caption ? { text: caption } : {}) })
    return 'shared'
  } catch (e) { return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed' }
}

/** "12 Oct" from a yyyy-mm-dd or ISO date, or null when there is none. */
export function shortDay(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/** The error codes that mean "the table or bucket is not there yet" (0023 not applied): undefined table, schema cache miss, missing bucket. */
export function isNotSetUp(e: { code?: string; message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!e) return false
  const code = String(e.code ?? '')
  const status = String(e.statusCode ?? '')
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST200' || status === '404' || /bucket not found|does not exist|schema cache/i.test(e.message ?? '')
}
