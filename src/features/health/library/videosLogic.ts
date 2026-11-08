import data from '../../../data/videos.json'

/** Health videos chip (S25): null means the clip belongs to Move or Watch only. */
export type VideoSub = 'heart-bp' | 'diabetes' | 'infections' | 'firstaid' | 'mind-sleep' | 'food' | 'kids'
/** The fixed playlist (src/data/videos.json). No search, no feed: only these. A placeholder entry never loads a player. minutes is null when not recorded. ph marks a Philippine source; healthOnly keeps it out of Discover. */
export interface Video { id: string; placeholder: boolean; title: string; topic: string; source: string; minutes: number | null; sub: VideoSub | null; ph?: boolean; healthOnly?: boolean }
export const VIDEOS = data.videos as Video[]
/** The clips Discover may show: S25 health clips (healthOnly) live on Health > Health videos only. */
export const DISCOVER_SET = VIDEOS.filter((v) => !v.healthOnly)
export const TOPICS = ['All', ...new Set(VIDEOS.map((v) => v.topic))]
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
export const SUBS: { sub: VideoSub; label: string }[] = [
  { sub: 'heart-bp', label: 'Heart and BP' }, { sub: 'diabetes', label: 'Diabetes' }, { sub: 'infections', label: 'Infections' }, { sub: 'firstaid', label: 'First aid' },
  { sub: 'mind-sleep', label: 'Mind and sleep' }, { sub: 'food', label: 'Food' }, { sub: 'kids', label: 'Kids' }
]

/** False when no entry is playable: the Videos entry points stay hidden until there is a real one. */
export const videosAvailable = () => VIDEOS.some((v) => playable(v))
export const playable = (v: Video) => !v.placeholder && VIDEO_ID.test(v.id)
export const forTopic = (topic: string, list: Video[] = VIDEOS) => (topic === 'All' ? list : list.filter((v) => v.topic === topic))
/** Health videos for one chip (null = every chip), playable only, Philippine sources first, the list's own order otherwise. */
export const forSub = (sub: VideoSub | null, list: Video[] = VIDEOS): Video[] => {
  const hit = list.filter((v) => playable(v) && v.sub != null && (sub === null || v.sub === sub))
  return [...hit.filter((v) => v.ph), ...hit.filter((v) => !v.ph)]
}
