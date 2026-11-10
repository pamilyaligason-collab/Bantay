import { describe, expect, it } from 'vitest'
import { inTexas, regionOf } from './region'
import { phoneCountry, toE164 } from './phoneRegion'
import { smsNumber, smsUris, usableNumber } from '../sos/sms'

const HOUSTON = { lat: 29.76, lon: -95.37 }
const TAGBILARAN = { lat: 9.65, lon: 123.85 }
const SINGAPORE = { lat: 1.35, lon: 103.82 }

describe('region (S30 L8)', () => {
  it('a position decides: Houston is us, Tagbilaran is ph, the Texas box edges', () => {
    expect(inTexas(HOUSTON)).toBe(true)
    expect(inTexas({ lat: 25.9, lon: -97.4 })).toBe(true) // Brownsville
    expect(inTexas({ lat: 34.05, lon: -118.24 })).toBe(false) // Los Angeles: US, outside the Texas box
    expect(regionOf(HOUSTON, null)).toBe('us')
    expect(regionOf(TAGBILARAN, null)).toBe('ph')
    expect(regionOf(HOUSTON, 'PH')).toBe('us') // a fix beats the phone's country
  })
  it('no position: the phone country; unknown stays null (never a made-up Philippines)', () => {
    expect(regionOf(null, 'PH')).toBe('ph')
    expect(regionOf(null, 'US')).toBe('us')
    expect(regionOf(null, null)).toBeNull()
    expect(regionOf(SINGAPORE, null)).toBeNull()
    expect(regionOf({ lat: NaN, lon: 1 }, null)).toBeNull()
  })
  it('phone country from the zone, then the language', () => {
    expect(phoneCountry('Asia/Manila', 'en-US')).toBe('PH')
    expect(phoneCountry('America/Chicago', 'en-PH')).toBe('US')
    expect(phoneCountry('America/Los_Angeles', '')).toBe('US')
    expect(phoneCountry('UTC', 'en-PH')).toBe('PH')
    expect(phoneCountry('UTC', 'fil-PH')).toBe('PH')
    expect(phoneCountry('UTC', 'en-US')).toBeNull() // en-US with no US zone proves nothing (a Philippine phone often says en-US; CI says UTC)
    expect(phoneCountry('UTC', 'en-GB')).toBeNull()
    expect(phoneCountry(null, '')).toBeNull()
  })
})

describe('toE164 (D4): Philippine national numbers from outside the Philippines', () => {
  it('abroad: 09xx and 02 numbers get +63, punctuation goes', () => {
    expect(toE164('0917-123-4567', true)).toBe('+639171234567')
    expect(toE164('(02) 8722-1144', true)).toBe('+6328722'+'1144')
    expect(toE164('639171234567', true)).toBe('+639171234567')
  })
  it('abroad: a number with + stays, a US 10-digit number stays, short numbers stay', () => {
    expect(toE164('+1 (346) 293-8773', true)).toBe('+13462938773')
    expect(toE164('(713) 555-0100', true)).toBe('7135550100')
    expect(toE164('911', true)).toBe('911')
    expect(toE164('+63 917 123 4567', true)).toBe('+639171234567')
  })
  it('inside the Philippines (or unknown): digits as typed, nothing changes', () => {
    expect(toE164('0917-123-4567', false)).toBe('09171234567')
    expect(toE164('(02) 8722-1144', false)).toBe('0287221144')
    expect(toE164('', false)).toBe('')
  })
  it('SOS: smsNumber and the sms: links carry +63 from the US, and a PH phone still gets the local form', () => {
    expect(smsNumber('0917 123 4567')).toBe(toE164('0917 123 4567')) // follows this phone
    expect(usableNumber('0917 123 4567')).toBe(true)
    expect(usableNumber('+63 917 123 4567')).toBe(true)
    expect(smsUris([{ name: 'Nene', phone: '+63 917 123 4567' } as never], 'hi')[0]!.uri).toBe('sms:+639171234567?body=hi')
  })
})
