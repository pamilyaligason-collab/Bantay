/** D-64 video of the day: a small curated list, one per day, link-out only (nothing is embedded or downloaded).
 *  ponytail: these are YouTube search links on the official channel names, so they never go dead. Swap in exact video URLs when the family picks favourites. */
export interface Vid { title: string; source: string; url: string; note: string }

const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`

export const VIDEOS: Vid[] = [
  { title: 'Duck, cover and hold: what to do in an earthquake', source: 'PHIVOLCS', url: yt('PHIVOLCS duck cover and hold earthquake drill'), note: 'Ground shaking is a risk where you live' },
  { title: 'Reading a typhoon signal and what to do at each level', source: 'PAGASA', url: yt('PAGASA tropical cyclone wind signals explained'), note: 'Know the signals before the storm' },
  { title: 'Dengue: how to protect your family at home', source: 'DOH', url: yt('DOH Philippines dengue prevention 4S'), note: 'Rainy season is dengue season' },
  { title: 'Packing a go-bag for your family', source: 'Philippine Red Cross', url: yt('Philippine Red Cross emergency go bag'), note: 'Ready before you need it' },
  { title: 'First aid basics: bleeding, burns and choking', source: 'Philippine Red Cross', url: yt('Philippine Red Cross first aid basics'), note: 'Three minutes that could save a life' },
  { title: 'High blood pressure: simple habits that help', source: 'DOH', url: yt('DOH Philippines hypertension healthy lifestyle'), note: 'For everyone who logs blood pressure' },
  { title: 'Flood safety: before, during and after', source: 'PAGASA', url: yt('PAGASA flood safety tips'), note: 'Heavy rain can come fast' }
]

/** Same video all day, a new one each morning (local day number). */
export const videoOfTheDay = (d = new Date(), list = VIDEOS): Vid => {
  const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)
  return list[((day % list.length) + list.length) % list.length]!
}
