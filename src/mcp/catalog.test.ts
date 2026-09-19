import { describe, expect, it } from 'vitest'
import { REGISTRARS, catalogFor, registrationGap } from './catalog'

/**
 * Which apps are a click and which wait for the deployer, as checked against each authorization server's
 * published metadata on 19 September 2026. If a server starts registering clients on its own, its `registrar`
 * goes and this test says so.
 */
describe('who registers the connection', () => {
  it('names the registrar for every app whose authorization server takes no self-registration', () => {
    for (const id of ['google-drive', 'google-docs', 'gmail', 'google-calendar', 'spotify', 'github', 'slack', 'box']) {
      expect(catalogFor(id)?.registrar, id).toBeDefined()
    }
    for (const id of ['dropbox', 'notion', 'evernote', 'todoist', 'zapier', 'rube']) {
      expect(catalogFor(id)?.registrar, id).toBeUndefined()
    }
  })

  it('without a shipped client the gap names the company and the variable the deployer sets', () => {
    expect(registrationGap(catalogFor('spotify'), undefined, {})).toMatchObject({ name: 'Spotify', env: 'VITE_SPOTIFY_CLIENT_ID' })
    expect(registrationGap(catalogFor('gmail'), undefined, {})).toMatchObject({ name: 'Google', env: 'VITE_GOOGLE_CLIENT_ID' })
  })

  it('a shipped client, a client pasted by the person, or an app that registers itself leaves no gap', () => {
    expect(registrationGap(catalogFor('spotify'), undefined, { spotify: { clientId: 'abc' } })).toBeUndefined()
    expect(registrationGap(catalogFor('github'), { manualClient: { clientId: 'abc' } }, {})).toBeUndefined()
    expect(registrationGap(catalogFor('notion'), undefined, {})).toBeUndefined()
    expect(registrationGap(undefined, undefined, {})).toBeUndefined()
  })

  it('every registrar says where to register and whether a secret has to travel', () => {
    for (const r of Object.values(REGISTRARS)) {
      expect(r.console).toMatch(/^https:\/\//)
      expect(r.env).toMatch(/^VITE_[A-Z]+_CLIENT_ID$/)
      expect(typeof r.secret).toBe('boolean')
    }
    expect(REGISTRARS.spotify.secret).toBe(false)
    expect(REGISTRARS.slack.secret).toBe(true)
  })
})
