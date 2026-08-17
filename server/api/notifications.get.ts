// The launcher polls this every ~30s while its window is open, passing the
// highest id it has already seen: `?since=<id>` returns only what is new.
// Cheap enough to poll — one indexed lookup, and the pack name travels in the
// notification's own `data` blob rather than a join into the shares table.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const query = getQuery(event)
  const since = Number(query.since) || 0

  // The launcher's heartbeat rides along with this poll rather than making a
  // second request every 30 seconds just to say "still here".
  await exec('UPDATE "user" SET "lastSeen" = $1, playing = $2 WHERE id = $3',
    [Date.now(), query.playing === '1', me.id])

  const rows = await q<any>(
    `SELECT n.id, n.kind, n.share_code, n.data, n.read, n.created,
            u.id AS actor_id, u.name AS actor_name, u.username AS actor_username, u.image AS actor_image
     FROM notification n
     LEFT JOIN "user" u ON u.id = n.actor_id
     WHERE n.user_id = $1 AND n.id > $2
     ORDER BY n.id DESC LIMIT 50`,
    [me.id, since],
  )

  const unread = await one<{ n: number }>(
    'SELECT count(*)::int AS n FROM notification WHERE user_id = $1 AND read = FALSE',
    [me.id],
  )

  return {
    unread: unread?.n ?? 0,
    notifications: rows.map(r => ({
      id: Number(r.id),
      kind: r.kind,
      shareCode: r.share_code,
      // jsonb comes back parsed already.
      data: r.data ?? null,
      read: r.read,
      created: Number(r.created),
      actor: r.actor_id
        ? { id: r.actor_id, name: r.actor_name, username: r.actor_username, image: r.actor_image }
        : null,
    })),
  }
})
