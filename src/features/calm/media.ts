/** Outside listening, opened on the official site (no in-app player, no stream URLs kept here). */
export const MEDIA = [
  { kind: 'Radio', title: 'SomaFM Groove Salad', sub: 'Chill beats · listener-supported', href: 'https://somafm.com/groovesalad/', icon: 'play' },
  { kind: 'Radio', title: 'SomaFM Drone Zone', sub: 'Ambient · good for sleep', href: 'https://somafm.com/dronezone/', icon: 'moon' },
  { kind: 'Podcast', title: 'Tara Brach', sub: 'Meditation talks · new one weekly', href: 'https://www.tarabrach.com/podcasts/', icon: 'mic' }
] as const
/** NHS inform, "Steps for Stress: a breathing exercise" (src/data/videos.json). */
export const CALM_VIDEO_ID = 'IYTZwBzjNC0'
