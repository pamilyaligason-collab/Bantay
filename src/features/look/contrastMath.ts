import tokens from '../../styles/tokens.css?raw'
export type RGB = [number, number, number]
export type Theme = 'light' | 'dark'
const block = (css: string, selector: string, from = 0) => { const at = css.indexOf(selector + ' {', from); if (at < 0) throw new Error(`no block ${selector}`); return css.slice(at + selector.length + 2).split('}')[0]! }
export const varsOf = (css: string, selector: string, from = 0): Record<string, string> => Object.fromEntries([...block(css, selector, from).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
export const DARK_SEL = ':root[data-theme="dark"]'
export const MEDIA_SEL = ':root:not([data-theme="light"])'
/** Every token of a theme from tokens.css, var() aliases resolved. */
export function tokensOf(theme: Theme, css = tokens): Record<string, string> {
  const v = theme === 'light' ? varsOf(css, ':root') : varsOf(css, DARK_SEL)
  const out: Record<string, string> = {}
  for (const k of Object.keys(v)) { let val = v[k]!; for (let n = 0; n < 4 && val.startsWith('var('); n++) val = v[val.slice(4, -1)] ?? val; out[k] = val }
  return out
}
export const parse = (c: string): [RGB, number] => {
  if (c.startsWith('#')) return [[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB, 1]
  const n = c.match(/[\d.]+/g)!.map(Number); return [[n[0]!, n[1]!, n[2]!], n[3] ?? 1]
}
export const over = (fg: [RGB, number], bg: RGB): RGB => fg[0].map((v, i) => v * fg[1] + bg[i]! * (1 - fg[1])) as RGB
export const lum = (c: RGB) => { const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
export const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }
/** ratio of two tokens (fg may be rgba: composited over bg). */
export const pair = (t: Record<string, string>, fg: string, bg: string) => ratio(over(parse(t[fg]!), parse(t[bg]!)[0]), parse(t[bg]!)[0])
