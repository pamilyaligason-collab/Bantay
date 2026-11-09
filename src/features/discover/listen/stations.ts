/** Live radio (S26 D-166): five Manila stations with a checked HTTPS stream (probe 2026-11-09). Colours are from the S26Listen board; white text on every stop is >= 4.5:1. */
export type Station = { id: string; freq: string; name: string; sub: string; url: string; grad: [string, string, string]; ink: string; secs: number }

export const STATIONS: Station[] = [
  { id: 'love', freq: 'FM 90.7 · MANILA', name: 'Love Radio', sub: 'Pop and love songs', url: 'https://azura.loveradio.com.ph/listen/love_radio_manila/radio.mp3', grad: ['#C92A2A', '#A61E4D', '#B8460B'], ink: '#C2255C', secs: 14 },
  { id: 'easyrock', freq: 'FM 96.3 · MANILA', name: 'Easy Rock', sub: 'Easy listening', url: 'https://azura.easyrock.com.ph/listen/easy_rock_manila/radio.mp3', grad: ['#0B7285', '#087F5B', '#0A6B7A'], ink: '#0B7285', secs: 18 },
  { id: 'dzrh', freq: 'AM 666', name: 'DZRH', sub: 'News and talk', url: 'https://azura.dzrh.com.ph/listen/dzrh_manila/radio.mp3', grad: ['#A61E4D', '#5F3DC4', '#C92A2A'], ink: '#A61E4D', secs: 16 },
  { id: 'home', freq: 'FM 97.9 · MANILA', name: 'Home Radio', sub: 'Classic and OPM', url: 'https://hrmanila.radioca.st/stream', grad: ['#6741D9', '#3B5BDB', '#9C36B5'], ink: '#6741D9', secs: 20 },
  { id: 'magic', freq: 'FM 89.9 · MANILA', name: 'Magic 89.9', sub: 'Pop and talk', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LIN_MAGIC899AAC_SC', grad: ['#1C3FAA', '#1971C2', '#364FC7'], ink: '#1C3FAA', secs: 17 }
]
