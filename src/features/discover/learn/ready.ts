import data from '../../../data/discover/ready.json'
import { VIDEOS, type Video } from '../../health/library/videosLogic'

/** D-117 shelf (src/data/discover/ready.json): prepping and home repair, checked links only. Kept out of VIDEOS so Today and Health stay health-only. */
export interface Read { id: string; topic: string; title: string; source: string; url: string; checked: string }
export const READY_TOPICS = data.topics
export const READY_VIDEOS = data.videos as Video[]
export const READY_READS = data.reads as Read[]
/** The health list plus the D-117 videos: what Discover's hero, video cards and Watch draw from. */
export const DISCOVER_VIDEOS: Video[] = [...VIDEOS, ...READY_VIDEOS]
export const topicCounts = (t: (typeof data.topics)[number]) => ({ videos: READY_VIDEOS.filter((v) => v.topic === t.video).length, reads: READY_READS.filter((r) => r.topic === t.id).length })
export const countLine = (t: (typeof data.topics)[number]) => { const c = topicCounts(t); return `${c.videos} videos · ${c.reads} reads` }
