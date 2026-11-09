import { useEffect, useSyncExternalStore, type CSSProperties } from 'react'
import { Icon } from '../../shell/Icon'
import { STATIONS, type Station } from './stations'
import { getRadioState, playStation, stopRadio, subscribeRadio } from './radioPlayer'
import './radio.css'

const Spin = () => <span className="rd-spin" aria-hidden="true"><Icon name="rotate" size={24} /></span>
const Play = () => <Icon name="play" size={24} />
const Stop = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>

function Card({ s }: { s: Station }) {
  const st = useSyncExternalStore(subscribeRadio, getRadioState)
  const mine = st.id === s.id ? st.status : 'idle'
  const label = mine === 'playing' ? `Stop ${s.name}` : mine === 'connecting' ? `Connecting to ${s.name}, tap to stop` : mine === 'error' ? `Try ${s.name} again` : `Play ${s.name}`
  const style = { backgroundImage: `linear-gradient(120deg,${s.grad[0]},${s.grad[1]},${s.grad[2]},${s.grad[0]})`, animationDuration: `${s.secs}s`, '--ink': s.ink } as CSSProperties
  return (
    <li className={`rd-st${mine === 'playing' ? ' is-playing' : ''}`} style={style} data-testid={`radio-${s.id}`} data-state={mine}>
      <div className="rd-txt">
        <div className="rd-freq">{s.freq}</div>
        <div className="rd-nm">{s.name}</div>
        {mine === 'playing' && <div className="rd-eq" aria-hidden="true"><i /><i /><i /><i /></div>}
        {mine === 'error'
          ? <div className="rd-err" role="status">Could not play. Check data or Wi-Fi.</div>
          : <div className="rd-sub" role={mine === 'idle' ? undefined : 'status'}>{mine === 'playing' ? 'Playing now' : mine === 'connecting' ? 'Connecting…' : s.sub}</div>}
      </div>
      <button type="button" className="rd-play" aria-label={label} onClick={() => (mine === 'playing' || mine === 'connecting' ? stopRadio() : void playStation(s))}>
        {mine === 'connecting' ? <Spin /> : mine === 'playing' ? <Stop /> : <Play />}
      </button>
    </li>
  )
}

/** Discover > Listen > Live radio (D-166). Leaving the page stops the stream so mobile data is not spent in the background. */
export default function Radio() {
  useEffect(() => stopRadio, [])
  return (
    <div data-testid="radio">
      <a className="rd-back" href="#discover/listen"><Icon name="back" size={20} />Back to Listen</a>
      <h2 className="sh-h2 rd-h">Live radio</h2>
      <p className="sub rd-lead">One station plays at a time. Uses mobile data: up to about 60 MB an hour.</p>
      <ul className="rd-list" role="list">{STATIONS.map((s) => <Card key={s.id} s={s} />)}</ul>
      <p className="sub rd-fine">Streams belong to each station; for personal listening.</p>
    </div>
  )
}
