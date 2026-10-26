// Local emergency gate for Jack: the SAME rules as the server (supabase/functions/ask/gate.ts, imported, never copied, so the two cannot drift).
// It runs on the phone before takeMessage and before any request, so it works offline and at the daily limit. The text is never sent or stored.
import { emergencyGate, detectLanguage } from '../../../supabase/functions/ask/gate'

export interface Emergency { kind: string; call: string[]; text: string }

const TITLE: Record<string, string> = {
  chest: 'Chest pain needs help now', breathing: 'Trouble breathing needs help now', stroke: 'These can be signs of a stroke',
  unconscious: 'Fainting or not waking needs help now', bleeding: 'Heavy bleeding needs help now', seizure: 'A seizure needs help now',
  selfharm: 'You are not alone', poison: 'Poison or too much medicine needs help now', allergy: 'A bad allergic reaction needs help now',
  bp: 'This blood pressure needs help now', sugar: 'This sugar level needs help now'
}
export const emergencyTitle = (kind: string) => TITLE[kind] ?? 'This may be an emergency'

const BODY = {
  en: "Jack won't answer this one. Call 911 now, or go to the nearest hospital. Do not drive yourself. Or tap the button to tell your family.",
  tl: 'Hindi sasagot si Jack dito. Tumawag sa 911 ngayon o pumunta sa pinakamalapit na ospital. Huwag magmaneho nang mag-isa. O pindutin ang button para masabihan ang pamilya.'
}
const SELF = {
  en: 'I am sorry you are going through this. Please call the NCMH crisis hotline 1553 (free) now, or 911 if you are in danger. Stay with someone you trust.',
  tl: 'Pasensya na at pinagdadaanan mo ito. Tumawag po sa NCMH crisis hotline 1553 (libre) ngayon, o sa 911 kung nasa panganib ka. Manatili sa piling ng taong pinagkakatiwalaan mo.'
}

/** The emergency in the person's words, or null. Imported statically (not lazily) so the gate is in the main bundle and works with no signal; never throws. */
export async function localGate(text: string): Promise<Emergency | null> {
  try {
    const hit = emergencyGate(text)
    if (!hit) return null
    const lang = detectLanguage(text)
    const tl = lang === 'tl' || lang === 'taglish' ? 'tl' : 'en'
    const self = hit.kind === 'selfharm'
    return { kind: hit.kind, call: self ? ['1553', '911'] : ['911'], text: self ? SELF[tl] : BODY[tl] }
  } catch {
    return null
  }
}
