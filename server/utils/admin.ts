// The gate in front of /api/admin/*.
//
// Not an account: the dashboard is a single shared ADMIN_TOKEN exchanged for an
// HttpOnly cookie by `api/admin/login.post.ts`. That is why this sits apart
// from `requireUser` — an admin here is not a signed-in Spectra user, and the
// two must never be mistaken for each other.

import type { H3Event } from 'h3'

import { adminToken } from './secrets'
import { tokenOk } from './telemetry'

export function requireAdmin(event: H3Event) {
  if (!tokenOk(getCookie(event, 'spectra_admin'), adminToken())) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
}
