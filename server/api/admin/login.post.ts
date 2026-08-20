// Exchanges the admin token for an HttpOnly session cookie. The token lives in
// the ADMIN_TOKEN env var (see server/utils/secrets.ts for why it is read there
// and not straight off runtimeConfig).

export default defineEventHandler(async (event) => {
  const expected = adminToken()
  if (!expected) {
    throw createError({ statusCode: 500, statusMessage: 'admin token not configured' })
  }
  const body = await readBody<{ token?: string }>(event)
  if (!tokenOk(body?.token, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'invalid token' })
  }
  setCookie(event, 'spectra_admin', expected, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: !import.meta.dev,
    maxAge: 60 * 60 * 24 * 30,
  })
  return { ok: true }
})
