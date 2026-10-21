/** Same item all day, a new one each morning (local day number). */
export const videoOfTheDay = <T,>(d: Date, list: T[]): T => {
  const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)
  return list[((day % list.length) + list.length) % list.length]!
}
