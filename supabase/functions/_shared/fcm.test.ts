// @vitest-environment node
// _shared/fcm.ts (lane E): the service-account JWT, the access token cache, the HTTP v1 send, and the B-7 message rules.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildAssertion, channelFor, fcmMessageFor, fcmOutcome, parseServiceAccount, resetFcmCache, sendFcm, type ServiceAccount } from './fcm.ts'
import { renderTemplate, TEMPLATES } from './templates.ts'

let sa: ServiceAccount
let pub: CryptoKey
const toPem = (der: ArrayBuffer) => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`
const fromB64url = (s: string) => Uint8Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))

beforeAll(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  pub = kp.publicKey
  sa = { client_email: 'bantay@family-bantay.iam.gserviceaccount.com', private_key: toPem(await crypto.subtle.exportKey('pkcs8', kp.privateKey)), project_id: 'family-bantay' }
})
beforeEach(() => resetFcmCache())

const NOW = Date.parse('2026-10-26T10:05:00+08:00')
const msg = fcmMessageFor({ kind: 'sos', template: 'family_sos' }, new Date(NOW))!

interface Call { url: string; init: RequestInit }
function rig(answers: Array<(c: Call) => Response | Promise<Response>>) {
  const calls: Call[] = []
  let i = 0
  const fetchFake = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), init }
    calls.push(c)
    const a = answers[Math.min(i++, answers.length - 1)]!
    return a(c)
  }) as unknown as typeof fetch
  return { calls, deps: { fetch: fetchFake, now: () => NOW } }
}
const tokenOk = () => new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3600 }), { status: 200 })
const sendOk = () => new Response('{}', { status: 200 })
const status = (n: number) => () => new Response('{}', { status: n })

describe('service account', () => {
  it('parses the base64 file and rejects anything that is not a service account', () => {
    const b64 = Buffer.from(JSON.stringify({ ...sa, type: 'service_account' })).toString('base64')
    expect(parseServiceAccount(b64)).toMatchObject({ client_email: sa.client_email, project_id: 'family-bantay' })
    expect(parseServiceAccount(undefined)).toBeNull()
    expect(parseServiceAccount('')).toBeNull()
    expect(parseServiceAccount('not base64 !!')).toBeNull()
    expect(parseServiceAccount(Buffer.from('{"hello":1}').toString('base64'))).toBeNull()
  })
})

describe('JWT assertion (RS256 with WebCrypto)', () => {
  it('has the Google claims and a signature the public key verifies', async () => {
    const jwt = await buildAssertion(sa, NOW)
    const [h, c, s] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toEqual({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 3600 })
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, fromB64url(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true)
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, fromB64url(s), new TextEncoder().encode(`${h}.${c}x`))).toBe(false) // a changed claim breaks it
  })
})

describe('sendFcm', () => {
  it('exchanges the JWT once, then sends HTTP v1 with the bearer token; the access token is cached across sends', async () => {
    const { calls, deps } = rig([tokenOk, sendOk, sendOk])
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, deps)).toBe(200)
    expect(await sendFcm(sa, 'tok-B'.padEnd(30, 'x'), msg, deps)).toBe(200)
    expect(calls.map((c) => c.url)).toEqual(['https://oauth2.googleapis.com/token', 'https://fcm.googleapis.com/v1/projects/family-bantay/messages:send', 'https://fcm.googleapis.com/v1/projects/family-bantay/messages:send'])
    const form = new URLSearchParams(String(calls[0]!.init.body))
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    expect(form.get('assertion')!.split('.')).toHaveLength(3)
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer at-1')
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ message: { token: 'tok-A'.padEnd(30, 'x'), ...msg } })
    expect(JSON.parse(String(calls[2]!.init.body)).message.token).toBe('tok-B'.padEnd(30, 'x'))
    for (const c of calls) expect(c.init.signal).toBeInstanceOf(AbortSignal) // 8 s timeout on every call
  })
  it('an expired cached token is fetched again', async () => {
    const { calls, deps } = rig([tokenOk, sendOk, tokenOk, sendOk])
    await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, deps)
    await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, { ...deps, now: () => NOW + 3600_000 })
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(2)
  })
  it('returns Google status as it is: 404 and 410 (unregistered) for the caller to delete, 400, 500', async () => {
    for (const code of [404, 410, 400, 429, 500]) {
      resetFcmCache()
      const { deps } = rig([tokenOk, status(code)])
      expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, deps)).toBe(code)
    }
  })
  it('null when the access token fails (no send is attempted) or the network drops', async () => {
    const a = rig([status(401)])
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, a.deps)).toBeNull()
    expect(a.calls).toHaveLength(1)
    const b = rig([tokenOk, () => { throw new Error('network') }])
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, b.deps)).toBeNull()
    const c = rig([() => { throw new Error('network') }])
    resetFcmCache()
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, c.deps)).toBeNull()
  })
  it('a 401 from FCM drops the cached token so the next send asks again', async () => {
    const { calls, deps } = rig([tokenOk, status(401), tokenOk, sendOk])
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, deps)).toBe(401)
    expect(await sendFcm(sa, 'tok-A'.padEnd(30, 'x'), msg, deps)).toBe(200)
    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(2)
  })
})

describe('fcmOutcome', () => {
  it.each([[200, 'ok'], [404, 'gone'], [410, 'gone'], [400, 'bad'], [403, 'bad'], [401, 'retry'], [429, 'retry'], [500, 'retry'], [503, 'retry'], [null, 'retry']] as const)('%s -> %s', (s, o) => expect(fcmOutcome(s)).toBe(o))
})

describe('message content (B-7)', () => {
  const NAMES = ['Lola Rosa Cruz', 'Rosa', 'Cruz', 'Papa', 'Kuya', 'Ate Joy', 'Joy']
  it('every template: title and body are renderTemplate(id, {}) exactly, data is only {t}, no <name>, no display name', () => {
    for (const id of Object.keys(TEMPLATES)) {
      const m = fcmMessageFor({ kind: null, template: id }, new Date(NOW))!
      const r = renderTemplate(id, {})
      expect(m.notification).toEqual({ title: r.title, body: r.body })
      expect(m.data).toEqual({ t: id })
      const text = JSON.stringify(m)
      expect(text).not.toMatch(/<name>|HH:MM/)
      for (const n of NAMES) expect(text).not.toContain(n)
    }
  })
  it('the <name> templates say Someone/someone, never a name', () => {
    expect(fcmMessageFor({ template: 'mood_unwell', kind: 'mood_unwell' }, new Date(NOW))!.notification.title).toBe('Someone is not feeling well')
    expect(fcmMessageFor({ template: 'reading_high', kind: 'reading_high' }, new Date(NOW))!.notification.title).toBe('Please check on someone')
    expect(fcmMessageFor({ template: 'share_offer', kind: 'share' }, new Date(NOW))!.notification.title).toBe('Someone wants to share their health records with you')
  })
  it('a carer missed-dose row is the contract payload, the carer-class text, never a name', () => {
    expect(fcmMessageFor({ kind: 'dose_missed', template: 'dose_missed' }, new Date(NOW))).toEqual({
      notification: { title: 'A medicine was missed', body: 'A medicine was missed by someone you look after.' },
      data: { t: 'dose_watch' },
      android: { priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'dose_watch' } }
    })
  })
  it('an unknown template is not pushed', () => {
    expect(fcmMessageFor({ kind: 'sos', template: 'from_the_future' }, new Date(NOW))).toBeNull()
    expect(fcmMessageFor({ kind: null, template: 'constructor' }, new Date(NOW))).toBeNull()
  })
  it('android priority is high and the tag is the template id (a repeat replaces)', () => {
    const m = fcmMessageFor({ kind: 'sos', template: 'family_sos' }, new Date(NOW))!
    expect(m.android).toEqual({ priority: 'high', notification: { channel_id: 'carer_alerts', tag: 'family_sos' } })
  })
})

describe('quiet-hours channel (22:00 to 06:00 Manila)', () => {
  const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00+08:00`)
  it('a tone-normal alert is quiet inside the window and loud outside it (edges: 21:59 loud, 22:00 quiet, 05:59 quiet, 06:00 loud)', () => {
    const c = (t: string) => channelFor({ kind: 'digest', template: 'digest', tone: 'normal' }, at(t))
    expect([c('21:59'), c('22:00'), c('23:30'), c('00:00'), c('05:59'), c('06:00'), c('12:00')]).toEqual(['carer_alerts', 'carer_quiet', 'carer_quiet', 'carer_quiet', 'carer_quiet', 'carer_alerts', 'carer_alerts'])
  })
  it('SOS, unwell, dose_missed and rollcall_help are always loud, even at 23:00', () => {
    for (const [kind, template] of [['sos', 'family_sos'], ['mood_unwell', 'mood_unwell'], ['dose_missed', 'dose_missed'], ['rollcall', 'rollcall_help'], ['sos', 'sos_cancel']] as const) {
      expect(fcmMessageFor({ kind, template }, at('23:00'))!.android.notification.channel_id).toBe('carer_alerts')
    }
  })
  it('an urgent alert is loud at night; a normal one is quiet at night (built from the real message)', () => {
    expect(fcmMessageFor({ kind: 'reading_high', template: 'reading_high' }, at('23:00'))!.android.notification.channel_id).toBe('carer_alerts') // urgent
    expect(fcmMessageFor({ kind: 'digest', template: 'digest' }, at('23:00'))!.android.notification.channel_id).toBe('carer_quiet')
    expect(fcmMessageFor({ kind: 'kudos', template: 'kudos' }, at('03:00'))!.android.notification.channel_id).toBe('carer_quiet')
    expect(fcmMessageFor({ kind: 'digest', template: 'digest' }, at('09:00'))!.android.notification.channel_id).toBe('carer_alerts')
  })
  it('the clock is Manila, not the server: 23:00 Manila = 15:00Z is quiet, 07:00 Manila = 23:00Z is loud', () => {
    expect(channelFor({ template: 'digest', tone: 'normal' }, new Date('2026-10-26T15:00:00Z'))).toBe('carer_quiet')
    expect(channelFor({ template: 'digest', tone: 'normal' }, new Date('2026-10-26T23:00:00Z'))).toBe('carer_alerts')
  })
})
