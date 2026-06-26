// Exchanges the admin token for an HttpOnly session cookie. The token lives in
// the ADMIN_TOKEN env var (runtimeConfig.adminToken).

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  if (!cfg.adminToken) {
    throw createError({ statusCode: 500, statusMessage: 'admin token not configured' })
  }
  const body = await readBody<{ token?: string }>(event)
  if (!tokenOk(body?.token, cfg.adminToken)) {
    throw createError({ statusCode: 401, statusMessage: 'invalid token' })
  }
  setCookie(event, 'spectra_admin', cfg.adminToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: !import.meta.dev,
    maxAge: 60 * 60 * 24 * 30,
  })
  return { ok: true }
})
