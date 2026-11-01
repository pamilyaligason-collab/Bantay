import { LargeTitle } from '../look/LargeTitle'
import './calm.css'

/** #calm: the Calm page pushed under Today (v13 lane C). */
export default function CalmScreen() {
  return <div className="cm" data-testid="calm"><LargeTitle back={{ href: '#today', label: 'Today' }} title="Calm" /></div>
}
