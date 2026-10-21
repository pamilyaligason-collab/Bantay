import { useEffect, useState } from 'react'
import { KIND } from '../../records/ConfirmSheet'
import { NOT_CONNECTED } from '../shared'
import type { PageProps } from './types'
import { Empty, PageHead, Tag, useConfirm, useToast } from './ui'
import { useDeskPeople } from './people'
import { applyKeep, countsFor, loadDuplicates, planKeep, restore, rxDiff, type DupGroup, type Kids } from './recordsApi'
import './records.css'

const day = (iso: string) => iso.slice(0, 10)

export default function Duplicates(_: PageProps) {
  const { nameOf } = useDeskPeople()
  const [data, setData] = useState<{ groups: DupGroup[]; kids: Kids } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const conf = useConfirm()

  const load = async () => {
    const r = await loadDuplicates()
    if (r.ok) { setErr(''); setData(r.data) } else { setErr(r.error === 'not_connected' ? NOT_CONNECTED : 'Could not load duplicates. Try again.'); setData({ groups: [], kids: { labs: [], vaccinations: [], imaging: [], items: [], prescriptions: [] } }) }
  }
  useEffect(() => { void load() }, [])

  const keep = (g: DupGroup, keepId: string) => {
    const plan = planKeep(g, keepId, data!.kids)
    if (!plan.ok) return toast.show(plan.error)
    const rows = plan.changes.reduce((n, c) => n + (c.table === 'documents' ? 0 : c.ids.length), 0)
    const others = plan.changes.filter((c) => c.table === 'documents').length
    conf.ask(`Keep this copy? The other ${others === 1 ? 'copy' : `${others} copies`} and ${rows} draft ${rows === 1 ? 'row' : 'rows'} go to Rejected. You can undo right after.`, async () => {
      setBusy(true)
      try {
        const r = await applyKeep(plan.changes)
        if (!r.ok) return toast.show('Could not reject the other copy. Nothing more was changed.')
        toast.show('Kept this copy.', () => void restore(plan.changes).then((u) => { toast.show(u.ok ? 'Put back.' : 'Could not put it back. Check Records.'); void load() }))
        await load()
      } finally { setBusy(false) }
    })
  }

  return (
    <>
      <PageHead title="Duplicates" sub={data ? `${data.groups.length} ${data.groups.length === 1 ? 'group' : 'groups'} of papers that share a file` : 'Loading...'} />
      {err && <p className="rc-err" role="alert">{err}</p>}
      {data === null ? <Empty>Loading...</Empty> : data.groups.length === 0 ? <Empty>No duplicate papers.</Empty> : data.groups.map((g, gi) => {
        const diffs = g.docs.slice(1).flatMap((d, i) => rxDiff(data.kids.items.filter((l) => l.document_id === g.docs[0].id), data.kids.items.filter((l) => l.document_id === d.id)).map((x) => ({ ...x, other: i + 2 })))
        return (
          <section key={g.key} className="rc-group" aria-label={`Group ${gi + 1}`}>
            <h2 className="h2">{nameOf(g.docs[0].person_id)}: group {gi + 1}</h2>
            <div className="rc-cards">
              {g.docs.map((d, ci) => {
                const counts = countsFor(d.id, data.kids)
                return (
                  <article key={d.id} className="rc-card" aria-label={`Copy ${ci + 1}`}>
                    <h3 className="rc-h3">Copy {ci + 1} <Tag tone={d.status === 'confirmed' ? 'ok' : 'warn'}>{d.status}</Tag></h3>
                    <dl className="rc-dl">
                      <div><dt>Paper</dt><dd>{KIND[d.kind] ?? d.kind}{d.title ? `, ${d.title}` : ''}</dd></div>
                      <div><dt>Date</dt><dd>{d.doc_date ?? '-'}</dd></div>
                      <div><dt>Facility</dt><dd>{d.facility ?? '-'}</dd></div>
                      <div><dt>Added</dt><dd>{day(d.created_at)}</dd></div>
                      {Object.entries(counts).map(([k, c]) => <div key={k}><dt>{k}</dt><dd>{c.n} ({c.confirmed} confirmed)</dd></div>)}
                    </dl>
                    <button className="dk-b go" disabled={busy} aria-label={`Keep copy ${ci + 1} in group ${gi + 1}`} onClick={() => keep(g, d.id)}>Keep this one</button>
                  </article>
                )
              })}
            </div>
            {diffs.length > 0 && (
              <div className="dk-scrollx">
                <table className="dk-table">
                  <caption className="rc-cap">Prescription line differences, group {gi + 1}</caption>
                  <thead><tr><th scope="col">Line</th><th scope="col">Field</th><th scope="col">Copy 1</th><th scope="col">Other copy</th></tr></thead>
                  <tbody>{diffs.map((x, i) => <tr key={i}><td>{x.line}</td><td>{x.field.replace('_', ' ')}</td><td>{x.a || '-'}</td><td>{x.b || '-'} <span className="dk-sub">(copy {x.other})</span></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
      {conf.node}
      {toast.node}
    </>
  )
}
