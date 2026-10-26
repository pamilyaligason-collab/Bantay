// Emergency gate for Ask (Jack). Pure and deterministic: no model, no network, no storage. It runs before any model call and before the
// daily cap, so a person at their limit still gets the 911 card. A match returns a fixed card; the text never reaches a model or a log.
//
// Lists: English, Tagalog, Taglish, plus a few Cebuano phrases (many Filipino seniors speak Bisaya). Wording follows the public warning-sign
// pages: chest pain / heart attack (NHS https://www.nhs.uk/conditions/heart-attack/, AHA), stroke FAST (NHS https://www.nhs.uk/conditions/stroke/),
// breathing, fainting, seizure, severe bleeding, choking, poisoning and anaphylaxis (Red Cross first aid and NHS "when to call 999" pages),
// self-harm (NCMH Crisis Hotline 1553, https://ncmh.gov.ph), hypertensive crisis (AHA: above 180/120 with chest pain, shortness of breath,
// back pain, numbness, weakness, vision change or trouble speaking is an emergency), sugar below 70 mg/dL (ADA Standards of Care, level 1
// hypoglycaemia) or above 300 mg/dL with symptoms (app rule, see docs/session-8/CLINICAL-REVIEW.md). Every phrase is listed there for review.
// Bias: a false alarm costs a phone call, a miss can cost a life, so the gate leans towards matching. Two guards only:
//  * a negation just before a symptom ("no chest pain", "walang sakit sa dibdib") cancels that one match;
//  * a bare disease name (stroke, heart attack) in a plain "what is / explain / how to prevent" question goes to the knowledge base instead.
// Symptom phrases ("face is drooping", "chest pain") are never guarded by the second rule.

export type EmergencyKind = 'chest' | 'breathing' | 'stroke' | 'unconscious' | 'bleeding' | 'seizure' | 'selfharm' | 'poison' | 'allergy' | 'bp' | 'sugar'
export type Lang = 'en' | 'tl' | 'taglish' | 'other'

/** Lower case, accents off, apostrophes dropped (can't -> cant), every other mark a space. */
export function normalize(text: string): string {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Negation is short-range and stops at clause words, so "no medicine left and I want to die" still fires (release review B1).
const NEG = /\b(?:no|without|denies|never|walang|wala|negative for)\s+(?:(?!(?:but|however|pero|kaso|and|at|tapos|saka|then|now|ngayon|kanina|si|my|ko|ako|he|she|siya)\b)\w+\s+){0,2}$/
// Only these kinds can be cancelled by a negation; self-harm, collapse, breathing, bleeding, seizure and poison always fire.
const NEGATABLE = new Set<EmergencyKind>(['chest', 'stroke', 'allergy'])

interface Rule { kind: EmergencyKind; re: RegExp; guard?: 'bare' }

const R = (kind: EmergencyKind, src: string, guard?: 'bare'): Rule => ({ kind, re: new RegExp(src, 'g'), guard })

// "hindi/di ... makahinga": up to two words between (hindi ako po makahinga).
const CANT = '(?:hindi|di|ndi|hnd|cant|cannot|can not|couldnt|wont|unable to|dili|dili ka|dili ko)\\s+(?:\\w+\\s+){0,2}?'

export const RULES: Rule[] = [
  // chest
  R('chest', '\\b(?:chest|heart)\\s+(?:pain|pains|pressure|tightness|tight|squeezing|squeezed|heaviness|heavy|hurts?|aching|burning)\\b'),
  R('chest', '\\bpain\\s+(?:in|on|across|around)\\s+(?:my |his |her |the |your )?chest\\b'),
  R('chest', '\\b(?:crushing|squeezing)\\s+(?:chest|pain)\\b'),
  R('chest', '\\b(?:sakit|kirot|bigat|sikip|hapdi)\\s+(?:sa|ng|ang|ng aking)\\s+(?:dibdib|puso)\\b'),
  R('chest', '\\b(?:masakit|sumasakit|kumikirot|mabigat|masikip|sumisikip|mahapdi)\\s+(?:ang |yung |ung |ng |na )?(?:dibdib|puso|chest)\\b'),
  R('chest', '\\b(?:masakit|sumasakit|mabigat|masikip)\\s+(?:ang |yung |ung )?(?:pakiramdam sa )?(?:aking |kanyang |niyang )?(?:dibdib|chest)\\b'),
  R('chest', '\\b(?:sakit|sakit sa|kasakit)\\s+(?:sa )?dughan\\b'),
  R('chest', '\\b(?:atake sa puso|inatake sa puso|inaatake sa puso|heart attack|myocardial infarction)\\b', 'bare'),
  // breathing
  R('breathing', `\\b${CANT}(?:makahinga|breathe|huminga|hingalo|mohinga|ginhawa)\\b`),
  R('breathing', '\\b(?:trouble|difficulty|hard|hirap|nahihirapan|nahirapan|lisod)\\s+(?:to |sa |ang |na |ug |og )?(?:breathing|breathe|huminga|paghinga|mag ?breathe|ginhawa|pag ?hinga)\\b'),
  R('breathing', '\\b(?:shortness of breath|short of breath|out of breath|gasping|gasps?|not breathing|stopped breathing|stops breathing|wheezing badly|turning blue|blue lips|choking|choked|nabulunan|nasasakal|nahihirapan sa paghinga|kapos(?: sa| ang)? hininga|hinihingal na hinihingal|nawala ang hininga|walang hininga)\\b'),
  R('breathing', '\\b(?:drowning|nalulunod|nalunod|nalulunod)\\b'),
  R('breathing', '\\b(?:lisod ug ginhawa|lisod og ginhawa|dili makaginhawa|dili ka ginhawa)\\b'),
  // stroke
  R('stroke', '\\b(?:face|mouth|smile)\\s+(?:is |was |looks |suddenly )?(?:droop\\w*|sagging|crooked|uneven|lopsided|numb)\\b'),
  R('stroke', '\\b(?:drooping|droopy|sagging|crooked)\\s+(?:face|mouth|smile)\\b'),
  R('stroke', '\\b(?:slurred|slurring|slurry|garbled)\\s+(?:speech|words|talk)\\b|\\bslurr\\w+\\b'),
  R('stroke', '\\b(?:cant|cannot|unable to|suddenly cant|trouble|difficulty)\\s+(?:speak|talk|talking|speaking|find words|understand)\\b'),
  R('stroke', '\\b(?:sudden|suddenly)\\s+(?:weak\\w*|numb\\w*|confus\\w*|trouble seeing|loss of vision|blind\\w*|dizz\\w+ with|severe headache|worst headache|loss of balance)\\b'),
  R('stroke', '\\bworst headache\\b|\\bthunderclap\\b'),
  R('stroke', '\\b(?:one|1)\\s+side\\s+(?:of (?:the |my |his |her )?(?:body|face)\\s+)?(?:is |feels |went |has gone )?(?:weak|numb|paralyzed|paralysed|drooping|limp)\\b'),
  R('stroke', '\\b(?:arm|leg|hand|foot)\\s+(?:is |suddenly |feels |went )?(?:weak|numb|limp|paralyzed|paralysed|dead)\\b.{0,30}\\b(?:sudden|suddenly|one side|bigla|isang)\\b|\\b(?:sudden|suddenly|bigla)\\b.{0,25}\\b(?:arm|leg|hand|foot|braso|kamay|paa|binti)\\b.{0,15}\\b(?:weak|numb|limp|paralyzed|paralysed|nanghihina|namamanhid)\\b'),
  R('stroke', '\\b(?:ngiwi|nakangiwi|ngumiwi|ngiwi ang mukha|bulol bigla|biglang bulol|biglang nabulol|nabulol bigla|hindi makapagsalita|di makapagsalita|hindi makapag salita|hindi makaintindi|biglang nanghina|biglang namanhid|nanghihina ang (?:isang )?(?:braso|kamay|paa|binti|katawan)|namamanhid ang (?:isang )?(?:braso|kamay|paa|binti|kalahati|mukha)|isang bahagi ng katawan.{0,20}(?:mahina|manhid))\\b'),
  R('stroke', '\\b(?:stroke|nastroke|na stroke|namatay ang kalahati|mild stroke|heat ?stroke)\\b', 'bare'),
  // unconscious
  R('unconscious', '\\b(?:unconscious|unresponsive|passed out|pass out|passing out|blacked out|black out|collapsed|fainted|faints|fainting spell|lost consciousness|loss of consciousness|not responding|wont respond|not waking|wont wake|cant wake|cannot wake|hindi magising|not breathing)\\b'),
  R('unconscious', '\\b(?:nahimatay|nahihimatay|himatay|himatayin|nawalan ng malay|nawawalan ng malay|walang malay|walang response|hindi gumigising|di gumigising|hindi magising|di magising|hindi tumutugon|di tumutugon|nawad an og malay|nawad an ug malay|wala nay malay|nawala ang malay|hinimatay)\\b'),
  // bleeding
  R('bleeding', '\\b(?:heavy bleeding|bleeding heavily|bleeding a lot|bleeding wont stop|wont stop bleeding|cant stop the bleeding|cannot stop the bleeding|bleeding badly|bleeding profusely|vomiting blood|vomited blood|throwing up blood|coughing (?:up )?blood|coughed (?:up )?blood|blood in (?:my |his |her )?vomit|black tarry stool|tarry stools?|bleeding after a fall)\\b'),
  R('bleeding', '\\b(?:sumuka ng dugo|nagsusuka ng dugo|nagsuka ng dugo|umubo ng dugo|inuubo ng dugo|dumudugo ng husto|dumudugo nang husto|malakas na pagdurugo|hindi tumitigil ang dugo|di tumitigil ang dugo|hindi humihinto ang dugo|dugo sa suka|itim na dumi|nagsuka og dugo|mihuguan)\\b'),
  // seizure
  R('seizure', '\\b(?:seizure|seizures|convulsion|convulsions|convulsing|having a fit|epileptic fit|fitting|shaking uncontrollably)\\b'),
  R('seizure', '\\b(?:kombulsyon|kumbulsyon|kinombulsyon|nag seizure|nagka seizure|nanginginig at walang malay|nangingisay|nangisay|nanginig ang buong katawan|nag kombulsyon)\\b'),
  // self-harm
  R('selfharm', '\\b(?:suicide|suicidal|kill myself|killing myself|end my life|end it all|take my own life|want to die|wanna die|wish i was dead|wish i were dead|dont want to live|do not want to live|dont want to be alive|better off dead|hurt myself|harm myself|self harm|selfharm|cut myself|hang myself|jump off|no reason to live|ayoko na mabuhay)\\b'),
  R('selfharm', '\\b(?:magpakamatay|magpapakamatay|nagpapakamatay|nagpakamatay|pakamatay|patayin ang sarili|patayin ko ang sarili|wakasan ang buhay|wakasan ko ang buhay|ayaw ko nang mabuhay|ayaw ko na mabuhay|ayoko nang mabuhay|ayoko na mabuhay|gusto ko nang mamatay|gusto ko na mamatay|gusto kong mamatay|saktan ang sarili|saktan ko ang sarili|wala nang saysay ang buhay|walang saysay ang buhay|mas mabuti pang mamatay|mamatay na lang ako|magbigti|magbibigti|tumalon na lang|gusto nako mamatay|gusto na nako mamatay|dili na ko mabuhi|ayaw na ko mabuhi|magpakamatay ko)\\b'),
  // poison / overdose
  R('poison', '\\b(?:overdose|overdosed|over dose|poison|poisoned|poisoning|swallowed (?:bleach|poison|pesticide|detergent|a lot of|too many)|drank (?:bleach|poison|pesticide|muriatic)|took too many (?:pills|tablets|capsules)|took too much (?:medicine|medication|insulin)|double dose of insulin|nalason|nakalason|uminom ng lason|nakainom ng lason|nakainom ng sobrang gamot|sobrang dami ng gamot|na overdose)\\b'),
  // allergy
  R('allergy', '\\b(?:anaphyla\\w*|throat (?:is |feels )?(?:closing|swelling|tight|swollen)|tongue (?:is )?swelling|swollen tongue|face (?:is )?swelling|lips? (?:are |is )?swelling|swelling of (?:the )?(?:face|lips|tongue|throat)|namamaga ang (?:lalamunan|dila|mukha|labi)|sumasara ang lalamunan)\\b')
]

/** Plain "what is / explain / how to prevent" at the start: bare disease names (stroke, heart attack) go to the knowledge base, unless something is happening now. */
const EDU = /^(?:(?:\w+\s+){0,2})(?:what is|what are|whats|what does|explain|meaning of|define|tell me about|ano ang|ano po ang|ano yung|ano ung|ano yong|anu ang|paano maiwasan|how to prevent|how can i prevent|how do i prevent|how do you prevent|prevent|causes of|signs of|sintomas ng|senyales ng|what causes|bakit nagkakaroon ng)\b/
const NOW = /\b(?:now|right now|just now|ngayon|ngayon lang|kanina lang|kanina|having|is having|nagkaroon ng|nagka|inaatake|bigla|suddenly|happening|nangyayari|my (?:father|mother|husband|wife|lola|lolo|nanay|tatay|asawa)|si (?:nanay|tatay|lola|lolo)|ang (?:nanay|tatay|lola|lolo))\b/

// ---- numbers: blood pressure and sugar ----
const SYMPTOM_BP = /\b(?:headache|sakit ng ulo|masakit ang ulo|blurred|blurry|malabo|vision|nosebleed|dugo sa ilong|confus\w*|short(?:ness)? of breath|hirap huminga|numb\w*|manhid|namamanhid|weak\w*|nanghihina|mahina|dizz\w*|nahihilo|hilo|back pain|sakit ng likod|chest|dibdib|speak\w*|salita|palpitation|pounding|tibok|kinakabahan|vomit\w*|nausea|nasusuka)\b/
const SYMPTOM_SUGAR = /\b(?:shak\w*|trembl\w*|sweat\w*|sweating|cold sweat|confus\w*|dizz\w*|drows\w*|sleepy|weak\w*|faint\w*|hungry|blurred|blurry|vomit\w*|nausea|thirst\w*|nanginginig|nanghihina|nahihilo|hilo|pawis|pinagpapawisan|antok|inaantok|nalilito|malabo|nauuhaw|nagsusuka|mahina|hapo|gutom)\b/

function bpEmergency(t: string): boolean {
  // Orchestrator ruling: a false alarm is cheaper than a missed emergency. Two numbers shaped like a reading, joined by '/', a space, 'over',
  // 'sa', 'by' or 'x' (normalize() has already turned '-' and ':' into spaces). 180/120 or more (both numbers) is an emergency on its own.
  // Lower readings (systolic 180+ or diastolic 120+, not both) need a symptom word or presyon/bp/blood pressure anywhere in the message, so
  // "sugar 190 sa 120 dizzy" may trip it (accepted). Plain numbers with neither stay quiet: dates, prices, sizes, times.
  const cue = SYMPTOM_BP.test(t) || /\b(?:presyon|bp|blood pressure)\b/.test(t)
  // lookahead for the second number so "100 190 125" still tries 190/125; digit guards (not ) so "180/120mmHg" and "bp180/120" match
  for (const m of t.matchAll(/(?<!\d)(\d{2,3})(?=(?:\s*(?:\/|\bover\b|\bsa\b|\bby\b|x)\s*|\s+)(\d{2,3})(?!\d))/g)) {
    const s = Number(m[1])
    const d = Number(m[2])
    if (!(s >= 70 && s <= 300 && d >= 30 && d <= 200 && s > d && (s >= 180 || d >= 120))) continue
    if ((s >= 180 && d >= 120) || cue) return true
  }
  return false
}

function sugarEmergency(t: string): boolean {
  if (!/\b(?:sugar|glucose|asukal|hgt|cbg|rbs|fbs|dextro|blood sugar)\b/.test(t) || !SYMPTOM_SUGAR.test(t)) return false
  // numbers within 40 characters after a sugar word; below 70 (and plausible, at least 20) or above 300 (at most 900)
  for (const m of t.matchAll(/\b(?:sugar|glucose|asukal|hgt|cbg|rbs|fbs|dextro)\b.{0,40}?\b(\d{2,3})\b/g)) {
    const n = Number(m[1])
    if ((n >= 20 && n < 70) || (n > 300 && n <= 900)) return true
  }
  return false
}

export interface GateHit { kind: EmergencyKind }

/** The first emergency found in the person's words, or null. Looks at the last message only (the text the person just wrote). */
export function emergencyGate(text: string): GateHit | null {
  const t = normalize(text)
  if (!t) return null
  const educational = EDU.test(t) && !NOW.test(t)
  // clause breaks (, . ; ! ?) become " and " so a negation never reaches across them
  const tc = normalize(String(text ?? '').replace(/[,.;!?]+/g, ' and '))
  for (const rule of RULES) {
    if (rule.guard === 'bare' && educational) continue
    rule.re.lastIndex = 0
    for (const m of tc.matchAll(rule.re)) {
      const before = tc.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0)
      if (NEGATABLE.has(rule.kind) && NEG.test(before)) continue
      return { kind: rule.kind }
    }
  }
  if (bpEmergency(t)) return { kind: 'bp' }
  if (sugarEmergency(t)) return { kind: 'sugar' }
  return null
}

// ---- language ----
const TL_WORDS = new Set(('ako ako\'y ikaw siya kami kayo sila ko mo niya namin natin ninyo nila ang ng sa na ay po opo ho oo hindi di wala walang mayroon meron ' +
  'ito iyan iyon yung ung itong ganito ganyan bakit paano ano anong saan kailan sino ilan gaano gusto ayaw puwede pwede dapat kailangan masakit sumasakit ' +
  'sakit gamot presyon asukal dugo ulo tiyan dibdib puso paa kamay mata tulog kain inom uminom nainom hindi pa na lang lang naman nga ba kasi pero kung ' +
  'kapag habang mga si ni kay nang pang para sa akin aking iyong kanyang amin ating nanay tatay lola lolo anak asawa kuya ate doktor ospital araw gabi umaga ' +
  'tanghali kanina bukas ngayon sabi mataas mababa normal ilang beses uminom inumin pwedeng ba po ka ba ito yan hindi ko alam salamat').split(/\s+/))
const EN_WORDS = new Set(('the a an is are was were be been am i you he she it we they my your his her our their this that these those what why how when where who which ' +
  'can could should would will do does did have has had not no yes please help with for of to in on at from by and or but if so as about take taking took ' +
  'medicine pressure blood sugar pain doctor today day night morning high low normal reading level my mom dad').split(/\s+/))

/** en, tl (Tagalog), taglish (both), or other (mostly not Latin letters, or no words at all). Cheap word-list vote, not a classifier. */
export function detectLanguage(text: string): Lang {
  const raw = String(text ?? '')
  const letters = raw.match(/\p{L}/gu) ?? []
  if (!letters.length) return 'other'
  const latin = raw.match(/[A-Za-zÀ-ɏ]/g) ?? []
  if (latin.length / letters.length < 0.6) return 'other'
  const words = normalize(raw).split(' ').filter(Boolean)
  let tl = 0
  let en = 0
  for (const w of words) {
    if (TL_WORDS.has(w)) tl++
    if (EN_WORDS.has(w)) en++
  }
  if (tl >= 2 && en >= 2) return 'taglish'
  if (tl >= 1 && tl >= en) return 'tl'
  if (tl >= 2) return 'taglish'
  return 'en'
}
