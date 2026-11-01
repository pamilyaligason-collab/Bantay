import { Icon } from '../shell/Icon'
import { Call911 } from './Call911'
import { Section } from '../look'
import { FLAGS } from './flags'
import { ICON, TOPICS } from './FirstAid'
import './firstaid.css'

const PREFIX = '#safety/firstaid/'

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
          {TOPICS.map((t) => (
            <li key={t.id}>
              <a className="card fa-tc" href={PREFIX + t.id}>
                <Icon name={ICON[t.id] ?? 'aid'} tone={t.urgency === 'high' ? 'alert' : 'safety'} boxed size={24} />
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
