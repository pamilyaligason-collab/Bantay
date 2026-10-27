import { MED_CHECKED, MED_SOURCES, type MedCardData } from './data'

const List = ({ items }: { items: string[] }) => <ul className="lr-ul">{items.map((s) => <li key={s}>{s}</li>)}</ul>

/** The parts every card shares, so a medicine, supplement or herbal card can never leave out do-not-mix or the doctor line. */
export default function CardBody({ c }: { c: MedCardData }) {
  return (
    <>
      <div className="lr-sec"><b className="lr-h">How to take it</b><List items={c.how} /></div>
      <div className="lr-key"><b>If you miss a dose</b><span>{c.missed}</span></div>
      <div className="lr-sec"><b className="lr-h">Common side effects</b><List items={c.side} /></div>
      <div className="lr-stop"><b>Get help now</b><span>{c.emergency}</span></div>
      <div className="lr-stop" data-testid="nomix"><b>Do not mix with</b><List items={c.noMix} /><span className="sub">This is not the full list. Show every medicine you take to your pharmacist.</span></div>
      <div className="card lr-stack"><b>Food notes</b><span>{c.food}</span></div>
      <div className="lr-key" data-testid="doctor"><b>Talk to your doctor first</b><span>Ask your doctor or pharmacist before you start, stop, skip or change this. This card is not medical advice for one person.</span></div>
      <div className="card lr-stack"><b>Names</b><span className="sub">{c.generic}</span></div>
      <p className="lr-src">{MED_SOURCES} Last checked {MED_CHECKED}.</p>
    </>
  )
}
