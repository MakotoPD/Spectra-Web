// CORS preflight for the telemetry ingest endpoint (desktop app → cross-origin).
export default defineEventHandler((event) => {
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'access-control-allow-methods', 'POST, OPTIONS')
  setHeader(event, 'access-control-allow-headers', 'content-type, x-spectra-key')
  setHeader(event, 'access-control-max-age', '86400')
  setResponseStatus(event, 204)
  return null
})
