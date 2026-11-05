import { Icon } from '../shell/Icon'
import { Call911 } from './Call911'
import { Section } from '../look'
import { FLAGS } from './flags'
import { ICON, TOPICS } from './FirstAid'
import './firstaid.css'

const PREFIX = '#safety/firstaid/'

/** All topics list only (W10, D-127): the board's order and tints. Safety home reads TOPICS in firstaid.json order, so this list sorts itself. An id not named here goes last, untinted. */
const BOARD: [string, string][] = [['stroke', 'red'], ['dengue-warning-signs', 'purple'], ['cpr', 'red'], ['choking', 'amber'], ['bleeding', 'red'], ['heart-attack', 'red'], ['burns', 'amber'], ['heat-stroke', 'amber'], ['seizure', 'purple'], ['fainting', 'blue'], ['fracture', 'blue'], ['drowning', 'blue'], ['snake-bite', 'green'], ['dog-bite-rabies', 'amber'], ['low-sugar', 'teal'], ['allergic-reaction', 'red'], ['falls', 'teal']]
const rank = (id: string) => { const i = BOARD.findIndex(([b]) => b === id); return i < 0 ? BOARD.length : i }
export const boardTopics = () => [...TOPICS].sort((a, b) => rank(a.id) - rank(b.id))
const tintOf = (id: string) => BOARD.find(([b]) => b === id)?.[1]

export default function FirstAidList() {
  const cpr = TOPICS.find((t) => t.id === 'cpr')
  return (
    <div className="fl">
      <Call911 />
      {cpr && (
        <Section title="Most urgent">
          <a className="card fa-hero" href={PREFIX + 'cpr'}>
            <Icon name="cpr" tone="alert" boxed size={28} />
            <span className="fa-hero-t"><b>CPR (hands-only)</b><span lang="fil">{cpr.tl}</span></span>
            {FLAGS.firstAidOffline && <span className="fa-chip">Offline</span>}
          </a>
        </Section>
      )}
      <Section title={`All ${TOPICS.length} topics`}>
        <ul className="pt-grid fa-grid" aria-label={`All ${TOPICS.length} topics`}>
          {boardTopics().map((t) => (
            <li key={t.id}>
              <a className="card fa-tc" href={PREFIX + t.id} data-tint={tintOf(t.id)}>
                <Icon name={ICON[t.id] ?? 'aid'} boxed size={24} />
                <span className="fa-tc-t">{t.title}</span>
                {!t.title.toLowerCase().includes(t.tl.toLowerCase()) && <span className="fa-tc-s" lang="fil">{t.tl}</span>}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
