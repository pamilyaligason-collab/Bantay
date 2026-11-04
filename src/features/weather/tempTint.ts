// Cool-to-warm scale for the 10-day bars: five stops, tokens from tokens.css so light and dark both follow the theme.
const STOPS = ['--tint-blue-ink', '--tint-green-ink', '--tint-amber-ink', '--warn', '--tint-red-ink'] as const
const CUTS = [24, 28, 31, 33] as const // upper bound (C) of each of the first four stops

/** The css variable name for a temperature in C. */
export const tempTint = (t: number): (typeof STOPS)[number] => STOPS[CUTS.findIndex((c) => t <= c) < 0 ? 4 : CUTS.findIndex((c) => t <= c)]!
