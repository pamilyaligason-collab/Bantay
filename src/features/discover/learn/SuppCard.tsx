import { SubHeader } from '../../shell/SubHeader'
import type { Evidence, MedCardData } from './data'
import CardBody from './CardBody'

const LEVEL: Record<Evidence, { n: number; word: string }> = { good: { n: 3, word: 'Good' }, some: { n: 2, word: 'Some' }, little: { n: 1, word: 'Little' } }

/** Supplement and herbal card: the shared body plus how good the evidence is (bar and word). No claims about brain health or cures. */
export default function SuppCard({ c }: { c: MedCardData }) {
  const lv = LEVEL[c.evidence ?? 'little']
  return (
    <div className="lr" data-testid="suppcard">
      <SubHeader title={c.name} backHref="#discover/learn/meds" backLabel="Back to the medicine list" />
      <p className="lr-for">{c.kind === 'herbal' ? 'Herbal supplement' : 'Supplement'}. {c.forWhat}</p>
      <div className="card lr-stack">
        <div className="lr-row"><b className="lr-grow">How good is the evidence?</b>
          <div className="lr-lvl" role="img" aria-label={`${lv.word} evidence`}>{[1, 2, 3].map((i) => <i key={i} className={i <= lv.n ? 'f' : ''} />)}</div>
        </div>
        <span className="chip">{lv.word}</span>
        <span className="sub">Good means many strong studies. Some means a few studies. Little means small or early studies.</span>
      </div>
      <div className="lr-sec"><b className="lr-h">What people use it for</b><p>{c.what}</p></div>
      <CardBody c={c} />
    </div>
  )
}
