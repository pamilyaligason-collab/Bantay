// Browser side of the scan: decode a photo, rotate it, flatten the chosen corners and write a JPEG. The maths is in crop.ts.
import { enhance, fitEdge, JPEG_QUALITY, outputSize, scaleQuad, warpQuad, type Mode, type Quad } from './crop'

export const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no jpeg'))), 'image/jpeg', JPEG_QUALITY))

/** A photo as a canvas whose long side is at most 2000 px. Camera orientation is applied. Throws when the browser cannot open it. */
export async function decodePhoto(file: Blob): Promise<HTMLCanvasElement> {
  let src: CanvasImageSource & { width: number; height: number }
  let done: () => void = () => {}
  if (typeof createImageBitmap === 'function') {
    let bmp: ImageBitmap
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { bmp = await createImageBitmap(file) }
    src = bmp
    done = () => bmp.close()
  } else {
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('decode')); img.src = url })
    URL.revokeObjectURL(url)
    src = img
  }
  const { w, h } = fitEdge(src.width, src.height)
  const c = canvasOf(w, h)
  c.getContext('2d')!.drawImage(src, 0, 0, w, h)
  done()
  return c
}

/** A quarter turn clockwise. */
export function rotateCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = canvasOf(c.height, c.width)
  const g = o.getContext('2d')!
  g.translate(c.height, 0)
  g.rotate(Math.PI / 2)
  g.drawImage(c, 0, 0)
  return o
}

/** Flatten `quad` (0..1 coordinates of `src`) to a page, clean it up, and return it as a JPEG at quality 0.82. */
export async function cropToJpeg(src: HTMLCanvasElement, quad: Quad, mode: Mode): Promise<Blob> {
  const g = src.getContext('2d')!
  const q = scaleQuad(quad, src.width, src.height)
  const { w, h } = outputSize(q)
  const flat = enhance(warpQuad(g.getImageData(0, 0, src.width, src.height), q, w, h), mode)
  const out = canvasOf(w, h)
  out.getContext('2d')!.putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  return toBlob(out)
}
