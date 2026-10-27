import { QueueStrategy, TextToSpeech } from '@capacitor-community/text-to-speech'
import { hasPlugin } from '../../../native/shell'

const RATE = 0.9 // a little slower than normal speech, easier to follow

const webSynth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null)

/** True when this phone or browser can read text aloud. */
export const canSpeak = (): boolean => hasPlugin('TextToSpeech') || !!webSynth()

/** Read `text` aloud and resolve when it ends or is stopped. Native: the TTS plugin. Web: speechSynthesis. Neither: resolves at once, nothing is said. A new call cuts off the one before it. */
export async function speak(text: string): Promise<void> {
  if (hasPlugin('TextToSpeech')) {
    try { await TextToSpeech.speak({ text, lang: 'en-US', rate: RATE, queueStrategy: QueueStrategy.Flush }) } catch { /* stopped or no voice: nothing to do */ }
    return
  }
  const synth = webSynth()
  if (!synth) return
  synth.cancel()
  await new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = RATE
    u.lang = 'en-US'
    u.onend = () => done()
    u.onerror = () => done()
    synth.speak(u)
  })
}

export async function stopSpeaking(): Promise<void> {
  if (hasPlugin('TextToSpeech')) { try { await TextToSpeech.stop() } catch { /* already quiet */ } return }
  webSynth()?.cancel()
}
