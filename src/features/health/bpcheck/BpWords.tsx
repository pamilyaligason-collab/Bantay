import { BP_WORDS, type BpLevel } from '../verdict'
import { BpWord } from './BpCheck'
import './bpcheck.css'

/** What each of the five words means, from the same table that colours every reading (mockup health-vitals "What the words mean"). */
const MEANS: [BpLevel, string, [number, number]][] = [
  ['in', 'Top under 120 and bottom under 80', [110, 70]],
  ['raised', 'Top 120 to 129 and bottom under 80', [125, 75]],
  ['above', 'Top 130 to 134, or bottom 80 to 84', [132, 82]],
  ['high', 'Top 135 or more, or bottom 85 or more', [140, 90]],
  ['low', 'Top under 90 or bottom under 60', [85, 55]]
]

export default function BpWords() {
  return (
    <section aria-labelledby="bw-h">
      <h2 className="hd" id="bw-h">What the words mean</h2>
      <div className="grp bc-verds">
        {MEANS.map(([lv, text, [t, b]]) => (
          <div className="row bc-vrow" key={lv} data-level={BP_WORDS[lv].level}>
            <BpWord top={t} bottom={b} />
            <span className="grow sub">{text}</span>
          </div>
        ))}
      </div>
      <p className="sub" style={{ margin: '6px 4px 0' }}>Home thresholds (High from 135/85: ISH 2020 and ESH), waiting for a doctor to sign them off. The same words are used everywhere in the app. Ask your doctor for your own target.</p>
    </section>
  )
}
