/** Session 16 M-1: Android's system text size (WebView textZoom, up to 200%) makes text bigger but keeps the viewport at ~390 px, so a
 *  `max-width: 300px` media query never fires on the phone. The real measure is the width in "100% text" pixels: viewport ÷ text scale.
 *  Under 300 of those, :root gets data-narrow and src/styles/narrow.css stacks the layouts (the e2e simulates this as a 195 px viewport). */
export const NARROW_PX = 300

/** Text scale from a rendered sample: ten monospace digits at 16px are 96 px wide at 100% (0.6 em per digit in common mono fonts). */
export const textScale = (sampleWidth: number) => (sampleWidth > 0 ? Math.max(1, sampleWidth / 96) : 1)
export const isNarrow = (viewport: number, scale: number) => viewport / scale <= NARROW_PX

function measure(): number {
  const s = document.createElement('span')
  s.textContent = '0000000000'
  s.setAttribute('aria-hidden', 'true')
  s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:16px monospace;letter-spacing:0;left:-9999px;top:0'
  document.body.appendChild(s)
  const w = s.getBoundingClientRect().width
  s.remove()
  return w
}

export function watchNarrow(): void {
  const set = () => document.documentElement.toggleAttribute('data-narrow', isNarrow(window.innerWidth, textScale(measure())))
  set()
  window.addEventListener('resize', set)
}
