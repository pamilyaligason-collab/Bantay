import { SubHeader } from '../../shell/SubHeader'
import CardBody from './CardBody'
import { medCard } from './data'
import SuppCard from './SuppCard'

/** #discover/learn/med/<id>: one medicine card. Supplements and herbals use the SuppCard layout. */
export default function MedCard({ id }: { id: string }) {
  const c = medCard(id)
  if (!c) return <div className="lr"><SubHeader title="Medicine wiki" backHref="#discover/learn/meds" backLabel="Back to the medicine list" /><p className="card sub">We do not have that card.</p></div>
  if (c.kind !== 'medicine') return <SuppCard c={c} />
  return (
    <div className="lr" data-testid="medcard">
      <SubHeader title={c.name} backHref="#discover/learn/meds" backLabel="Back to the medicine list" />
      <p className="lr-for">{c.forWhat}</p>
      <div className="lr-sec"><b className="lr-h">What it does</b><p>{c.what}</p></div>
      <CardBody c={c} />
    </div>
  )
}
