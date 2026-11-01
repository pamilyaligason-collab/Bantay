import type { LatLon } from './alerts'

/** Philippine Area of Responsibility, the published approximate ring as [lat, lon]. Not an official boundary. */
export const PAR: readonly (readonly [number, number])[] = [[5, 115], [15, 115], [21, 120], [25, 120], [25, 135], [5, 135]]

/** Ray-casting point-in-polygon on the PAR ring. */
export function inPar(p: LatLon): boolean {
  let inside = false
  for (let i = 0, j = PAR.length - 1; i < PAR.length; j = i++) {
    const [yi, xi] = PAR[i]!
    const [yj, xj] = PAR[j]!
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export interface Conn { type?: string; saveData?: boolean }
/** Pause the Windy layer on mobile data. `pref === false` turns the pause off; wifi and an unknown connection never pause. */
export const pauseOnData = (conn: Conn | null | undefined, pref: boolean): boolean => pref !== false && (conn?.type === 'cellular' || conn?.saveData === true)
