import {
  IconAlertTriangle, IconArrowLeft, IconBackpack, IconBell, IconBolt, IconBrain, IconCalendar, IconCamera, IconCheck, IconChevronLeft, IconChevronUp, IconChevronDown,
  IconChevronRight, IconClock, IconCloud, IconCloudFog, IconCloudRain, IconCloudStorm, IconCrop, IconDental, IconDots, IconDownload,
  IconDroplet, IconExternalLink, IconEye, IconFileText, IconFileTypePdf, IconFingerprint, IconFirstAidKit, IconFlask, IconGauge, IconGlassFull, IconHeartbeat,
  IconHome, IconInfoCircle, IconKey, IconLanguage, IconLungs, IconMap, IconMapPin, IconMedicalCross, IconMessage, IconMessageCircle, IconMicrophone,
  IconMoodSmile, IconPhone, IconPhoto, IconPill, IconPlayerPlay, IconPlus, IconFlood, IconRotateClockwise, IconScale, IconScan, IconSend,
  IconSettings, IconShieldCheck, IconSos, IconSun, IconTemperature, IconTornado, IconTrash, IconUpload, IconUsers, IconWalk, IconWifiOff,
  IconWind, IconX, IconStretching, IconToolsKitchen2, IconSalt, IconPlayerPause, IconSearch, IconMenu2, IconMoon, IconDeviceDesktop,
  IconFlame, IconBone, IconPaw, IconBug, IconCandy, IconVaccine, IconMoodSick, IconFall, IconHeartHandshake, IconLock,
  IconHomeFilled, IconMessageCircleFilled, IconShieldCheckFilled, IconBellFilled, IconPhoneFilled, IconSettingsFilled, IconMedicalCrossFilled,
  IconBoltFilled, IconPillFilled, IconCameraFilled, IconCalendarFilled, IconFlaskFilled, IconMessageFilled, IconMapPinFilled, IconAlertTriangleFilled,
  IconInfoCircleFilled, IconSunFilled, IconCloudFilled, IconDropletFilled, IconGaugeFilled, IconMoodSmileFilled, IconEyeFilled, IconClockFilled,
  IconSendFilled, IconKeyFilled, IconLungsFilled, IconTrashFilled, IconFileTextFilled, IconPhotoFilled
} from '@tabler/icons-react'
import type { ComponentType } from 'react'
import { IconKidney, IconStomach, IconQuake, IconTyphoon, type CustomIconProps } from './icons/custom'

// One icon family for the whole app: Tabler Icons (MIT, docs/ASSETS.md). Screens use <Icon name>, never Tabler directly,
// so the family can change in one place; colour is currentColor. D-103: sizes 16 (inline meta, ticks), 20 (row leading, chips, buttons), 24 (tiles, card titles, tab bar, default), 32 (alerts, SOS);
// stroke by size; line everywhere; a leading row icon is `boxed` (40 px chip, 20 px glyph); never a text glyph or emoji as an icon.
const ICONS = {
  home: IconHome, heart: IconHeartbeat, chat: IconMessageCircle, users: IconUsers, shield: IconShieldCheck, bell: IconBell,
  back: IconChevronLeft, chev: IconChevronRight, up: IconChevronUp, down: IconChevronDown, arrowLeft: IconArrowLeft, phone: IconPhone, gear: IconSettings, cross: IconMedicalCross,
  bolt: IconBolt, check: IconCheck, dl: IconDownload, pill: IconPill, camera: IconCamera, scan: IconScan, file: IconFileText,
  pdf: IconFileTypePdf, upload: IconUpload, photo: IconPhoto, crop: IconCrop, rotate: IconRotateClockwise, calendar: IconCalendar,
  flask: IconFlask, msg: IconMessage, pin: IconMapPin, map: IconMap, therm: IconTemperature, warn: IconAlertTriangle, info: IconInfoCircle,
  sun: IconSun, cloud: IconCloud, rain: IconCloudRain, storm: IconCloudStorm, fog: IconCloudFog, wind: IconWind, tornado: IconTornado,
  flood: IconFlood, drop: IconDroplet, scale: IconScale, gauge: IconGauge, walk: IconWalk, smile: IconMoodSmile, more: IconDots,
  out: IconExternalLink, off: IconWifiOff, clock: IconClock, fp: IconFingerprint, send: IconSend, mic: IconMicrophone, plus: IconPlus,
  close: IconX, trash: IconTrash, key: IconKey, sos: IconSos, aid: IconFirstAidKit, bag: IconBackpack, lungs: IconLungs, brain: IconBrain,
  eye: IconEye, search: IconSearch, menu: IconMenu2, moon: IconMoon, screen: IconDeviceDesktop, tooth: IconDental, play: IconPlayerPlay, pause: IconPlayerPause, move: IconStretching, meal: IconToolsKitchen2, salt: IconSalt, glass: IconGlassFull, kidney: IconKidney, stomach: IconStomach, quake: IconQuake, typhoon: IconTyphoon,
  flame: IconFlame, bone: IconBone, paw: IconPaw, bug: IconBug, candy: IconCandy, vaccine: IconVaccine, sick: IconMoodSick, fall: IconFall, cpr: IconHeartHandshake, lock: IconLock, language: IconLanguage
} satisfies Record<string, ComponentType<CustomIconProps>>
export type IconName = keyof typeof ICONS

// Tabler Filled twins for the active state (D-103: the active TAB only; pass `active` from tab bars, not for a listening mic or a play button, which have no twin on purpose). Names without one get +0.2 stroke instead.
const FILLED: Partial<Record<IconName, ComponentType<CustomIconProps>>> = {
  home: IconHomeFilled, chat: IconMessageCircleFilled, shield: IconShieldCheckFilled, bell: IconBellFilled, phone: IconPhoneFilled, gear: IconSettingsFilled,
  cross: IconMedicalCrossFilled, bolt: IconBoltFilled, pill: IconPillFilled, camera: IconCameraFilled, file: IconFileTextFilled, photo: IconPhotoFilled,
  calendar: IconCalendarFilled, flask: IconFlaskFilled, msg: IconMessageFilled, pin: IconMapPinFilled, warn: IconAlertTriangleFilled, info: IconInfoCircleFilled,
  sun: IconSunFilled, cloud: IconCloudFilled, drop: IconDropletFilled, gauge: IconGaugeFilled, smile: IconMoodSmileFilled, eye: IconEyeFilled, clock: IconClockFilled,
  send: IconSendFilled, key: IconKeyFilled, lungs: IconLungsFilled, trash: IconTrashFilled
}
export type IconTone = 'medicine' | 'vitals' | 'labs' | 'weather' | 'safety' | 'family' | 'alert'

// Optical sizing: the stroke thins as the glyph grows so the rendered line stays 1.4-2px. The four sizes are exact; anything between interpolates.
export const ICON_SIZES = [16, 20, 24, 32] as const
const STROKES: [number, number][] = [[16, 2.1], [20, 1.9], [24, 1.75], [32, 1.5]]
export function strokeFor(size: number) {
  if (size <= 16) return 2.1
  if (size >= 32) return 1.5
  const i = STROKES.findIndex(([s]) => s >= size)
  const [[s0, w0], [s1, w1]] = [STROKES[i - 1], STROKES[i]]
  return Math.round((w0 + ((w1 - w0) * (size - s0)) / (s1 - s0)) * 100) / 100
}

type Props = { name: IconName; size?: number; stroke?: number; tone?: IconTone; boxed?: boolean; active?: boolean; label?: string }
export function Icon({ name, size = 24, stroke, tone, boxed, active, label }: Props) {
  const F = active ? FILLED[name] : undefined
  const C = F ?? ICONS[name]
  const px = boxed ? 20 : size // a row chip always holds a 20 px glyph (D-103 rule 5)
  const w = stroke ?? strokeFor(px) + (active && !F ? 0.2 : 0)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  const svg = <C className={`sh-ic${F ? ' sh-ic-f' : ''}${tone && !boxed ? ' sh-t-' + tone : ''}`} size={px} stroke={w} focusable="false" {...a11y} />
  if (!boxed) return svg
  return <span className={`sh-icbox sh-t-${tone ?? 'neutral'}${active ? ' is-active' : ''}`} style={{ width: 40, height: 40, borderRadius: 13 }}>{svg}</span>
}
