import type { LabEntry } from '../labGlossary'

/** The glossary text for one test, shared by the lab detail page and the Library article so the two never differ (labGlossary.ts, MedlinePlus, paraphrased). */
export function LabExplain({ entry }: { entry: LabEntry }) {
  return (
    <>
      <section aria-labelledby="ld-what" data-testid="lab-measures">
        <h2 className="hd" id="ld-what">What it is</h2>
        <div className="grp"><div className="row"><span className="grow">{entry.what}</span></div></div>
      </section>
      <section aria-labelledby="ld-hilo" data-testid="lab-highlow">
        <h2 className="hd" id="ld-hilo">What a high or low result can mean</h2>
        <div className="grp">
          <div className="row"><span className="grow"><b>High</b><span className="sub" style={{ display: 'block' }}>{entry.high}</span></span></div>
          <div className="row"><span className="grow"><b>Low</b><span className="sub" style={{ display: 'block' }}>{entry.low}</span></span></div>
        </div>
      </section>
      <section aria-labelledby="ld-affects" data-testid="lab-affects">
        <h2 className="hd" id="ld-affects">Things that can affect it</h2>
        <ul className="grp" style={{ listStyle: 'none', padding: 0 }}>{entry.affects.map((a) => <li className="row" key={a}><span className="grow">{a}</span></li>)}</ul>
        <p className="sub" style={{ margin: '4px 4px 0' }}>Source: <a href={entry.url} target="_blank" rel="noopener noreferrer">MedlinePlus, U.S. National Library of Medicine<span className="hv-sr"> (opens in new tab)</span></a>, summarised. Not medical advice.</p>
      </section>
    </>
  )
}
