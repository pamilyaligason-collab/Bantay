import SosHold from '../sos/SosHold'
import { openSos } from '../sos/openSos'
import './today.css'

/** The hold-for-help button under a warning card. A live quake or storm card hides Jack (D-91, no Jack art), so SOS must stay reachable here.
 *  Same 3 s hold as the Jack sheet; the full SOS screen is owned by JackFab, so this card going away mid-call does not end it. */
export default function NofabSos() {
  return <section className="td-sos" aria-label="Emergency" data-testid="warning-sos"><SosHold onSend={openSos} /></section>
}
