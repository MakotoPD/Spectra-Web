// The launcher's heartbeat and the player's own choice, in one place.
//
// `mode` is what they picked; `playing` is whether a game is running right now.
// Sending nothing but the heartbeat is the common case — the launcher folds it
// into the notification poll it already makes every 30 seconds.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { mode, playing } = await readBody<{ mode?: string, playing?: boolean }>(event) ?? {}

  if (mode !== undefined && !PRESENCE_MODES.includes(mode as PresenceMode)) {
    throw createError({ statusCode: 400, statusMessage: 'unknown presence mode' })
  }

  await exec(
    `UPDATE "user" SET "lastSeen" = $1, playing = $2, presence = COALESCE($3, presence, 'visible')
     WHERE id = $4`,
    [Date.now(), !!playing, mode ?? null, me.id],
  )

  const row = await one<any>(
    'SELECT presence, "lastSeen", playing FROM "user" WHERE id = $1', [me.id])
  return { mode: row?.presence ?? 'visible', status: visibleStatus(row ?? {}) }
})
