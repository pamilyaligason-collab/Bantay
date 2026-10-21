import data from '../../../data/videos.json'

/** The fixed playlist (src/data/videos.json). No search, no feed: only these. A placeholder entry never loads a player. minutes is null when not recorded. */
export interface Video { id: string; placeholder: boolean; title: string; topic: string; source: string; minutes: number | null }
export const VIDEOS = data.videos as Video[]
export const TOPICS = ['All', ...new Set(VIDEOS.map((v) => v.topic))]
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** False when no entry is playable: the Videos entry points stay hidden until there is a real one. */
export const videosAvailable = () => VIDEOS.some((v) => playable(v))
export const playable = (v: Video) => !v.placeholder && VIDEO_ID.test(v.id)
export const forTopic = (topic: string, list: Video[] = VIDEOS) => (topic === 'All' ? list : list.filter((v) => v.topic === topic))
