import type { SVGProps } from 'react'

// Hand-drawn in Tabler's grammar (24 grid, 2px safe padding, stroke currentColor, round caps and joins, no fills). Own work, docs/ASSETS.md.
export type CustomIconProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & { size?: number | string; stroke?: number | string }

const make = (d: string[]) => function CustomIcon({ size = 24, stroke = 2, ...p }: CustomIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...p}>
      {d.map((x) => <path key={x} d={x} />)}
    </svg>
  )
}

export const IconKidney = make([
  'M9.5 5.5C11 3.5 15 3 17.5 5.5c3 3 3 10 0 13-2.5 2.5-6.5 2-8-.5-1-1.5-.5-3.5 1-5 1-1 1-2 0-3-1.5-1.5-2.5-3.5-1-5z',
  'M10.5 12.5C8 12.5 6 14.5 5 17.5'
])
export const IconStomach = make([
  'M10 6C5.5 6 3 10 3.5 14.5 4 19 8 21 12 21c4.5 0 8.5-2 8.5-5.5v-3.5a2 2 0 0 0-4 0V15c0 1.5-1.3 2-2.7 2-2.3 0-3.8-2-3.8-5V3'
])
// A house with a crack and shake marks (a zigzag alone reads as a heart trace).
export const IconQuake = make([
  'M6 20v-8.5l6-5 6 5V20z',
  'M12.5 8.5 11 12l2 1.5-1.5 3.5',
  'M3 11v4',
  'M21 11v4'
])
// The weather-map tropical cyclone symbol: an eye with two opposite hooked arms.
export const IconTyphoon = make([
  'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  'M14.5 12c0-5 2-8 5.5-9',
  'M9.5 12c0 5-2 8-5.5 9'
])
