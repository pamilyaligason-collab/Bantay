/** The summary as a picture to share. Drawn on a canvas on this phone; no server. Shared through the Web Share API when the browser can share files, else downloaded. */
export const IMG_W = 900
const PAD = 48
const LINE = 40

const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const out: string[] = []
  let cur = ''
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w
    if (cur && ctx.measureText(t).width > max) { out.push(cur); cur = w } else cur = t
  }
  if (cur) out.push(cur)
  return out.length ? out : ['']
}

/** PNG of the lines (first line is the title, a line ending the group heading is bold). null when this browser cannot draw a canvas. */
export async function renderSummaryImage(lines: string[]): Promise<Blob | null> {
  try {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) return null
    probe.font = '28px sans-serif'
    const rows = lines.flatMap((l, i) => (i === 0 ? [{ t: l, b: true, big: true }] : wrap(probe, l, IMG_W - 2 * PAD).map((t) => ({ t, b: /^(Home readings|Medicines now|Doses on time)/.test(l) || (i === 3), big: false }))))
    const canvas = document.createElement('canvas')
    canvas.width = IMG_W
    canvas.height = PAD * 2 + rows.length * LINE + 10
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#14201a'
    rows.forEach((r, n) => {
      ctx.font = `${r.b ? '700' : '400'} ${r.big ? 38 : 28}px sans-serif`
      ctx.fillText(r.t, PAD, PAD + 30 + n * LINE)
    })
    return await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'))
  } catch { return null }
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported'
/** Share the picture through the system sheet. 'unsupported' when files cannot be shared here (the caller offers a download). */
export async function shareSummary(blob: Blob, title: string, nav: Pick<Navigator, 'share' | 'canShare'> | Partial<Navigator> = navigator): Promise<ShareResult> {
  const file = new File([blob], 'visit-summary.png', { type: 'image/png' })
  const n = nav as Navigator
  if (typeof n.share !== 'function' || typeof n.canShare !== 'function' || !n.canShare({ files: [file] })) return 'unsupported'
  try { await n.share({ files: [file], title }); return 'shared' } catch (e) { return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported' }
}
