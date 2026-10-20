// Icon paths from mockup v6 (<symbol id="i-...">), stroke style comes from .sh-ic in shell.css.
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM5 12h3l2-3 3 6 2-3h4',
  chat: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  users: 'M2.5 20a6.5 6.5 0 0 1 13 0M16 14.5a5 5 0 0 1 5.5 5M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.1 8 9 4.6-.9 8-4.5 8-9V6zM9 12l2 2 4-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  back: 'M15 6l-6 6 6 6',
  chev: 'M9 6l6 6-6 6',
  phone: 'M6 3h4l1.5 4-2 1.5a11 11 0 0 0 6 6L17 12.5l4 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1.2-1.5-2.6-2.3.6a7 7 0 0 0-1.6-.9L15 5.5h-3l-.6 2.4a7 7 0 0 0-1.6.9l-2.3-.6L5.9 10.8 8 12l-2 1.2 1.5 2.6 2.3-.6c.5.4 1 .7 1.6.9l.6 2.4h3l.6-2.4c.6-.2 1.1-.5 1.6-.9l2.3.6L21 13.2z',
  cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  dl: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  crop: 'M7 3v14h14M3 7h14v14',
  rotate: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
  photo: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
  file: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8.5 13h7M8.5 16.5h7',
  pdf: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8.5 17v-5h1.6a1.4 1.4 0 0 1 0 2.8H8.5',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6'
} as const
export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="sh-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={PATHS[name]} /></svg>
  )
}
