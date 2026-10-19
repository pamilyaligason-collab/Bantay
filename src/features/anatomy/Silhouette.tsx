import { useId } from 'react'

/** Right half of a front-view body, 100 x 310 box, midline at x=50. The left half is this mirrored. */
export const HALF =
  'M50 2C57 2 63 8 63 18C63 26 60 32 56 36L56 44C56 47 64 48 71 50C78 52 82 58 83 66' + // head, neck, shoulder
  'C85 80 87 95 88 112C89 125 91 140 92 156C93 164 95 170 94 176C93 181 88 181 87 176' + // outer arm, hand
  'C86 168 84 150 83 136C82 120 80 100 77 82' + // inner arm up to the armpit
  'C75 100 71 112 70 124C70 136 75 144 75 154' + // waist, hip
  'C76 175 75 195 72 214C70 232 70 252 68 272C67 284 67 292 66 298C69 301 72 304 70 308' + // outer leg, foot
  'L53 308C52 304 55 301 56 298C57 280 57 250 56 232C55 212 53 180 51 160L50 158Z' // inner leg up to the crotch

export const MIRROR = 'matrix(-1 0 0 1 100 0)'

/** Soft, neutral front-view body. Fill only (no stroke) so the two halves join with no seam; depth comes from a vertical gradient and a CSS drop shadow. */
export function Silhouette() {
  const id = 'an' + useId().replace(/\W/g, '')
  return (
    <>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="310">
          <stop offset="0" style={{ stopColor: 'var(--an-body-a)' }} />
          <stop offset="1" style={{ stopColor: 'var(--an-body-b)' }} />
        </linearGradient>
      </defs>
      <g className="an-body" fill={`url(#${id})`}>
        <path d={HALF} />
        <path d={HALF} transform={MIRROR} />
      </g>
    </>
  )
}
