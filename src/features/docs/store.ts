// Offline cache for ID and insurance card pictures (D-63, B-4). Its own Dexie database; other databases are not touched.
// Pictures only: no OCR, no numbers, nothing here is ever sent to a model.
import Dexie, { type Table } from 'dexie'

export type Kind = 'id_card' | 'insurance_card'
/** Papers scanned from the Ask sheet (labs, prescriptions, anything else). They are read by the server, never shown on the cards screen. */
export type ScanKind = 'lab' | 'prescription' | 'other'
export type DocKind = Kind | ScanKind
export type Side = 'front' | 'back'
export const CARD_TYPES = ['philsys', 'senior', 'pwd', 'drivers', 'passport', 'umid', 'voters', 'postal', 'philhealth', 'hmo', 'other'] as const
export type CardType = (typeof CARD_TYPES)[number]

export interface CardRow {
  path: string // storage_path '<person_id>/<uuid>.<ext>'
  personId: string
  kind: DocKind
  cardType: CardType
  side: Side
  blob: Blob
  updated: number
  docId: string
  title: string | null
  mime: string
  pending: boolean // saved on this phone, not uploaded yet
  owner: string // auth user id this picture belongs to ('' when auth is not configured); never shown to anyone else
  failed?: boolean // gave up after MAX_TRIES; Retry re-queues from `retry`
  retry?: QueueRow
}
/** One picture waiting to go up. clientId is source_files.client_id; docId is also documents.client_id. */
export interface QueueRow {
  seq?: number
  owner: string
  createdAt?: number
  clientId: string
  docId: string
  docNew: boolean
  path: string
  personId: string
  kind: DocKind
  cardType: CardType
  title: string | null
  side: Side | null // null for scanned pages
  page?: number // 1-based source_files.page_no; set only for scanned pages
  pages?: number // pages in the whole document; set only for scanned pages (when the last one is up, the server is asked to read them)
  docDate?: string | null // documents.doc_date (YYYY-MM-DD), chosen by the person
  name: string
  mime: string
  size: number
  sha256: string
  tries: number
}
export interface PersonRow { id: string; name: string; self: boolean }
/** A card that exists only in the family Drive (imported, D-63): no picture on this phone. Metadata only. */
export interface DriveCard { docId: string; personId: string; kind: Kind; cardType: CardType; title: string | null; status: 'draft' | 'confirmed' }

class DocsDB extends Dexie {
  cards!: Table<CardRow, string>
  queue!: Table<QueueRow, number>
  people!: Table<PersonRow, string>
  driveOnly!: Table<DriveCard, string>
  meta!: Table<{ key: string; value: string }, string>
  constructor() {
    super('bantay-docs')
    this.version(1).stores({ cards: 'path, personId, kind, docId', queue: '++seq, &clientId', people: 'id', driveOnly: 'docId, personId', meta: 'key' })
  }
}
export const ddb = new DocsDB()

export const TYPES_FOR: Record<Kind, readonly CardType[]> = {
  id_card: ['philsys', 'senior', 'pwd', 'drivers', 'passport', 'umid', 'voters', 'postal', 'other'],
  insurance_card: ['philhealth', 'hmo', 'other']
}
/** Shown as "Not added yet" rows until the person has one. */
export const COMMON: Record<Kind, readonly CardType[]> = { id_card: ['philsys', 'senior', 'drivers'], insurance_card: ['philhealth', 'hmo'] }
export const LABEL: Record<Kind, Partial<Record<CardType, string>>> = {
  id_card: { philsys: 'PhilSys National ID', senior: 'Senior Citizen ID', pwd: 'PWD ID', drivers: "Driver's licence", passport: 'Passport', umid: 'UMID', voters: "Voter's ID", postal: 'Postal ID', other: 'Other ID' },
  insurance_card: { philhealth: 'PhilHealth', hmo: 'HMO card', other: 'Other insurance card' }
}
export const SHORT: Partial<Record<CardType, string>> = { philsys: 'ID', senior: 'SC', pwd: 'PWD', drivers: 'DL', passport: 'PP', umid: 'UM', voters: 'V', postal: 'PO', philhealth: 'PH', hmo: 'HMO', other: 'ID' }

export interface DocRow {
  docId: string
  personId: string
  kind: Kind
  cardType: CardType
  title: string | null
  front?: CardRow
  back?: CardRow
  pending: boolean
  failed: boolean
  updated: number
}

/** Group cached pictures into one row per card (front + optional back), newest first. */
export function buildDocs(cards: CardRow[], kind: Kind, personId: string): DocRow[] {
  const by = new Map<string, DocRow>()
  for (const c of cards) {
    if (c.kind !== kind || c.personId !== personId) continue
    const d = by.get(c.docId) ?? { docId: c.docId, personId, kind, cardType: c.cardType, title: c.title, pending: false, failed: false, updated: 0 }
    d[c.side] = c
    d.pending ||= c.pending
    d.failed ||= !!c.failed
    d.updated = Math.max(d.updated, c.updated)
    by.set(c.docId, d)
  }
  return [...by.values()].sort((a, b) => b.updated - a.updated)
}
