/**
 * A stand-in for Supabase Auth, for developing and testing the way in without a real project.
 *
 * It speaks the handful of GoTrue endpoints SkyOS actually uses and nothing else. It is not secure, it is not
 * a Supabase implementation, and it must never be pointed at from anything but a developer's own machine: the
 * code is always the same six digits and it prints them instead of sending mail; passwords are kept in memory
 * in the clear.
 *
 *   node tools/fake-accounts.mjs
 *   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=cuentas-de-prueba npm run dev
 *
 * By default it confirms emails on its own, like a project with «Confirm email» off, so the password way in
 * works. `FAKE_CONFIRM_EMAIL=1` makes it insist on confirmation instead — the real project's default — to see
 * the desktop notice it and fall back to local profiles.
 *
 * What it does NOT prove: that real email arrives, that rate limits behave, or that the project's redirect and
 * template settings are right. Those need the real thing.
 */

import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 54321)
/** The only code it ever accepts, printed on every request so nobody has to guess. */
const CODE = '123456'
/** Whether sign-ups get a session at once (the project confirms emails itself) or wait for a mail that never comes. */
const AUTOCONFIRM = process.env.FAKE_CONFIRM_EMAIL !== '1'

/** One id per email, stable across restarts, so a second sign-in finds the same desktop. */
const idFor = (email) => {
  const hex = createHash('sha256').update(email.toLowerCase()).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const sessions = new Map()
/** Emails that have "signed up" in this run, so signing in to one that never did fails like the real thing. */
const known = new Set()
/** The password each email chose, in the clear — this is a test double, not a vault. */
const passwords = new Map()

const userOf = (email, confirmed = true) => ({
  id: idFor(email),
  aud: 'authenticated',
  role: 'authenticated',
  email: email.toLowerCase(),
  email_confirmed_at: confirmed ? new Date().toISOString() : null,
  phone: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [{ id: idFor(email), user_id: idFor(email), provider: 'email', identity_data: { email: email.toLowerCase() } }],
})

function sessionFor(email) {
  const token = randomUUID()
  const user = userOf(email)
  sessions.set(token, user)
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${token}`,
    user,
  }
}

const cors = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Expose-Headers', '*')
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

/** GoTrue's current error shape: a code, a name and a message. */
const fail = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg })

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })

createServer(async (req, res) => {
  cors(res, req.headers.origin)
  if (req.method === 'OPTIONS') return send(res, 204)

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname.replace(/^\/auth\/v1/, '')
  const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {}
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')

  if (path === '/health') return send(res, 200, { version: 'doble-de-prueba' })

  // What the desktop reads at boot to know whether the password way in can work here.
  if (path === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: AUTOCONFIRM, phone_autoconfirm: false })

  if (path === '/otp' && req.method === 'POST') {
    if (!body.email) return fail(res, 400, 'validation_failed', 'A valid email is required')
    const email = String(body.email).toLowerCase()
    // create_user false is "let me in if I already exist"; GoTrue answers 422 when nobody does.
    if (body.create_user === false && !known.has(email)) {
      console.log(`  ✗  no existe ${email}`)
      return fail(res, 422, 'otp_disabled', 'Signups not allowed for otp')
    }
    known.add(email)
    console.log(`\n  ✉  código para ${email}:  ${CODE}\n`)
    return send(res, 200, { message_id: randomUUID() })
  }

  if (path === '/verify' && req.method === 'POST') {
    if (String(body.token ?? '') !== CODE) return send(res, 403, { error: 'invalid_grant', error_description: 'Token has expired or is invalid' })
    if (!body.email) return fail(res, 400, 'validation_failed', 'A valid email is required')
    console.log(`  ✓  entró ${body.email}`)
    return send(res, 200, sessionFor(body.email))
  }

  // The password way in: sign up…
  if (path === '/signup' && req.method === 'POST') {
    if (!body.email || !body.password) return fail(res, 422, 'validation_failed', 'Signup requires a valid password')
    const email = String(body.email).toLowerCase()
    if (String(body.password).length < 6) return fail(res, 422, 'weak_password', 'Password should be at least 6 characters.')
    if (known.has(email)) {
      console.log(`  ✗  ya existe ${email}`)
      // With confirmation on, GoTrue hides that the email is taken: a user with no identities and no session.
      if (!AUTOCONFIRM) return send(res, 200, { ...userOf(email, false), identities: [] })
      return fail(res, 422, 'user_already_exists', 'User already registered')
    }
    known.add(email)
    passwords.set(email, String(body.password))
    if (!AUTOCONFIRM) {
      console.log(`  ✉  ${email} se registró y espera un correo de confirmación que nunca llegará`)
      return send(res, 200, userOf(email, false))
    }
    console.log(`  ✓  se registró ${email}`)
    return send(res, 200, sessionFor(email))
  }

  if (path === '/token' && req.method === 'POST') {
    // …and sign in.
    if (url.searchParams.get('grant_type') === 'password') {
      const email = String(body.email ?? '').toLowerCase()
      if (passwords.get(email) !== String(body.password ?? '')) {
        console.log(`  ✗  contraseña incorrecta para ${email || '(sin correo)'}`)
        return fail(res, 400, 'invalid_credentials', 'Invalid login credentials')
      }
      console.log(`  ✓  entró ${email} con su contraseña`)
      return send(res, 200, sessionFor(email))
    }
    const user = sessions.get(String(body.refresh_token ?? '').replace(/^refresh-/, ''))
    if (!user) return send(res, 401, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
    return send(res, 200, sessionFor(user.email))
  }

  if (path === '/recover' && req.method === 'POST') {
    console.log(`  ✉  ${body.email} pidió restablecer su contraseña (aquí no llega ningún correo)`)
    return send(res, 200, {})
  }

  if (path === '/user') {
    const user = sessions.get(bearer)
    if (!user) return send(res, 401, { error: 'invalid_token', error_description: 'invalid claim' })
    if (req.method === 'PUT' && body.password !== undefined) {
      if (String(body.password).length < 6) return fail(res, 422, 'weak_password', 'Password should be at least 6 characters.')
      passwords.set(user.email, String(body.password))
      console.log(`  ✓  ${user.email} cambió su contraseña`)
    }
    return send(res, 200, user)
  }

  if (path === '/logout' && req.method === 'POST') {
    sessions.delete(bearer)
    console.log('  ←  cerró sesión')
    return send(res, 204)
  }

  send(res, 404, { error: 'not_found', error_description: `El doble de prueba no implementa ${req.method} ${path}` })
}).listen(PORT, () => {
  console.log(`\n  Doble de prueba de cuentas en http://localhost:${PORT}`)
  console.log(`  El código siempre es ${CODE}; las contraseñas se guardan en memoria. ${AUTOCONFIRM ? 'Confirma los correos solo.' : 'Exige confirmar el correo (FAKE_CONFIRM_EMAIL=1).'}`)
  console.log('  No es Supabase y no es seguro: solo para desarrollo.\n')
})
