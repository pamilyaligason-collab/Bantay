import { useEffect, useRef, type KeyboardEvent } from 'react'

/** Modal behaviour for a role="dialog" box: focus moves in, Tab stays inside, Escape closes, focus goes back to the opener. */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = ref.current
    ;(box?.querySelector<HTMLElement>('[data-autofocus]') ?? box?.querySelector<HTMLElement>('button, select, input:not([type=file])'))?.focus()
    return () => opener?.focus?.()
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); return onClose() }
    if (e.key !== 'Tab' || !ref.current) return
    const els = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), select, input:not([type=file]), a[href]')]
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }
  return { ref, onKeyDown }
}
