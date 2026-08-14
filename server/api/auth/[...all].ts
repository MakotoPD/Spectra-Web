// Every better-auth route (sign-in, OAuth callbacks, 2FA, session, …) lives
// under /api/auth/* and is handled by the library itself.
export default defineEventHandler(event => useAuth().handler(toWebRequest(event)))
