// Page cropping for the scan flow: a projective warp of the four corners the person dragged onto a flat rectangle, plus a
// simple "document" clean-up. Pure functions on pixel buffers (no canvas, no DOM) so they can be unit-tested.
export interface Pt { x: number; y: number }
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]
/** The part of ImageData these functions use, so tests can pass a plain object. */
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

export const MAX_EDGE = 2000
export const JPEG_QUALITY = 0.82
export const INSET = 0.06

/** The starting box: 6% in from each edge, in 0..1 coordinates of the photo. */
export const defaultQuad = (inset = INSET): Quad => [{ x: inset, y: inset }, { x: 1 - inset, y: inset }, { x: 1 - inset, y: 1 - inset }, { x: inset, y: 1 - inset }]
export const scaleQuad = (q: Quad, w: number, h: number): Quad => q.map((p) => ({ x: p.x * w, y: p.y * h })) as Quad

/** 3x3 matrix (row-major, last entry 1) that maps each `from` corner to the matching `to` corner. Solves the usual 8x8 system. */
export function homography(from: readonly Pt[], to: readonly Pt[]): number[] {
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!
    const { x: u, y: v } = to[i]!
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) { // Gauss-Jordan with partial pivoting
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r
    ;[a[c], a[p]] = [a[p]!, a[c]!]
    const d = a[c]![c]!
    if (Math.abs(d) < 1e-12) throw new Error('degenerate quad')
    for (let k = c; k < 9; k++) a[c]![k]! /= d
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = a[r]![c]!
      if (f) for (let k = c; k < 9; k++) a[r]![k]! -= f * a[c]![k]!
    }
  }
  return [...a.map((r) => r[8]!), 1]
}

export function applyH(h: readonly number[], x: number, y: number): Pt {
  const w = h[6]! * x + h[7]! * y + h[8]!
  return { x: (h[0]! * x + h[1]! * y + h[2]!) / w, y: (h[3]! * x + h[4]! * y + h[5]!) / w }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
/** Size of the flat page: the mean of the opposite edges, with the long side capped at `maxEdge`. */
export function outputSize(q: Quad, maxEdge = MAX_EDGE): { w: number; h: number } {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2
  const k = Math.min(1, maxEdge / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Is the quad a simple convex shape with some area? (Dragging a corner across the opposite one folds it.) */
export function convex(q: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(z) < 1e-9) return false
    if (sign && Math.sign(z) !== sign) return false
    sign = Math.sign(z)
  }
  return true
}

/**
 * Cut the quad (pixel coordinates in `src`, corners at pixel edges: the whole image is (0,0) (w,0) (w,h) (0,h)) out of `src` and flatten
 * it to outW x outH. Each output pixel is mapped back into the photo (inverse mapping) and sampled bilinearly.
 */
export function warpQuad(src: Pixels, quad: Quad, outW: number, outH: number): Pixels {
  const rect: Pt[] = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }]
  const h = homography(rect, quad)
  const out = new Uint8ClampedArray(outW * outH * 4)
  const { data, width: sw, height: sh } = src
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const p = applyH(h, u + 0.5, v + 0.5)
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1)
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1)
      const x0 = Math.floor(fx + 1e-9), y0 = Math.floor(fy + 1e-9)
      const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1)
      const tx = Math.max(fx - x0, 0), ty = Math.max(fy - y0, 0)
      const o = (v * outW + u) * 4
      for (let c = 0; c < 4; c++) {
        const top = data[(y0 * sw + x0) * 4 + c]! * (1 - tx) + data[(y0 * sw + x1) * 4 + c]! * tx
        const bot = data[(y1 * sw + x0) * 4 + c]! * (1 - tx) + data[(y1 * sw + x1) * 4 + c]! * tx
        out[o + c] = Math.round(top * (1 - ty) + bot * ty)
      }
    }
  }
  return { data: out, width: outW, height: outH }
}

export type Mode = 'document' | 'colour'
/** "Document": grey, then stretch so the paper is near white and the ink near black (the 1% and 99% levels set the ends). "Colour": unchanged. */
export function enhance(img: Pixels, mode: Mode): Pixels {
  if (mode === 'colour') return img
  const { data } = img
  const n = data.length / 4
  const grey = new Uint8ClampedArray(n)
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < n; i++) {
    const g = Math.round(0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!)
    grey[i] = g
    hist[g]!++
  }
  const at = (frac: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= frac * n) return v } return 255 }
  const lo = at(0.01)
  const hi = Math.max(at(0.99), lo + 1)
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < n; i++) {
    const g = Math.round(((grey[i]! - lo) / (hi - lo)) * 255)
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g
    out[i * 4 + 3] = 255
  }
  return { data: out, width: img.width, height: img.height }
}

/** The size to draw a photo at so its long side is at most `maxEdge`. */
export function fitEdge(w: number, h: number, maxEdge = MAX_EDGE): { w: number; h: number } {
  const k = Math.min(1, maxEdge / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}
