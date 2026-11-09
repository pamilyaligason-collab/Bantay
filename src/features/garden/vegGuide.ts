// S26 (D-165): the six November vegetables with a written guide. Facts from DA / BPI production guides (research note s26-veg, Nov 2026); only sitaw's variety is NSIC-confirmed,
// the others are commonly sold, DA / UPLB-listed names. Other crops in the calendar have no guide yet: the app says "Guide coming".
import ampalaya from './img/ampalaya.webp'
import upo from './img/upo.webp'
import repolyo from './img/repolyo.webp'
import sayote from './img/sayote.webp'
import pipino from './img/pipino.webp'
import sitaw from './img/sitaw.webp'

export interface VegGuide {
  /** The crop name in src/data/cropCalendar.json. */
  calendar: string
  name: string
  english: string
  /** Patterns on da_prices.commodity, tried in order; the first row that matches (not imported) is the price shown. */
  price: RegExp[]
  variety: string
  harvest: string
  prep: string
  warn?: string
  img: string
  alt: string
  photo: { author: string; licence: string; page: string }
  guide: string
}
const C = 'https://commons.wikimedia.org/wiki/'

/** In poster order: the easy lowland crops first, sayote (a highland crop) last. */
export const VEG_GUIDE: VegGuide[] = [
  { calendar: 'Yardlong bean', name: 'Sitaw', english: 'Yardlong bean', price: [/pole sitao/i], variety: 'NSIC PS 03, Sandigan, Sierra Madre', harvest: '45 to 50 days after sowing',
    prep: 'Plough 15 to 20 cm deep, 2 to 3 times, a week apart, then harrow. Furrows 2.5 to 3 m apart, spacing 100 x 50 cm. Put up stakes or an A-frame trellis by day 25.',
    img: sitaw, alt: 'Bundles of long sitaw beans', photo: { author: 'David', licence: 'public domain', page: `${C}File:Long_Bean.JPG` }, guide: 'DA Region 2' },
  { calendar: 'Bitter gourd', name: 'Ampalaya', english: 'Bitter gourd', price: [/bitter gourd/i], variety: 'Sta. Lucia, Trident', harvest: '60 to 75 days after sowing',
    prep: 'Plough and harrow 2 to 3 times. Make beds 1 to 1.5 m wide, rows 2 to 3 m apart, hills 30 cm apart, and put up a trellis (A-type or table type).',
    img: ampalaya, alt: 'Bitter gourd fruit on the vine', photo: { author: 'Katja Schulz', licence: 'CC BY 2.0', page: `${C}File:Bitter_Melon_(16533882286).jpg` }, guide: 'Bureau of Plant Industry' },
  { calendar: 'Cucumber', name: 'Pipino', english: 'Cucumber', price: [/^cucumber, native/i, /^cucumber/i], variety: 'Pilmaria, Bituin', harvest: '38 to 45 days after sowing',
    prep: 'Plough and harrow. Furrows 0.75 to 1 m apart (raised beds in the wet season), holes 30 cm apart, and an A-frame or tepee trellis with 2.5 m poles.',
    img: pipino, alt: 'Cucumber growing on a wooden trellis', photo: { author: 'NPS', licence: 'public domain', page: `${C}File:Green_cucumber_growing_from_a_vine_on_a_wooden_trellis._(bf7e7269-b7ae-434c-9e1f-15a4ae4a0f77).JPG` }, guide: 'DA Region 2' },
  { calendar: 'Cabbage', name: 'Repolyo', english: 'Cabbage', price: [/^cabbage \(rare ball\)/i, /^cabbage.*local/i], variety: 'Rare Ball, Scorpio', harvest: '55 to 60 days after transplanting',
    prep: 'Plough and harrow 2 to 3 times. Make raised beds 100 cm wide if drainage is poor. Transplant 1-month-old seedlings 50 x 40 cm apart.',
    img: repolyo, alt: 'Heads of cabbage', photo: { author: 'Balajijagadesh', licence: 'CC BY-SA 3.0', page: `${C}File:Cabbage1.jpg` }, guide: 'DA Region 2' },
  { calendar: 'Bottle gourd', name: 'Upo', english: 'Bottle gourd', price: [/bottle gourd/i], variety: 'Magnifica, Tambuli, Dalisay F1', harvest: '60 to 80 days after sowing',
    prep: 'Plough 15 to 20 cm deep, 2 to 3 times, a week apart, then harrow. Furrows 2 to 3 m apart (raised beds in the wet season). Overhead trellis about 2 m high.',
    img: upo, alt: 'Bottle gourds hanging from a trellis', photo: { author: 'Yoko Nekonomania', licence: 'CC BY 2.0', page: `${C}File:Bottle_Gourd_-_Flickr_-_nekonomania.jpg` }, guide: 'DA Region 2' },
  { calendar: 'Chayote', name: 'Sayote', english: 'Chayote', price: [/^chayote/i], variety: 'Local lines, no named variety', harvest: 'About 4 to 5 months after planting',
    prep: 'Dig shallow holes about 30 cm wide, 3 m apart each way. Plant a whole sprouted fruit, and put up a wire trellis about 2 m high.',
    warn: 'Grows best in cool upland areas (about 1,000 m and up). In hot lowlands it may flower and fruit poorly.',
    img: sayote, alt: 'A pile of harvested chayote', photo: { author: 'Gaurav Dhwaj Khadka', licence: 'CC BY-SA 4.0', page: `${C}File:Chayote_1.jpg` }, guide: 'Bureau of Plant Industry; harvest time from the Manila Bulletin planting calendar' }
]
/** Licence deeds for the Creative Commons photos (public domain needs none). */
export const LICENCE_URL: Record<string, string> = {
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/'
}
export const guideFor = (calendarName: string): VegGuide | undefined => VEG_GUIDE.find((g) => g.calendar === calendarName)
