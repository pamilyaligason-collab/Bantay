// @vitest-environment node
// Headlines are invented. Distances are hand-checked against the 4-22N, 114-128E box.
import { describe, expect, it } from 'vitest'
import { categoryOf, gdacsKeep, isClickbait, isWellbeingStory, kmFromPh, phImpact } from './rules.ts'

describe('phImpact (world items must concern the Philippines)', () => {
  it('keeps the named cases', () => {
    expect(phImpact('Typhoon Rosal enters PAR')).not.toBeNull()
    expect(phImpact('Oil prices jump as Iran tensions rise')).not.toBeNull()
  })
  it('keeps each rule group with its reason', () => {
    const cases: [string, string][] = [
      ['OFWs in Kuwait advised to stay indoors', 'philippines'],
      ['Tropical storm forms east of Guam', 'storm'],
      ['LPG prices to rise next month', 'oil'],
      ['Gulf states weigh oil embargo', 'oil'],
      ['Peso slips to 59 per dollar', 'peso'],
      ['WHO declares new public health emergency', 'pandemic'],
      ['Ships reroute around the Red Sea', 'sea'],
      ['Missile strike hits Israel border town', 'conflict'],
      ['US raises tariffs on Chinese steel', 'trade'],
      ['Magnitude 7 earthquake strikes off Japan', 'quake']
    ]
    for (const [t, why] of cases) expect([t, phImpact(t)]).toEqual([t, why])
  })
  it('drops what does not concern us', () => {
    for (const t of ['Green forest fire notification in Nigeria', 'Celebrity lawsuit enters second week', 'Wildfires scorch southern Africa', 'Tariffs on French cheese rise', 'Earthquake strikes northern Chile', 'He is two under par after round one', 'Opposition leader jailed in Uganda']) expect([t, phImpact(t)]).toEqual([t, null])
  })
  it('drops storms, embargoes, sanctions and oil words that have nothing to do with us (audit minors)', () => {
    for (const t of ['Tropical storm Helene hits Mexico', 'UN arms embargo on Sudan extended', 'Trump sanctions Venezuela oil exports', 'Crude remarks spark outrage in Senate', 'Diesel engine maker posts profit']) expect([t, phImpact(t)]).toEqual([t, null])
    expect(phImpact('Sanctions on Chinese chipmakers widen')).toBe('trade')
    expect(phImpact('Diesel prices to rise next week')).toBe('oil')
    expect(categoryOf('Crude remarks spark outrage')).toBeNull()
  })
  it('the pronoun who is not the WHO; the pandemic rule needs the capitalised acronym', () => {
    expect(phImpact('Man who declares victory leaves')).toBeNull()
    expect(phImpact('World Health Organization warns of pandemic')).not.toBeNull()
  })
  it('PAR is the capitalised abbreviation only, and a word inside a longer word never counts', () => {
    expect(phImpact('Storm approaches PAR')).not.toBeNull()
    expect(phImpact('Golf: par four at the ninth')).toBeNull()
    expect(phImpact('Disparity in school funding')).toBeNull()
  })
})

describe('isClickbait (health and wellbeing)', () => {
  it('drops showbiz, crime and death clickbait', () => {
    for (const t of ['Celebrity couple reveals fitness secret', 'Actor dies at 45', 'Singer arrested after hospital brawl', 'Netizens react to viral diet video']) expect([t, isClickbait(t)]).toEqual([t, true])
  })
  it('the pronoun who does not rescue a crime or death headline; WHO the agency does', () => {
    for (const t of ['Nurse who killed three patients arrested', 'Man who stabbed neighbor dies in jail']) expect([t, isClickbait(t)]).toEqual([t, true])
    expect(isClickbait('WHO says cholera deaths rise')).toBe(false)
    expect(isClickbait('World Health Organization says 40 dead in Sudan')).toBe(false) // the full name, any case
    expect(isClickbait('MAN WHO KILLED THREE ARRESTED')).toBe(true) // all caps: WHO is the pronoun
  })
  it('crisis counts as wellbeing only as a crisis line or a mental health crisis', () => {
    expect(isWellbeingStory('Crisis in Gaza deepens')).toBe(false)
    expect(isWellbeingStory('Where to call: crisis hotline numbers for students')).toBe(true)
  })
  it('viral is showbiz only when it is a viral video or post; a viral infection is health', () => {
    for (const t of ['DOH warns of viral infections this rainy season', 'Viral hepatitis cases up, DOH says']) expect([t, isClickbait(t)]).toEqual([t, false])
    for (const t of ['Singer went viral again', 'Viral video of a hospital brawl']) expect([t, isClickbait(t)]).toEqual([t, true])
  })
  it('keeps real health stories, and a health word rescues an outbreak toll but not a celebrity story', () => {
    for (const t of ['DOH urges vaccination as measles cases climb', 'Five simple habits for better sleep', 'Dengue deaths rise in three regions']) expect([t, isClickbait(t)]).toEqual([t, false])
    expect(isClickbait('Actress promotes vaccine drive')).toBe(true)
  })
})

describe('GDACS filter', () => {
  it('km from the box: inside is 0, 4.5 degrees south of the box edge is about 500 km', () => {
    expect(kmFromPh(14.6, 121)).toBe(0)
    expect(kmFromPh(-0.5, 120)).toBeGreaterThan(490)
    expect(kmFromPh(-0.5, 120)).toBeLessThan(510)
  })
  it('keeps events in or near the Philippines', () => {
    expect(gdacsKeep({ title: 'Green earthquake in Luzon', lat: 16, lon: 120.5 })).toBe(true)
    expect(gdacsKeep({ title: 'Orange flood', lat: 25, lon: 121 })).toBe(true) // about 330 km north of the box
    expect(gdacsKeep({ title: 'x', country: 'Indonesia, Philippines' })).toBe(true)
  })
  it('drops far events, including forest fires and cyclones elsewhere', () => {
    expect(gdacsKeep({ title: 'Green forest fire notification in Nigeria', lat: 9, lon: 8 })).toBe(false)
    expect(gdacsKeep({ title: 'Green forest fire notification in Australia', lat: -25, lon: 135 })).toBe(false)
    expect(gdacsKeep({ title: 'Green notification for tropical cyclone PENA-26', lat: 11.2, lon: -151.1 })).toBe(false)
    expect(gdacsKeep({ title: 'Green forest fire notification in Brazil' })).toBe(false) // no position, no mention
  })
  it('a title that names the Philippines keeps any event, even with no position', () => {
    expect(gdacsKeep({ title: 'Green earthquake alert in Philippines' })).toBe(true)
  })
  it('a typhoon whose text names PAR or the Philippines stays even with a far point', () => {
    expect(gdacsKeep({ title: 'Tropical cyclone ROSAL', desc: 'Expected to enter PAR on Sunday', lat: 15, lon: 145 })).toBe(true)
    expect(gdacsKeep({ title: 'Tropical cyclone ROSAL', desc: 'It affects the Philippines.' })).toBe(true)
    expect(gdacsKeep({ title: 'Forest fire', desc: 'Near the Philippines Hotel' })).toBe(false)
  })
})

describe('categoryOf', () => {
  it('tags by headline, health and wellbeing topics keep their own tag', () => {
    expect(categoryOf('Typhoon Rosal enters PAR', 'prepping')).toBe('TYPHOON')
    expect(categoryOf('Oil prices jump as Iran tensions rise')).toBe('OIL AND PRICES')
    expect(categoryOf('Peso weakens', 'national')).toBe('ECONOMY')
    expect(categoryOf('Missile strike near the Red Sea')).toBe('CONFLICT')
    expect(categoryOf('Magnitude 6 quake hits Mindanao', 'prepping')).toBe('QUAKE')
    expect(categoryOf('Typhoon snacks to keep calm', 'wellbeing')).toBe('WELLBEING')
    expect(categoryOf('Hospitals ready for flu season', 'health')).toBe('HEALTH')
    expect(categoryOf('Senate passes budget', 'national')).toBe('PHILIPPINES')
    expect(categoryOf('Flood drill in Cebu', 'prepping')).toBe('PREPAREDNESS')
    expect(categoryOf('Something else')).toBeNull()
  })
})

describe('isWellbeingStory', () => {
  it('keeps crisis-line stories in the mental-health feed', () => {
    expect(isWellbeingStory('Suicide prevention hotline gets new number')).toBe(true)
    expect(isWellbeingStory('Showbiz couple spotted at mall')).toBe(false)
  })
})
