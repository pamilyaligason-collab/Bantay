import { db } from '../db'

/** English / Filipino strings for the medicine reminder, the weather action lines and the Quick dial group headers (strings only).
 *  The weather and safety lanes wire their keys later; today the medicine reminder is the one caller. Setting: kv `lang` ('en' | 'fil').
 *  Rules: no medicine name or health value in any string (B-7). Placeholders are {name}. A missing Filipino string falls back to English. */
export type Lang = 'en' | 'fil'
export const LANG_KEY = 'lang'
export const LANGS: { id: Lang; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'fil', label: 'Filipino' }]

const EN = {
  // medicine reminder (health/reminders.ts)
  'med.title': 'Medicine time',
  'med.body': 'It is {time}. Open Bantay to see what is due.',
  // weather action lines (features/weather/actionLine.ts and heatIndex.ts; wired later by the weather lane)
  'wx.heat.caution': 'Drink water often.',
  'wx.heat.extremeCaution': 'Avoid the noon sun. Drink water often.',
  'wx.heat.danger': 'Stay indoors 11 AM-3 PM. Drink water often. Check on older family.',
  'wx.heat.extremeDanger': 'Stay indoors and keep cool. Call 911 if someone is confused or faint.',
  'wx.rain': 'Rain likely {when} ({pct}%)',
  'wx.uv': 'Strong sun: shade and a hat 10 AM-3 PM',
  // Quick dial group headers (safety/dial.ts planDial; wired later by the safety lane)
  'dial.title': 'Quick dial',
  'dial.here': 'You are in {place}',
  'dial.home': 'Your home area is {place}',
  'dial.ph': 'Philippines, national',
  'dial.ofw': 'Filipinos abroad (OFW)',
  'dial.tele': 'Talk to a doctor by phone',
  // SOS status (sos/SosStatus.tsx): "Text opened" is all we can know, never "delivered"
  'sos.title': 'Text prepared for',
  'sos.sent': 'Text opened',
  'sos.ready': 'Ready',
  'sos.noNumber': 'No number',
  'sos.note': 'Text opened means your text app opened with the message. Bantay cannot see if it was sent or delivered.'
} as const
export type StrKey = keyof typeof EN

// Every Filipino string below: review by a native speaker. Polite register (po, kayo, inyo) throughout.
const FIL: Record<StrKey, string> = {
  'med.title': 'Oras na ng gamot', // review by a native speaker
  'med.body': '{time} na. Pakibuksan ang Bantay para makita ang dapat inumin.', // review by a native speaker
  'wx.heat.caution': 'Uminom po ng tubig nang madalas.', // review by a native speaker
  'wx.heat.extremeCaution': 'Iwasan po ang araw sa tanghali. Uminom ng tubig nang madalas.', // review by a native speaker
  'wx.heat.danger': 'Manatili po sa loob mula 11 AM hanggang 3 PM. Uminom ng tubig nang madalas. Kumustahin po ang mga nakatatanda.', // review by a native speaker
  'wx.heat.extremeDanger': 'Manatili po sa loob at magpalamig. Tumawag sa 911 kung may taong nalilito o nanghihina.', // review by a native speaker
  'wx.rain': 'Malamang uulan {when} ({pct}%)', // review by a native speaker
  'wx.uv': 'Matindi ang araw: sumilong po at magsuot ng sombrero 10 AM-3 PM', // review by a native speaker
  'dial.title': 'Mabilis na tawag', // review by a native speaker
  'dial.here': 'Nasa {place} po kayo', // review by a native speaker
  'dial.home': 'Ang inyong lugar: {place}', // review by a native speaker
  'dial.ph': 'Pilipinas, pambansa', // review by a native speaker
  'dial.ofw': 'Mga Pilipino sa ibang bansa (OFW)', // review by a native speaker
  'dial.tele': 'Makipag-usap po sa doktor sa telepono', // review by a native speaker
  'sos.title': 'Pinaghandaan ng text', // review by a native speaker
  'sos.sent': 'Bukas ang text', // review by a native speaker
  'sos.ready': 'Handa na', // review by a native speaker
  'sos.noNumber': 'Walang numero', // review by a native speaker
  'sos.note': 'Ang ibig sabihin ng "Bukas ang text" ay nabuksan ang inyong text app na may mensahe. Hindi po makita ng Bantay kung naipadala o natanggap ito.' // review by a native speaker
}

export const STRINGS: Record<Lang, Record<StrKey, string>> = { en: EN, fil: FIL }

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'fil'

let current: Lang = 'en'
/** The language the app is showing right now (set from kv `lang` by loadLang / setLang). */
export const getLang = (): Lang => current

/** The string for `key` in `lang` (default: the current language), with {placeholders} filled. Unknown placeholder values stay as written. */
export function t(key: StrKey, params: Record<string, string | number> = {}, lang: Lang = current): string {
  const s = STRINGS[lang]?.[key] ?? EN[key]
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** Read the saved language from kv; English when none or unreadable. Also makes it the current one. */
export async function loadLang(): Promise<Lang> {
  try {
    const v = (await db.kv.get(LANG_KEY))?.value
    current = isLang(v) ? v : 'en'
  } catch {
    current = 'en'
  }
  return current
}

/** Save and apply a language. */
export async function setLang(l: Lang): Promise<void> {
  current = l
  await db.kv.put({ key: LANG_KEY, value: l }).catch(() => undefined)
}
