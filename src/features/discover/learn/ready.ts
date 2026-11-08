import data from '../../../data/discover/ready.json'
import { playable, type Video } from '../../health/library/videosLogic'

/** D-117 shelf (src/data/discover/ready.json): prepping, farming and DIY, listening and recipe videos, checked links only. Kept out of VIDEOS so Today and Health stay health-only. */
export interface Read { id: string; topic: string; title: string; source: string; url: string; checked: string }
/** Every shelf in ready.json; READY_TOPICS (the Learn topic tiles) is the two that also have reads and a page of their own. listen and recipes-video are Discover shelves only. */
export const READY_SHELVES = data.topics
export const READY_TOPICS = data.topics.filter((t) => t.id === 'prepping' || t.id === 'farm-diy')
export const READY_VIDEOS = data.videos as Video[]
export const READY_READS = data.reads as Read[]
/** S25 (D-155): health videos live in Health now (videos.json, by sub-topic); Discover's video cards and Watch draw from the D-117 shelf only. */
export const DISCOVER_VIDEOS: Video[] = READY_VIDEOS
export const topicCounts = (t: (typeof data.topics)[number]) => ({ videos: READY_VIDEOS.filter((v) => v.topic === t.video).length, reads: READY_READS.filter((r) => r.topic === t.id).length })
export const countLine = (t: (typeof data.topics)[number]) => { const c = topicCounts(t); return `${c.videos} videos · ${c.reads} reads` }
/** The checked videos of one ready.json shelf (by shelf id), through playable() like everywhere else they are shown. */
export const readyShelf = (id: string): Video[] => { const topic = READY_SHELVES.find((t) => t.id === id)?.video; return READY_VIDEOS.filter((v) => v.topic === topic && playable(v)) }
