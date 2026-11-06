import './orb.css'

const TILT = [1, 0.73, 0.42, 0.13] // ry/rx of the latitude rings, as on the S22 Calm board
const OP = [1, 0.85, 0.7, 0.55]

/** Dotted particle sphere (S22-C): round-capped dots (stroke-dasharray '0 gap') on crossing ellipses, slowly rotating. Colour is currentColor; reduced motion stops the spin (CSS). */
export function DotSphere({ size, rings = 4 }: { size: number; rings?: 2 | 3 | 4 }) {
  const r = size * 0.46
  const gap = Math.max(5, size / 24)
  const sw = Math.max(1.8, size / 75)
  const rs = TILT.slice(0, rings)
  const e = (rx: number, ry: number, i: number, k: string) => <ellipse key={k} rx={rx} ry={ry} strokeWidth={sw * (1 - i * 0.08)} strokeDasharray={`0 ${gap}`} opacity={OP[i]} />
  return (
    <svg className="ds" viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width="100%" height="100%" aria-hidden="true" focusable="false">
      <g className="ds-spin" fill="none" stroke="currentColor" strokeLinecap="round">
        {rs.map((t, i) => e(r, r * t, i, `h${i}`))}
        {rs.slice(1).map((t, i) => e(r * t, r, i + 1, `v${i}`))}
      </g>
    </svg>
  )
}
