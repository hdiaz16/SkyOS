import { describe, expect, it } from 'vitest'
import { GeoError } from './weather'
import { DENIED_NOTE, locationOutcome, microphoneOutcome, notificationOutcome } from './permissions'

const named = (name: string): Error => Object.assign(new Error(name), { name })

describe('what the browser answered', () => {
  it('only a real no is denied for notifications; a closed prompt can be asked again', () => {
    expect(notificationOutcome('granted').status).toBe('granted')
    expect(notificationOutcome('denied').status).toBe('denied')
    expect(notificationOutcome('default').status).toBe('dismissed')
    expect(notificationOutcome(undefined).status).toBe('failed')
  })

  it('a missing or busy microphone is not a refusal', () => {
    expect(microphoneOutcome(named('NotAllowedError')).status).toBe('denied')
    expect(microphoneOutcome(named('NotFoundError'))).toMatchObject({ status: 'failed', note: expect.stringContaining('micrófono') })
    expect(microphoneOutcome(named('NotReadableError')).status).toBe('failed')
    expect(microphoneOutcome(named('AbortError')).status).toBe('dismissed')
    expect(microphoneOutcome(new Error('x')).status).toBe('failed')
    expect(microphoneOutcome('not even an error').status).toBe('failed')
  })

  it('a position that did not arrive is not a refusal either', () => {
    expect(locationOutcome(new GeoError('denied', 'no')).status).toBe('denied')
    expect(locationOutcome(new GeoError('timeout', 'slow')).status).toBe('failed')
    expect(locationOutcome(new GeoError('unavailable', 'no fix')).status).toBe('failed')
    expect(locationOutcome(new Error('network')).status).toBe('failed')
  })

  it('the blocked note sends the person to the browser, where the block lives', () => {
    expect(DENIED_NOTE).toMatch(/navegador/)
  })
})
