import {
  IconAlertTriangle, IconArrowLeft, IconBackpack, IconBell, IconBolt, IconBrain, IconCalendar, IconCamera, IconCheck, IconChevronLeft,
  IconChevronRight, IconClock, IconCloud, IconCloudFog, IconCloudRain, IconCloudStorm, IconCrop, IconDental, IconDots, IconDownload,
  IconDroplet, IconExternalLink, IconEye, IconFileText, IconFileTypePdf, IconFingerprint, IconFirstAidKit, IconFlask, IconGauge, IconHeartbeat,
  IconHome, IconInfoCircle, IconKey, IconLungs, IconMap, IconMapPin, IconMedicalCross, IconMessage, IconMessageCircle, IconMicrophone,
  IconMoodSmile, IconPhone, IconPhoto, IconPill, IconPlayerPlay, IconPlus, IconRipple, IconRotateClockwise, IconScale, IconScan, IconSend,
  IconSettings, IconShieldCheck, IconSos, IconSun, IconTemperature, IconTornado, IconTrash, IconUpload, IconUsers, IconWalk, IconWifiOff,
  IconWind, IconX, type Icon as TablerIcon
} from '@tabler/icons-react'

// One icon family for the whole app: Tabler Icons (MIT, docs/ASSETS.md). Screens use <Icon name>, never Tabler directly,
// so the family can change in one place. Stroke 1.8 matches the mockup sprite; colour is currentColor.
const ICONS = {
  home: IconHome, heart: IconHeartbeat, chat: IconMessageCircle, users: IconUsers, shield: IconShieldCheck, bell: IconBell,
  back: IconChevronLeft, chev: IconChevronRight, arrowLeft: IconArrowLeft, phone: IconPhone, gear: IconSettings, cross: IconMedicalCross,
  bolt: IconBolt, check: IconCheck, dl: IconDownload, pill: IconPill, camera: IconCamera, scan: IconScan, file: IconFileText,
  pdf: IconFileTypePdf, upload: IconUpload, photo: IconPhoto, crop: IconCrop, rotate: IconRotateClockwise, calendar: IconCalendar,
  flask: IconFlask, msg: IconMessage, pin: IconMapPin, map: IconMap, therm: IconTemperature, warn: IconAlertTriangle, info: IconInfoCircle,
  sun: IconSun, cloud: IconCloud, rain: IconCloudRain, storm: IconCloudStorm, fog: IconCloudFog, wind: IconWind, tornado: IconTornado,
  flood: IconRipple, drop: IconDroplet, scale: IconScale, gauge: IconGauge, walk: IconWalk, smile: IconMoodSmile, more: IconDots,
  out: IconExternalLink, off: IconWifiOff, clock: IconClock, fp: IconFingerprint, send: IconSend, mic: IconMicrophone, plus: IconPlus,
  close: IconX, trash: IconTrash, key: IconKey, sos: IconSos, aid: IconFirstAidKit, bag: IconBackpack, lungs: IconLungs, brain: IconBrain,
  eye: IconEye, tooth: IconDental, play: IconPlayerPlay
} satisfies Record<string, TablerIcon>
export type IconName = keyof typeof ICONS

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  const C = ICONS[name]
  return <C className="sh-ic" size={size} stroke={stroke} aria-hidden="true" focusable="false" />
}
