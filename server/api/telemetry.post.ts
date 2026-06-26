// Ingest endpoint for the launcher's anonymous telemetry.
//
// Body shape (one batch per call):
//   {
//     install_id: string,           // random UUID generated once per install
//     version?, os?, arch?, locale?, // coarse environment
//     events: [{ event: string, props?: object }]
//   }
//
// No IP is stored. An optional `x-spectra-key` header (SPECTRA_INGEST_KEY) just
// filters out random internet noise — it is not a secret.

interface IncomingEvent {
  event?: unknown
  props?: unknown
}
interface IncomingBatch {
  install_id?: unknown
  version?: unknown
  os?: unknown
  arch?: unknown
  locale?: unknown
  events?: unknown
}

const MAX_EVENTS = 50
const MAX_PROPS_BYTES = 2000

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()

  // The launcher is a Tauri desktop app, so requests are cross-origin.
  setHeader(event, 'access-control-allow-origin', '*')

  // Soft anti-spam: if a key is configured, require it.
  if (cfg.ingestKey) {
    if (getHeader(event, 'x-spectra-key') !== cfg.ingestKey) {
      throw createError({ statusCode: 401, statusMessage: 'invalid key' })
    }
  }

  const body = await readBody<IncomingBatch>(event)
  const installId = clampStr(body?.install_id, 64)
  if (!installId) {
    throw createError({ statusCode: 400, statusMessage: 'install_id required' })
  }

  const list = Array.isArray(body?.events) ? (body!.events as IncomingEvent[]) : []
  if (!list.length) return { ok: true, accepted: 0 }

  const version = clampStr(body?.version, 32) ?? null
  const os = clampStr(body?.os, 16) ?? null
  const arch = clampStr(body?.arch, 16) ?? null
  const locale = clampStr(body?.locale, 16) ?? null

  const now = Date.now()
  const day = dayKey(now)

  const handle = useTelemetryDb()
  const insert = handle.prepare(
    `INSERT INTO events (ts, day, install_id, event, version, os, arch, locale, props)
     VALUES (@ts, @day, @install_id, @event, @version, @os, @arch, @locale, @props)`,
  )

  let accepted = 0
  const tx = handle.transaction((events: IncomingEvent[]) => {
    for (const e of events.slice(0, MAX_EVENTS)) {
      const name = clampStr(e?.event, 32)
      if (!name || !ALLOWED_EVENTS.has(name)) continue

      let props: string | null = null
      if (e?.props && typeof e.props === 'object') {
        const json = JSON.stringify(e.props)
        if (json.length <= MAX_PROPS_BYTES) props = json
      }

      insert.run({
        ts: now,
        day,
        install_id: installId,
        event: name,
        version,
        os,
        arch,
        locale,
        props,
      })
      accepted++
    }
  })
  tx(list)

  // Occasionally trim old rows (no cron needed).
  if (Math.random() < 0.02) pruneOld(handle)

  return { ok: true, accepted }
})
