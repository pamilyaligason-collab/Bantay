import 'fake-indexeddb/auto'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addCard, clearDocsCache, ensureOwner, fetchPeople, flushQueue, MAX_TRIES, refreshCards, retryCard } from './api'
import { DocsScreen } from './DocsScreen'
import { ddb, type CardRow } from './store'

configure({ asyncUtilTimeout: 5000 }) // the first render in a cold worker is slow
// Synthetic data only. The fake mimics just the PostgREST/Storage calls this feature makes.
type Row = Record<string, unknown>
function fake(o: { uid?: string | null; tables?: Record<string, Row[]>; files?: Record<string, Blob> } = {}) {
  const t = o.tables ?? {}
  const seen = { uploads: [] as string[], upserts: [] as { table: string; row: Row; opts: unknown }[], downloads: [] as string[], queries: [] as string[] }
  const stored = new Set<string>()
  const server: Record<string, Row[]> = { documents: [], source_files: [] }
  const fail = { documents: 0, upload: 0, badPerson: '' }
  const patches: { table: string; patch: Row }[] = []
  const chain = (table: string) => {
    let rows = [...(t[table] ?? [])]
    const c: Record<string, unknown> = {
      select: () => c,
      update: (patch: Row) => { patches.push({ table, patch }); return c },
      eq: (k: string, v: unknown) => { seen.queries.push(`${table}.eq.${k}.${String(v)}`); rows = rows.filter((r) => r[k] === v); return c },
      is: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return c },
      in: (k: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[k])); return c },
      not: (k: string, _op: string, v: unknown) => { rows = rows.filter((r) => r[k] !== v); return c },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      upsert: (row: Row, opts: unknown) => {
        seen.upserts.push({ table, row, opts })
        if (table === 'documents' && fail.documents > 0) { fail.documents--; return Promise.resolve({ error: { message: 'x' } }) }
        const list = (server[table] ??= [])
        if (!list.some((r) => r.client_id === row.client_id)) list.push(row)
        return Promise.resolve({ error: null })
      },
      then: (res: (v: unknown) => unknown) => res({ data: rows, error: null })
    }
    return c
  }
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: o.uid === null ? null : { user: { id: o.uid ?? 'u1' } } } }) },
    from: chain,
    storage: {
      from: () => ({
        upload: (path: string) => {
          seen.uploads.push(path)
          if (fail.badPerson && path.startsWith(fail.badPerson)) return Promise.resolve({ error: { message: 'Bad request' } })
          if (fail.upload > 0) { fail.upload--; return Promise.resolve({ error: { message: 'Failed to fetch' } }) }
          if (stored.has(path)) return Promise.resolve({ error: { message: 'The resource already exists', statusCode: '409' } })
          stored.add(path)
          return Promise.resolve({ error: null })
        },
        download: (path: string) => { seen.downloads.push(path); return Promise.resolve(o.files?.[path] ? { data: o.files[path], error: null } : { data: null, error: { message: 'x' } }) }
      })
    }
  }
  return { client: client as unknown as SupabaseClient, seen, server, fail, stored, patches }
}

const jpg = (n = 'a') => new File([n], 'x.jpg', { type: 'image/jpeg' })
const SELF = { id: 'p-self', name: 'Me', self: true }
const card = (o: Partial<CardRow> & { path: string }): CardRow => ({
  personId: 'p-self', kind: 'id_card', cardType: 'philsys', side: 'front', blob: jpg(), owner: '', updated: Date.now(), docId: 'd1', title: null, mime: 'image/jpeg', pending: false, ...o
})
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })

beforeEach(async () => {
  await Promise.all([ddb.cards.clear(), ddb.queue.clear(), ddb.people.clear(), ddb.driveOnly.clear(), ddb.meta.clear()])
  location.hash = '#docs'
  setOnline(true)
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('list and viewer (offline, from the cache)', () => {
  beforeEach(async () => {
    await ddb.people.put(SELF)
    await ddb.cards.bulkPut([card({ path: 'p-self/f.jpg' }), card({ path: 'p-self/b.jpg', side: 'back' }), card({ path: 'p-self/s.jpg', cardType: 'senior', docId: 'd2' })])
    setOnline(false)
  })

  it('renders cards and missing slots with no client at all', async () => {
    render(<DocsScreen client={null} />)
    expect(await screen.findByRole('button', { name: 'Show PhilSys National ID' })).toBeTruthy()
    expect(screen.getByText(/Front and back/)).toBeTruthy()
    expect(screen.getByText(/Front only · back missing/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add back of Senior Citizen ID' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "Upload Driver's licence" })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('IDs and insurance')
  })

  it('segment follows the hash and switches to Insurance', async () => {
    location.hash = '#docs/insurance'
    render(<DocsScreen client={null} />)
    expect(await screen.findByRole('button', { name: 'Upload PhilHealth' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Insurance' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'My IDs' }))
    expect(await screen.findByRole('button', { name: 'Show PhilSys National ID' })).toBeTruthy()
    expect(location.hash).toBe('#docs')
  })

  it('viewer: focus moves in, front/back toggle, Escape closes and focus returns', async () => {
    render(<DocsScreen client={null} />)
    const show = await screen.findByRole('button', { name: 'Show PhilSys National ID' })
    show.focus()
    fireEvent.click(show)
    const dlg = await screen.findByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' })))
    expect(await screen.findByAltText('PhilSys National ID, front')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByAltText('PhilSys National ID, back')).toBeTruthy()
    fireEvent.keyDown(dlg, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(show)
  })
})

describe('upload queue', () => {
  it('queues offline with a client UUID, shows the waiting state, then sends once on reconnect', async () => {
    await ddb.people.put(SELF)
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    setOnline(false)
    const f = fake()
    render(<DocsScreen client={f.client} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Upload PhilSys National ID' }))
    const input = await screen.findByTestId('docs-file')
    fireEvent.change(input, { target: { files: [jpg()] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Done, front only' }))
    expect(await screen.findByText('Saved on this phone, waiting to upload')).toBeTruthy()
    const q = await ddb.queue.toArray()
    expect(q).toHaveLength(1)
    expect(q[0]!.clientId).toMatch(/^[0-9a-f-]{36}$/)
    expect(q[0]!.name).toBe('card-front.jpg')
    expect(q[0]!.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(f.seen.uploads).toHaveLength(0)

    setOnline(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(f.seen.uploads).toHaveLength(1))
    await waitFor(async () => expect(await ddb.queue.count()).toBe(0))
    const doc = f.seen.upserts.find((u) => u.table === 'documents')!.row
    expect(doc).toMatchObject({ kind: 'id_card', card_type: 'philsys', status: 'confirmed', person_id: 'p-self' })
    expect(doc).not.toHaveProperty('confirmed_by')
    const file = f.seen.upserts.find((u) => u.table === 'source_files')!.row
    expect(file).toMatchObject({ side: 'front', document_id: doc.id, drive_file_id: null, mime: 'image/jpeg', name: 'card-front.jpg' })
    expect(String(file.storage_path)).toMatch(/^p-self\/[0-9a-f-]{36}\.jpg$/)
    expect((await ddb.cards.toArray())[0]!.pending).toBe(false)
  })

  it('front then back share one document; the back does not create a second one', async () => {
    const f = fake({ tables: { people: [{ id: 'p-self', display_name: 'Test Person', auth_user_id: 'u1' }] } })
    render(<DocsScreen client={f.client} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Upload PhilSys National ID' }))
    fireEvent.change(await screen.findByTestId('docs-camera'), { target: { files: [jpg('front')] } })
    expect(await screen.findByText('Now the back of the card')).toBeTruthy()
    fireEvent.change(screen.getByTestId('docs-camera'), { target: { files: [jpg('back')] } })
    await waitFor(() => expect(f.server.source_files).toHaveLength(2))
    expect(f.server.documents).toHaveLength(1)
    expect(f.server.source_files!.map((r) => r.side).sort()).toEqual(['back', 'front'])
    expect(new Set(f.server.source_files!.map((r) => r.document_id)).size).toBe(1)
  })

  it('a retry after a failed send is idempotent (same client ids, one row each)', async () => {
    const f = fake()
    await addCard({ file: jpg(), personId: 'p-self', kind: 'insurance_card', cardType: 'hmo', title: ' Test label ', side: 'front' })
    f.fail.documents = 1
    expect(await flushQueue(f.client)).toBe(0) // the picture went up, the document insert failed
    expect((await ddb.queue.toArray())[0]!.tries).toBe(1)
    expect(await flushQueue(f.client)).toBe(1) // storage now says "already exists": treated as done
    expect(await flushQueue(f.client)).toBe(0)
    expect(f.seen.uploads).toHaveLength(2)
    const docs = f.seen.upserts.filter((u) => u.table === 'documents')
    expect(docs[0]!.row.client_id).toBe(docs[1]!.row.client_id)
    expect(docs[0]!.row).toMatchObject({ title: 'Test label', card_type: 'hmo', kind: 'insurance_card' })
    expect(f.server.documents).toHaveLength(1)
    expect(f.server.source_files).toHaveLength(1)
    expect(docs[0]!.opts).toMatchObject({ onConflict: 'client_id', ignoreDuplicates: true })
  })

  it('two flushes at once send once', async () => {
    const f = fake()
    await addCard({ file: jpg(), personId: 'p-self', kind: 'id_card', cardType: 'senior', title: null, side: 'front' })
    await Promise.all([flushQueue(f.client), flushQueue(f.client)])
    expect(f.seen.uploads).toHaveLength(1)
  })

  it('rejects a file that is not a photo or PDF without queueing', async () => {
    await ddb.people.put(SELF)
    render(<DocsScreen client={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Upload PhilSys National ID' }))
    fireEvent.change(await screen.findByTestId('docs-file'), { target: { files: [new File(['x'], 'x.exe', { type: 'application/x-msdownload' })] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be used/)
    expect(await ddb.queue.count()).toBe(0)
  })
})

describe('who the cards are for', () => {
  const tables = {
    people: [
      { id: 'p-self', display_name: 'Test Person', auth_user_id: 'u1' },
      { id: 'p-dep', display_name: 'Test Dependent', auth_user_id: null },
      { id: 'p-ro', display_name: 'Test ReadOnly', auth_user_id: null },
      { id: 'p-login', display_name: 'Test Adult', auth_user_id: 'u3' },
      { id: 'p-else', display_name: 'Test Other', auth_user_id: null }
    ],
    carers: [
      { carer_id: 'u1', person_id: 'p-dep', can_write: true },
      { carer_id: 'u1', person_id: 'p-ro', can_write: false },
      { carer_id: 'u1', person_id: 'p-login', can_write: true },
      { carer_id: 'u2', person_id: 'p-else', can_write: true }
    ]
  }
  it('is me plus no-login dependents I can write for, and nobody else', async () => {
    const list = await fetchPeople(fake({ tables }).client)
    expect(list).toEqual([{ id: 'p-self', name: 'Me', self: true }, { id: 'p-dep', name: 'Test Dependent', self: false }])
  })
  it('signed out gives null so the cached list stays', async () => {
    expect(await fetchPeople(fake({ uid: null, tables }).client)).toBeNull()
  })
  it('the sheet offers those same chips', async () => {
    const f = fake({ tables })
    render(<DocsScreen client={f.client} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Upload PhilSys National ID' }))
    const group = await screen.findAllByRole('group', { name: 'For' })
    expect([...group[0]!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Me', 'Test'])
  })
})

describe('refresh from the server', () => {
  it('downloads missing pictures into the cache and drops ones removed on the server', async () => {
    await ddb.cards.bulkPut([card({ path: 'p-self/gone.jpg', docId: 'dx' })])
    const f = fake({
      tables: {
        documents: [{ id: 'd9', person_id: 'p-self', kind: 'id_card', card_type: 'umid', title: 'Test label' }],
        source_files: [{ storage_path: 'p-self/new.jpg', document_id: 'd9', side: 'front', person_id: 'p-self', mime: 'image/jpeg' }]
      },
      files: { 'p-self/new.jpg': jpg('n') }
    })
    await refreshCards(f.client, [SELF])
    const rows = await ddb.cards.toArray()
    expect(rows.map((r) => r.path)).toEqual(['p-self/new.jpg'])
    expect(rows[0]).toMatchObject({ cardType: 'umid', side: 'front', title: 'Test label', pending: false })
  })
})

describe('pictures only', () => {
  it('never calls fetch (no model, no OCR) while uploading and viewing', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await ddb.people.put(SELF)
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    const f = fake()
    await addCard({ file: jpg(), owner: 'u1', personId: 'p-self', kind: 'id_card', cardType: 'philsys', title: null, side: 'front' })
    await flushQueue(f.client, 'u1')
    render(<DocsScreen client={f.client} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show PhilSys National ID' }))
    await screen.findByRole('dialog')
    expect(spy.mock.calls.filter((c) => /openrouter/i.test(String(c[0])))).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
  })
  it('the feature source mentions no model or OCR service', () => {
    const src = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const bad = Object.entries(src).filter(([n, s]) => !n.includes('.test.') && /openrouter|tesseract|\bocr\b|textdetect|vision/i.test(s.replace(/\/\/.*$/gm, '')))
    expect(bad.map(([n]) => n)).toEqual([])
  })
})

describe('poison rows, retry', () => {
  it('a card that keeps failing is given up after MAX_TRIES and the next card still sends', async () => {
    const f = fake()
    f.fail.badPerson = 'p-bad/'
    await addCard({ file: jpg('1'), personId: 'p-bad', kind: 'id_card', cardType: 'philsys', title: null, side: 'front' })
    await addCard({ file: jpg('2'), personId: 'p-good', kind: 'id_card', cardType: 'senior', title: null, side: 'front' })
    for (let i = 1; i < MAX_TRIES; i++) {
      expect(await flushQueue(f.client)).toBe(0) // the bad one blocks until it is given up (order kept)
      expect(await ddb.queue.count()).toBe(2)
    }
    expect(await flushQueue(f.client)).toBe(1) // given up: marked failed, the next card goes
    expect(await ddb.queue.count()).toBe(0)
    const bad = (await ddb.cards.toArray()).find((c) => c.personId === 'p-bad')!
    expect(bad).toMatchObject({ failed: true, pending: false })
    expect(f.server.source_files).toHaveLength(1)
  })
  it('no signal never counts as a failed try', async () => {
    const f = fake()
    f.fail.upload = 20
    await addCard({ file: jpg(), personId: 'p-self', kind: 'id_card', cardType: 'philsys', title: null, side: 'front' })
    for (let i = 0; i < 8; i++) await flushQueue(f.client)
    expect((await ddb.queue.toArray())[0]!.tries).toBe(0)
  })
  it('the viewer shows Retry for a failed card and Retry re-queues it from the kept picture', async () => {
    await ddb.people.put(SELF)
    await ddb.cards.put(card({ path: 'p-self/x.jpg', failed: true, pending: false, retry: { owner: '', clientId: crypto.randomUUID(), docId: 'd1', docNew: true, path: 'p-self/x.jpg', personId: 'p-self', kind: 'id_card', cardType: 'philsys', title: null, side: 'front', name: 'card-front.jpg', mime: 'image/jpeg', size: 1, sha256: 'a'.repeat(64), tries: 0 } }))
    setOnline(false)
    render(<DocsScreen client={null} />)
    expect(await screen.findByText('Could not upload. Tap Show, then Retry')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show PhilSys National ID' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(async () => expect(await ddb.queue.count()).toBe(1))
    expect((await ddb.cards.get('p-self/x.jpg'))!).toMatchObject({ failed: false, pending: true })
    await retryCard('d1') // nothing failed any more: no second queue row
    expect(await ddb.queue.count()).toBe(1)
  })
})

describe('shared phone: the cache belongs to one user', () => {
  it('a different signed-in user sees and keeps nothing of the previous user; their waiting uploads stay private and unsent', async () => {
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    await ddb.people.put(SELF)
    await ddb.cards.bulkPut([card({ path: 'p-self/f.jpg', owner: 'u1' }), card({ path: 'p-self/w.jpg', owner: 'u1', pending: true, docId: 'dw', cardType: 'senior' })])
    await ddb.queue.add({ owner: 'u1', clientId: crypto.randomUUID(), docId: 'dw', docNew: true, path: 'p-self/w.jpg', personId: 'p-self', kind: 'id_card', cardType: 'senior', title: null, side: 'front', name: 'card-front.jpg', mime: 'image/jpeg', size: 1, sha256: 'a'.repeat(64), tries: 0 })
    const f = fake({ uid: 'u2', tables: { people: [{ id: 'p-two', display_name: 'Test Two', auth_user_id: 'u2' }] } })
    render(<DocsScreen client={f.client} />)
    expect(await screen.findByRole('button', { name: 'Upload PhilSys National ID' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
    expect(screen.queryByText('Saved on this phone, waiting to upload')).toBeNull()
    await waitFor(async () => expect((await ddb.people.toArray()).map((p) => p.id)).toEqual(['p-two']))
    expect((await ddb.cards.toArray()).map((c) => c.path)).toEqual(['p-self/w.jpg']) // only u1's unsent picture is left, hidden
    expect(f.seen.uploads).toHaveLength(0)
    expect(await ddb.queue.count()).toBe(1)
  })
  it('signed out (no session) clears the cache; a network error while checking does not', async () => {
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    await ddb.people.put(SELF)
    await ddb.cards.put(card({ path: 'p-self/f.jpg', owner: 'u1' }))
    const down = { auth: { getSession: () => Promise.resolve({ data: { session: null }, error: { message: 'Failed to fetch' } }) } } as unknown as SupabaseClient
    expect(await ensureOwner(down)).toBe('u1')
    expect(await ddb.cards.count()).toBe(1)
    expect(await ensureOwner(fake({ uid: null }).client)).toBe('')
    expect(await ddb.cards.count()).toBe(0)
    expect(await ddb.people.count()).toBe(0)
  })
  it('clearDocsCache keeps only pictures still waiting to upload', async () => {
    await ddb.cards.bulkPut([card({ path: 'a', owner: 'u1' }), card({ path: 'b', owner: 'u1', pending: true })])
    await ddb.people.put(SELF)
    await clearDocsCache()
    expect((await ddb.cards.toArray()).map((c) => c.path)).toEqual(['b'])
    expect(await ddb.people.count()).toBe(0)
  })
})

describe('cards that exist only in the Drive', () => {
  const tables = {
    documents: [{ id: 'dd', person_id: 'p-self', kind: 'id_card', card_type: 'other', title: null, status: 'draft' }],
    source_files: [{ storage_path: null, drive_file_id: 'drv1', document_id: 'dd', side: null, person_id: 'p-self', mime: 'image/jpeg' }]
  }
  it('shows the card with Confirm and Reject, lets the type be fixed, and sends only status and card_type; never fetches', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    const f = fake({ tables: { ...tables, people: [{ id: 'p-self', display_name: 'Test Person', auth_user_id: 'u1' }] } })
    render(<DocsScreen client={f.client} />)
    expect(await screen.findByText('In the family Drive · not on this phone')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Card type'), { target: { value: 'senior' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Other ID' }))
    await waitFor(() => expect(f.patches).toEqual([{ table: 'documents', patch: { status: 'confirmed', card_type: 'senior' } }]))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull())
    expect(screen.getByText('In the family Drive · not on this phone')).toBeTruthy() // confirmed card stays listed
    expect(spy).not.toHaveBeenCalled()
  })
  it('Reject removes it', async () => {
    await ddb.meta.put({ key: 'owner', value: 'u1' })
    const f = fake({ tables: { ...tables, people: [{ id: 'p-self', display_name: 'Test Person', auth_user_id: 'u1' }] } })
    render(<DocsScreen client={f.client} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject Other ID' }))
    await waitFor(() => expect(f.patches[0]!.patch).toEqual({ status: 'rejected' }))
    await waitFor(() => expect(screen.queryByText('In the family Drive · not on this phone')).toBeNull())
  })
})

describe('HEIC with no type', () => {
  it('is recognised from the first bytes', async () => {
    const heic = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])], 'IMG.HEIC', { type: '' })
    const { docId } = await addCard({ file: heic, personId: 'p-self', kind: 'id_card', cardType: 'philsys', title: null, side: 'front' })
    expect((await ddb.cards.toArray()).find((c) => c.docId === docId)).toMatchObject({ mime: 'image/heic' })
    expect((await ddb.queue.toArray())[0]!.name).toBe('card-front.heic')
    await expect(addCard({ file: new File(['plain text here'], 'x', { type: '' }), personId: 'p-self', kind: 'id_card', cardType: 'other', title: null, side: 'front' })).rejects.toThrow()
  })
})

describe('whole card fails together', () => {
  it('front given up with the back still queued: both fail, Retry queues the document row first', async () => {
    const f = fake()
    f.fail.badPerson = 'p-bad/'
    const { docId } = await addCard({ file: jpg('f'), personId: 'p-bad', kind: 'id_card', cardType: 'philsys', title: null, side: 'front' })
    await addCard({ file: jpg('b'), personId: 'p-bad', kind: 'id_card', cardType: 'philsys', title: null, side: 'back', docId })
    for (let i = 0; i < MAX_TRIES; i++) await flushQueue(f.client)
    expect(await ddb.queue.count()).toBe(0)
    expect((await ddb.cards.toArray()).map((c) => [c.side, c.failed])).toEqual(expect.arrayContaining([['front', true], ['back', true]]))
    await retryCard(docId)
    const q = await ddb.queue.orderBy('seq').toArray()
    expect(q.map((r) => [r.side, r.docNew])).toEqual([['front', true], ['back', false]])
    f.fail.badPerson = ''
    expect(await flushQueue(f.client)).toBe(2)
    expect(f.server.documents).toHaveLength(1)
  })
  it("clearDocsCache keeps failed cards, and drops another owner's unsent ones after 30 days", async () => {
    const old = Date.now() - 31 * 86_400_000
    await ddb.cards.bulkPut([card({ path: 'f', owner: 'u1', failed: true, pending: false }), card({ path: 'o', owner: 'u1', pending: true, updated: old }), card({ path: 'n', owner: 'u1', pending: true })])
    await ddb.queue.add({ owner: 'u1', clientId: crypto.randomUUID(), docId: 'x', docNew: true, path: 'o', personId: 'p', kind: 'id_card', cardType: 'other', title: null, side: 'front', name: 'a', mime: 'image/jpeg', size: 1, sha256: 'a'.repeat(64), tries: 0 })
    await clearDocsCache('u2')
    expect((await ddb.cards.toArray()).map((c) => c.path).sort()).toEqual(['f', 'n'])
    expect(await ddb.queue.count()).toBe(0)
  })
})

