import { useEffect, useState } from 'react'
import { getMember } from '../../auth/session'
import { type Carer, linkCarer, listCarers, type Res, unlinkCarer } from '../api'
import { why } from '../shared'
import type { DeskPerson } from './people'
import { Tag } from './ui'

/** Links added here are read-only (can_write is false, whoever is picked, and never for the owner themself); a carer who edits is made on the Who sees whom grid. */
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

/** Who cares for this person, writer or read-only. Only the family owner can allow or remove (D-109); other admins read the list. */
export default function Carers({ personId, people, me, ask, say, onChange }: Props) {
  const [rows, setRows] = useState<Carer[] | null>(null)
  const [pick, setPick] = useState('')
  const [err, setErr] = useState('')
  const [owner, setOwner] = useState<boolean | null>(null) // null = not asked yet; any error reads as not the owner
  useEffect(() => { void getMember().catch(() => null).then((m) => setOwner(m?.isOwner === true)) }, [])
  const load = () => { void listCarers().then((r) => { if (r.ok) { setRows(r.data.filter((c) => c.person_id === personId)); setErr('') } else setErr(why(r.error)) }) }
  useEffect(load, [personId]) // eslint-disable-line react-hooks/exhaustive-deps
  const nameOfUser = (uid: string) => people.find((p) => p.auth_user_id === uid)?.display_name ?? 'Unknown'
  const self = people.find((p) => p.id === personId)?.auth_user_id
  const taken = new Set((rows ?? []).map((c) => c.carer_id))
  const options = people.filter((p) => p.auth_user_id && p.auth_user_id !== me && p.auth_user_id !== self && p.kind !== 'shared' && !taken.has(p.auth_user_id))

  const add = () => ask(`Allow ${nameOfUser(pick)} to see this person's records? It works at once and ${self ? 'the person' : nameOfUser(pick)} is told.`, async () => {
    const r = await addReadOnly(pick, personId, me)
    if (!r.ok) return setErr(why(r.error))
    say(r.data === 'unchanged' ? `${nameOfUser(pick)} can already see them.` : r.data === 'updated' ? `Saved. ${nameOfUser(pick)} already had a link.` : `${nameOfUser(pick)} can now see this person's records.`); setPick(''); load(); onChange?.()
  })
  const remove = (c: Carer) => ask(`Remove ${nameOfUser(c.carer_id)} as a carer of this person?`, async () => {
    const r = await unlinkCarer(c.carer_id, personId)
    if (!r.ok) return setErr(why(r.error)) // RLS refusal comes back as 'forbidden'
    say(`${nameOfUser(c.carer_id)} removed.`); load(); onChange?.()
  })

  return (
    <section className="mb-sec" aria-label="Carers">
      {err && <p className="mb-err" role="alert">{err}</p>}
      {rows === null ? <p className="dk-sub">Loading carers.</p> : rows.length === 0 ? <p className="dk-sub">Nobody is linked yet.{owner === true ? ' Pick a member below to allow them to see the records.' : ''}</p> : (
        <ul className="mb-list">
          {rows.map((c) => (
            <li key={c.carer_id} className="mb-carer">
              <span className="dk-grow">{nameOfUser(c.carer_id)}</span>
              <Tag tone={c.can_write ? 'ok' : 'plain'}>{c.can_write ? 'Can edit' : 'Read only'}</Tag>
              {owner === true && <button className="dk-b ghost" onClick={() => remove(c)} aria-label={`Remove ${nameOfUser(c.carer_id)} as carer`}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {owner === true ? (
      <div className="mb-pinrow">
        <label className="dk-field mb-grow">Allow a member to see the records
          <select className="dk-in" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a member</option>
            {options.map((p) => <option key={p.id} value={p.auth_user_id!}>{p.display_name}</option>)}
          </select>
        </label>
        <button className="dk-b" disabled={!pick} onClick={add}>Allow</button>
      </div>
      ) : owner === false && <p className="dk-sub">Only the family owner can change this.</p>}
    </section>
  )
}
