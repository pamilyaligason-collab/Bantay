import { useEffect, useState } from 'react'
import { type Carer, linkCarer, listCarers, type Res, unlinkCarer } from '../api'
import { why } from '../shared'
import type { DeskPerson } from './people'
import { Tag } from './ui'

/** The admin only ever adds read-only links (Lloyd 2026-10-21): can_write is false here, whoever is picked, and never for the admin themself. */
export async function addReadOnly(carerId: string, personId: string, me: string | null): Promise<Res<string>> {
  if (!carerId || carerId === me) return { ok: false, error: 'bad_input' }
  return linkCarer(carerId, personId, false)
}

type Props = {
  personId: string
  people: DeskPerson[]
  me: string | null
  ask: (text: string, run: () => Promise<void>) => void
  say: (text: string) => void
  onChange?: () => void
}

/** Who cares for this person, writer or read-only, with Add read-only link and Remove. */
export default function Carers({ personId, people, me, ask, say, onChange }: Props) {
  const [rows, setRows] = useState<Carer[] | null>(null)
  const [pick, setPick] = useState('')
  const [err, setErr] = useState('')
  const load = () => { void listCarers().then((r) => { if (r.ok) { setRows(r.data.filter((c) => c.person_id === personId)); setErr('') } else setErr(why(r.error)) }) }
  useEffect(load, [personId]) // eslint-disable-line react-hooks/exhaustive-deps
  const nameOfUser = (uid: string) => people.find((p) => p.auth_user_id === uid)?.display_name ?? 'Unknown'
  const self = people.find((p) => p.id === personId)?.auth_user_id
  const taken = new Set((rows ?? []).map((c) => c.carer_id))
  const options = people.filter((p) => p.auth_user_id && p.auth_user_id !== me && p.auth_user_id !== self && !taken.has(p.auth_user_id))

  const add = () => ask(`Offer ${nameOfUser(pick)} read-only access to this person's records? They must accept first.`, async () => {
    const r = await addReadOnly(pick, personId, me)
    if (!r.ok) return setErr(why(r.error))
    say(r.data === 'unchanged' ? `${nameOfUser(pick)} is already linked or has an offer waiting.` : `Offer sent to ${nameOfUser(pick)}. They see nothing until they accept.`); setPick(''); load(); onChange?.()
  })
  const remove = (c: Carer) => ask(`Remove ${nameOfUser(c.carer_id)} as a carer of this person?`, async () => {
    const r = await unlinkCarer(c.carer_id, personId)
    if (!r.ok) return setErr(why(r.error)) // RLS refusal comes back as 'forbidden'
    say(`${nameOfUser(c.carer_id)} removed.`); load(); onChange?.()
  })

  return (
    <section className="mb-sec" aria-label="Carers">
      {err && <p className="mb-err" role="alert">{err}</p>}
      {rows === null ? <p className="dk-sub">Loading carers.</p> : rows.length === 0 ? <p className="dk-sub">No carers linked yet. Pick a member below to give them read-only access.</p> : (
        <ul className="mb-list">
          {rows.map((c) => (
            <li key={c.carer_id} className="mb-carer">
              <span className="dk-grow">{nameOfUser(c.carer_id)}</span>
              <Tag tone={c.can_write ? 'ok' : 'plain'}>{c.can_write ? 'Can edit' : 'Read only'}</Tag>
              <button className="dk-b ghost" onClick={() => remove(c)} aria-label={`Remove ${nameOfUser(c.carer_id)} as carer`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-pinrow">
        <label className="dk-field mb-grow">Add a read-only carer
          <select className="dk-in" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a member</option>
            {options.map((p) => <option key={p.id} value={p.auth_user_id!}>{p.display_name}</option>)}
          </select>
        </label>
        <button className="dk-b" disabled={!pick} onClick={add}>Add read-only link</button>
      </div>
    </section>
  )
}
