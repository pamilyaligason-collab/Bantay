const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Spring-like tab entrance via WAAPI. dir: +1 coming from the right, -1 from the left. No-op when reduced or unsupported. */
export function springIn(el: HTMLElement, dir: number) {
  if (reduced() || typeof el.animate !== 'function') return
  el.animate(
    [{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 360, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' }
  )
}
