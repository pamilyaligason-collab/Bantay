// Live emergency-gate check for Jack. Usage: node scripts/jack-gate-live.mjs <ask-url> <jwt>
// Posts 30 emergency phrases; exits 1 unless every reply carries emergency.call including '911' and the header x-bantay-model-called: 0.
// The gate runs before the daily cap and the model, so this costs no model call. The JWT is read from argv and never printed.
export const PHRASES = [
  // English
  'I have chest pain and my left arm is numb', 'I cant breathe', 'her face is drooping on one side and her speech is slurred', 'he is unconscious and not waking up',
  'the bleeding wont stop', 'she is having a seizure right now', 'my father may have had a stroke', 'my throat is closing after the shrimp',
  'BP is 190/110 and I have a bad headache', 'my sugar is 55 and I am shaking',
  // Tagalog
  'hindi makahinga si nanay', 'nahimatay si lolo', 'nagkaroon ng kombulsyon ang anak ko', 'sumuka ng dugo si tatay', 'nakainom ng lason ang bata',
  'biglang bulol si tatay', 'ngiwi ang mukha ni lola', 'hirap huminga ang lola ko', 'namamaga ang lalamunan ni ate', 'presyon 185/100 at malabo ang mata',
  // Taglish / Cebuano
  'di ako makahinga', 'nawalan ng malay ang asawa ko', 'hindi tumitigil ang dugo sa sugat', 'asukal 350, nauuhaw at nanghihina', 'hindi magising si nanay',
  'lisod ug ginhawa', 'nabulunan ang bata', 'kapos ang hininga niya', 'I took too many pills', 'bp 150/125 dizzy'
]

async function main() {
  const [url, jwt] = process.argv.slice(2)
  if (!url || !jwt) { console.error('usage: node scripts/jack-gate-live.mjs <ask-url> <jwt>'); process.exit(2) }
  let bad = 0
  for (const text of PHRASES) {
    let why = ''
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ screen: 'health', messages: [{ role: 'user', content: text }] }) })
      const body = await res.json().catch(() => null)
      const call = body?.emergency?.call
      const has911 = call === '911' || (Array.isArray(call) && call.includes('911')) // the function sends an array
      if (res.status !== 200) why = `status ${res.status}`
      else if (!has911) why = 'no emergency.call 911'
      else if (res.headers.get('x-bantay-model-called') !== '0') why = `x-bantay-model-called=${res.headers.get('x-bantay-model-called')}`
    } catch { why = 'request failed' }
    if (why) { bad++; console.log(`FAIL ${why}: ${text}`) }
  }
  console.log(`${PHRASES.length - bad}/${PHRASES.length} passed`)
  process.exit(bad ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('jack-gate-live.mjs')) await main()
