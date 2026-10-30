/** Jack Jack sticker art (D-91, D-103). Files live in src/assets/jack as jack-<name>-<px>.webp (256 for the 56 slot, 384 for 96 and 112; head also 128; 1024 kept for print).
 *  Never place him on SOS, an emergency result or a diagnosis screen. */
// shortcut: only the 128/256/384 files ship (precached for offline); the 1024s stay in src/assets/jack for print or the mockup
const FILES = import.meta.glob<string>('../../assets/jack/*-{128,256,384}.webp', { eager: true, query: '?url', import: 'default' })

export const JACK_ALT = {
  hello: 'Jack Jack waving hello',
  head: 'Jack Jack',
  'well-done': 'Jack Jack sitting proudly',
  thinking: 'Jack Jack tilting his head, thinking',
  reading: 'Jack Jack reading a book',
  listening: 'Jack Jack sitting with one paw raised, listening',
  watching: 'Jack Jack watching a laptop',
  playing: 'Jack Jack playing with a ball',
  walking: 'Jack Jack trotting in a harness on a leash',
  'drink-water': 'Jack Jack drinking from a water bowl',
  sleepy: 'Jack Jack asleep on a cushion',
  'family-hug': 'Jack Jack hugged by a smiling family',
  medicine: 'Jack Jack beside a first-aid box and a medicine bottle',
  cooking: 'Jack Jack in an apron beside a pot of soup',
  'ready-for-rain': 'Jack Jack in a raincoat with an umbrella',
  celebrate: 'Jack Jack jumping for joy',
  offline: 'Jack Jack beside a no-signal Wi-Fi icon',
  'empty-list': 'Jack Jack holding an empty checklist',
  'get-help': 'Jack Jack wearing a headset, ready to help',
} as const

export type JackName = keyof typeof JACK_ALT

export const jackSrc = (name: JackName, px: 128 | 256 | 384): string | undefined => FILES[`../../assets/jack/jack-${name}-${px}.webp`]

/** The only three sizes Jack is drawn at: 56 (action box, row), 96 (hero, success), 112 (onboarding). Anything else snaps to the nearest. */
export const JACK_SIZES = [56, 96, 112] as const
export type JackSize = (typeof JACK_SIZES)[number]
export const clampJack = (n: number): JackSize => (n <= 76 ? 56 : n <= 104 ? 96 : 112)

/** A fixed-size box (no layout shift), lazy-loaded. `decorative` when text beside it already says the same thing. */
export function JackArt({ name, size = 96, decorative = false, className }: { name: JackName; size?: number; decorative?: boolean; className?: string }) {
  const px = clampJack(size)
  const small = px === 56 ? (name === 'head' ? jackSrc(name, 128) : jackSrc(name, 256)) : jackSrc(name, 384) ?? jackSrc(name, 256)
  if (!small) return null
  return (
    <img
      className={className ? `jack ${className}` : 'jack'}
      src={small}
      width={px}
      height={px}
      style={{ objectFit: 'contain' }}
      loading="lazy"
      decoding="async"
      alt={decorative ? '' : JACK_ALT[name]}
      aria-hidden={decorative || undefined}
    />
  )
}
