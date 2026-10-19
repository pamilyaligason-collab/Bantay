/** Go-bag list in plain words, after the NDRRMC family go-bag guide (mockup gobag groups). Ids are stored; never reuse one for a different item. */
export interface BagGroup { title: string; items: { id: string; label: string }[] }

export const GROUPS: BagGroup[] = [
  { title: 'Water and food', items: [
    { id: 'water', label: 'Drinking water, 3 days' },
    { id: 'food', label: 'Ready-to-eat food, 3 days' },
    { id: 'opener', label: 'Can opener' }
  ] },
  { title: 'Health', items: [
    { id: 'meds', label: 'Maintenance medicines, 7 days' },
    { id: 'firstaid', label: 'First aid kit' },
    { id: 'hygiene', label: 'Soap, toothbrush, towel, face masks' }
  ] },
  { title: 'Light, power and signal', items: [
    { id: 'flashlight', label: 'Flashlight and spare batteries' },
    { id: 'radio', label: 'Battery radio' },
    { id: 'powerbank', label: 'Phone charger and power bank, charged' },
    { id: 'whistle', label: 'Whistle' }
  ] },
  { title: 'Documents and money', items: [
    { id: 'docs', label: 'Copies of IDs, PhilHealth and Medical ID, in a plastic bag' },
    { id: 'cash', label: 'Cash in small bills' },
    { id: 'contacts', label: 'Family photo and printed contact list' }
  ] },
  { title: 'Clothes', items: [
    { id: 'clothes', label: 'Change of clothes and rain jacket' }
  ] }
]

export const ALL_IDS = GROUPS.flatMap((g) => g.items.map((i) => i.id))
export const RECHECK_DAYS = 90
