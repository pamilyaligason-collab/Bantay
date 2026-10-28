/** Jack Jack sticker art (D-91). Files live in src/assets/jack as jack-<name>-<px>.webp (1024 and 256; head also 128).
 *  Never place him on SOS, an emergency result or a diagnosis screen. */
const FILES = import.meta.glob<string>('../../assets/jack/*.webp', { eager: true, query: '?url', import: 'default' })

export const JACK_ALT = {
  hello: 'Jack Jack waving hello',
  head: 'Jack Jack',
  'well-done': 'Jack Jack sitting proudly beside a check mark',
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

export const jackSrc = (name: JackName, px: 128 | 256 | 1024): string | undefined => FILES[`../../assets/jack/jack-${name}-${px}.webp`]

/** A fixed-size box (no layout shift), lazy-loaded. `decorative` when text beside it already says the same thing. */
export function JackArt({ name, size = 96, decorative = false, className }: { name: JackName; size?: number; decorative?: boolean; className?: string }) {
  const small = name === 'head' && size <= 64 ? jackSrc(name, 128) : jackSrc(name, 256)
  const big = jackSrc(name, 1024)
  if (!small) return null
  return (
    <img
      className={className ? `jack ${className}` : 'jack'}
      src={small}
      srcSet={big && size > 128 ? `${small} 256w, ${big} 1024w` : undefined}
      sizes={big && size > 128 ? `${size}px` : undefined}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      alt={decorative ? '' : JACK_ALT[name]}
      aria-hidden={decorative || undefined}
    />
  )
}
