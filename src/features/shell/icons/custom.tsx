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
export const IconQuake = make([
  'M3 8h3l2.5-5 3 8 2.5-6 1.5 3H21',
  'M3 16.5h6.5l1.5 4.5',
  'M13.5 19.5H21'
])
export const IconTyphoon = make([
  'M12 10.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  'M13.7 11C14.5 6.5 10 3 4.5 5.5',
  'M10.3 13c-.8 4.5 3.7 8 9.2 5.5'
])
