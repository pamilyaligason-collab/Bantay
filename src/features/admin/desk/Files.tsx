import { useEffect, useState } from 'react'
import { dateTime, statusLabel } from '../shared'
import { useDeskPeople } from './people'
import { canRetry, errorWords, FILTERS, listFiles, openFile, retryFile, type FileFilter, type FileRow } from './logsApi'
import type { PageProps } from './types'
import { Empty, Filters, PageHead, Skeleton, Tag, useConfirm, useToast, type Tone } from './ui'
import './files.css'

const TONE: Record<string, Tone> = { failed: 'bad', reading: 'warn', new: 'warn', queued: 'warn', extracted: 'warn', done: 'ok' }
const kindWords = (k: string | null | undefined) => (k ? statusLabel(k) : 'Unknown')

export default function Files(_: PageProps) {
  const { people, nameOf } = useDeskPeople()
  const [status, setStatus] = useState<FileFilter>('all')
  const [person, setPerson] = useState('')
  const [rows, setRows] = useState<FileRow[] | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const confirm = useConfirm()
  const toast = useToast()

  useEffect(() => {
    let live = true
    setError(false)
    void listFiles({ status, person }).then((r) => { if (!live) return; if (r.ok) setRows(r.data); else { setRows([]); setError(true) } })
    return () => { live = false }
  }, [status, person, tick])

  const retry = (r: FileRow) => confirm.ask(`Read "${r.name}" again? It goes back to New and the scanner will pick it up.`, async () => {
    const res = await retryFile(r.id)
    toast.show(res.ok ? 'Queued to read again.' : 'Could not queue it. Try again.')
    if (res.ok) setTick((t) => t + 1)
  }, { title: 'Read this file again?', verb: 'Read again' })
  const open = async (r: FileRow) => { if (!(await openFile(r))) toast.show('Could not open that file.') }

  return (
    <div className="fl">
      <PageHead title="Files and scans" sub={rows ? `${rows.length} shown` : undefined} />
      <Filters>
        {FILTERS.map(([k, label]) => <button key={k} className="dk-chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{label}</button>)}
        <label className="fl-sr" htmlFor="fl-person">Person</label>
        <select id="fl-person" className="dk-in" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
      </Filters>
      {error && <Empty>Could not load files. Check the connection and try again.</Empty>}
      {!error && !rows && <Skeleton rows={6} />}
      {!error && rows && !rows.length && <Empty>No files match.</Empty>}
      {!error && !!rows?.length && (
        <div className="dk-scrollx">
          <table className="dk-table dk-cardtab">
            <caption className="fl-sr">Source files</caption>
            <thead><tr>{['Person', 'File', 'Kind', 'Page', 'Status', 'Problem', 'Tries', 'Added', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="fl-name">{r.person_id ? nameOf(r.person_id) : 'Not assigned'}</th>
                  <td className="fl-file" data-label="File">{r.name}</td>
                  <td data-label="Kind">{kindWords(r.documents?.kind)}</td>
                  <td className="num" data-label="Page">{r.page_no ?? ''}{r.documents?.page_count ? ` of ${r.documents.page_count}` : ''}</td>
                  <td data-label="Status"><Tag tone={TONE[r.ingest_status] ?? 'plain'}>{statusLabel(r.ingest_status)}</Tag></td>
                  <td data-label="Problem">{errorWords(r.ingest_error)}</td>
                  <td className="num" data-label="Tries">{r.ingest_tries ?? ''}</td>
                  <td data-label="Added">{dateTime(r.created_at)}</td>
                  <td>
                    <div className="dk-acts">
                      {(r.storage_path || r.drive_file_id) && <button className="dk-b" onClick={() => open(r)} aria-label={`Open ${r.name}`}>Open</button>}
                      {canRetry(r) && <button className="dk-b go" onClick={() => retry(r)} aria-label={`Retry ${r.name}`}>Retry</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm.node}
      {toast.node}
    </div>
  )
}
