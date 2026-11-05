import data from '../../data/calm/listen.json'
import type { RadioStation } from './useRadio'

/** Stations played in the app after a tap (useRadio). streams are tried in order; what was checked is in listen.json's _note. */
export const RADIO = data.radio as readonly RadioStation[]
/** Outside listening: opens the official site. */
export const MEDIA = data.links as readonly { kind: string; title: string; sub: string; href: string; icon: 'play' | 'moon' | 'mic' | 'radio' }[]
/** Checked videos (oEmbed), each played through LiteVideo after a tap. */
export const CALM_VIDEOS = data.videos
