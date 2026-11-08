/** S25 (D-154): the offline Health library. topics.json is built by scripts/medlib/build.mjs and loads lazily (its own chunk, precached with the app). */

export type Body = 'heart' | 'lungs' | 'infections' | 'sugar' | 'kidneys' | 'mind' | 'bones' | 'children' | 'firstaid'
export interface MedTopic {
  id: string; title: string; aka: string[]; body: Body; ph?: boolean; season?: 'rainy' | 'dry' | null
  short: string[]; goNow: string[]; sections: { heading: string; text: string }[]
  videos: { id: string; title: string; source: string }[]
  links: { medlineplus?: string; wikipedia?: string; tagalog?: string }
  picture?: { file: string; credit: string; licence: string; href: string }
}
export interface MedLib { version: string; source: string; topics: MedTopic[] }

export const BODIES: { id: Body; label: string; hint: string }[] = [
  { id: 'heart', label: 'Heart', hint: 'Heart, blood pressure, blood' },
  { id: 'lungs', label: 'Lungs', hint: 'Breathing, cough' },
  { id: 'infections', label: 'Infections', hint: 'Germs, mosquito, gut' },
  { id: 'sugar', label: 'Sugar', hint: 'Diabetes, thyroid, weight' },
  { id: 'kidneys', label: 'Kidneys', hint: 'Kidney, bladder, tummy' },
  { id: 'mind', label: 'Mind', hint: 'Mood, sleep, brain' },
  { id: 'bones', label: 'Bones', hint: 'Joints, muscles, back' },
  { id: 'children', label: 'Children', hint: 'Babies, children, women' },
  { id: 'firstaid', label: 'First aid', hint: 'Bites, burns, choking' },
]
export const bodyLabel = (b: string) => BODIES.find((x) => x.id === b)?.label ?? b

let loading: Promise<MedLib> | null = null
/** The encyclopedia, loaded once. A failed load is not remembered, so the next call tries again. */
export function loadMedlib(): Promise<MedLib> {
  loading ??= import('../../../data/medlib/topics.json').then((m) => m.default as unknown as MedLib).catch((e) => { loading = null; throw e })
  return loading
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Titles and also-called words (Tagalog too). Every typed word must be found; a title that starts with the text ranks first. No match gives []. */
export function searchTopics(topics: MedTopic[], q: string): MedTopic[] {
  const text = norm(q)
  if (!text) return []
  const words = text.split(' ')
  const scored: [number, MedTopic][] = []
  for (const t of topics) {
    const title = norm(t.title)
    const aka = t.aka.map(norm)
    const hay = [title, ...aka].join(' | ')
    if (!words.every((w) => hay.includes(w))) continue
    let s = 1
    if (title === text || aka.includes(text)) s = 6
    else if (title.startsWith(text) || aka.some((a) => a.startsWith(text))) s = 4
    else if (title.includes(text) || aka.some((a) => a.includes(text))) s = 3
    scored.push([s, t])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title)).map((x) => x[1])
}

/** Rainy season is June to November in the Philippines (Asia/Manila month), the rest is dry. */
export function seasonNow(now: Date = new Date()): 'rainy' | 'dry' {
  const m = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'numeric' }).format(now))
  return m >= 6 && m <= 11 ? 'rainy' : 'dry'
}
export const inSeason = (t: MedTopic, now: Date = new Date()) => !!t.season && t.season === seasonNow(now)

/** Common in the Philippines, with the topics of this season first. */
export function commonInPh(topics: MedTopic[], now: Date = new Date()): MedTopic[] {
  return topics.filter((t) => t.ph).sort((a, b) => Number(inSeason(b, now)) - Number(inSeason(a, now)))
}

export const topicHref = (id: string) => `#health/library/${encodeURIComponent(`e:${id}`)}`
export const bodyHref = (b: Body) => `#health/library/${encodeURIComponent(`b:${b}`)}`
