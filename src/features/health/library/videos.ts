import data from '../../../data/videos.json'

/** The fixed playlist (src/data/videos.json). No search, no feed: only these. A placeholder entry never loads a player. */
export interface Video { id: string; placeholder: boolean; title: string; topic: string; source: string; minutes: number }
export const VIDEOS = data.videos as Video[]
export const TOPICS = ['All', ...new Set(VIDEOS.map((v) => v.topic))]
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export const playable = (v: Video) => !v.placeholder && VIDEO_ID.test(v.id)
/** The privacy-friendly embed address (no cookies until played). Only for a playable video. */
export const embedUrl = (v: Video) => (playable(v) ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1&autoplay=1` : null)
export const forTopic = (topic: string, list: Video[] = VIDEOS) => (topic === 'All' ? list : list.filter((v) => v.topic === topic))
