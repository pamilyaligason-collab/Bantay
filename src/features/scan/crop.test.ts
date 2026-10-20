import { describe, expect, it } from 'vitest'
import { applyH, convex, defaultQuad, enhance, fitEdge, homography, outputSize, scaleQuad, warpQuad, type Pixels, type Pt, type Quad } from './crop'

// Plain pixel buffers: no canvas needed. Synthetic gradients only.
const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4)
  return { data, width: w, height: h }
}
const grad = (w: number, h: number) => make(w, h, (x, y) => [(x * 7) % 256, (y * 13) % 256, (x * y) % 256])

describe('homography', () => {
  it('maps each of the four corners exactly onto its target', () => {
    const from: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }]
    const to: Pt[] = [{ x: 12, y: 9 }, { x: 88, y: 20 }, { x: 95, y: 170 }, { x: 5, y: 190 }]
    const h = homography(from, to)
    from.forEach((p, i) => {
      const r = applyH(h, p.x, p.y)
      expect(r.x).toBeCloseTo(to[i]!.x, 9)
      expect(r.y).toBeCloseTo(to[i]!.y, 9)
    })
  })
  it('is the identity for identical corners', () => {
    const q = defaultQuad()
    const h = homography(q, q)
    expect(applyH(h, 0.3, 0.4).x).toBeCloseTo(0.3, 9)
    expect(applyH(h, 0.3, 0.4).y).toBeCloseTo(0.4, 9)
  })
  it('refuses corners on one line', () => {
    const flat: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]
    expect(() => homography(flat, defaultQuad())).toThrow()
  })
})

describe('warpQuad', () => {
  it('returns the same pixels for the full-image quad at the same size', () => {
    const src = grad(17, 11)
    const q: Quad = [{ x: 0, y: 0 }, { x: 17, y: 0 }, { x: 17, y: 11 }, { x: 0, y: 11 }]
    const out = warpQuad(src, q, 17, 11)
    expect(out.width).toBe(17)
    expect(out.height).toBe(11)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
  })
  it('gives the requested output size and cuts out an axis-aligned box', () => {
    const src = make(40, 40, (x, y) => [x * 6, y * 6, 0])
    const q: Quad = [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }]
    const out = warpQuad(src, q, 20, 20)
    expect([out.width, out.height]).toEqual([20, 20])
    expect(out.data.length).toBe(20 * 20 * 4)
    // a 1:1 crop of a 20x20 box at (10,10): output (0,0) is source (10,10)
    expect(Array.from(out.data.slice(0, 3))).toEqual([60, 60, 0])
    const last = (19 * 20 + 19) * 4
    expect(Array.from(out.data.slice(last, last + 3))).toEqual([29 * 6, 29 * 6, 0])
  })
  it('flattens a skewed quad: a light page on a dark table comes out light', () => {
    const q: Quad = [{ x: 20, y: 10 }, { x: 80, y: 18 }, { x: 74, y: 85 }, { x: 12, y: 70 }]
    const inside = (x: number, y: number) => {
      const s = q.map((p, i) => { const n = q[(i + 1) % 4]!; return (n.x - p.x) * (y - p.y) - (n.y - p.y) * (x - p.x) })
      return s.every((v) => v >= 0) || s.every((v) => v <= 0)
    }
    const src = make(100, 100, (x, y) => (inside(x + 0.5, y + 0.5) ? [240, 240, 240] : [20, 20, 20]))
    const out = warpQuad(src, q, 40, 60)
    let dark = 0
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i]! < 200) dark++
    expect(dark / (40 * 60)).toBeLessThan(0.1) // only the antialiased rim may be darker
  })
})

describe('sizes and shape', () => {
  it('outputSize averages opposite edges and caps the long side', () => {
    expect(outputSize([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }])).toEqual({ w: 300, h: 400 })
    expect(outputSize([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 0, y: 2000 }])).toEqual({ w: 2000, h: 1000 })
  })
  it('fitEdge keeps small photos and shrinks big ones', () => {
    expect(fitEdge(800, 600)).toEqual({ w: 800, h: 600 })
    expect(fitEdge(4000, 3000)).toEqual({ w: 2000, h: 1500 })
  })
  it('default quad is inset 6% and scales to pixels', () => {
    const q = scaleQuad(defaultQuad(), 1000, 500)
    expect(q[0].x).toBeCloseTo(60)
    expect(q[0].y).toBeCloseTo(30)
    expect(q[2].x).toBeCloseTo(940)
    expect(convex(defaultQuad())).toBe(true)
  })
  it('convex is false when corners cross over', () => {
    const q = defaultQuad()
    expect(convex([q[1], q[0], q[2], q[3]])).toBe(false)
  })
})

describe('enhance', () => {
  it('document mode makes grey pixels with paper near white and ink near black', () => {
    const img = make(10, 10, (x) => (x < 2 ? [60, 60, 70] : [180, 180, 170]))
    const out = enhance(img, 'document')
    expect(out.data[0]).toBe(0)
    expect(out.data[(5 * 10 + 5) * 4]).toBe(255)
    expect(out.data[0]).toBe(out.data[1])
  })
  it('colour mode leaves the pixels alone', () => {
    const img = grad(5, 5)
    expect(enhance(img, 'colour')).toBe(img)
  })
})
