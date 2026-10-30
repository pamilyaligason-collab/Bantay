/** Check mark that draws itself (C-10). L0 stub: a static tick, `onDone` is not called; L9 replaces the body with the GSAP draw. */
export function CheckDraw({ size = 56 }: { size?: number; onDone?: () => void }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <circle cx="28" cy="28" r="26" fill="none" stroke="var(--green2)" strokeWidth="3" />
      <path d="M16 29l8 8 16-17" fill="none" stroke="var(--green2)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
