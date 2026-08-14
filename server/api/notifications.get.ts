// The launcher polls this every ~30s while its window is open, passing the
// highest id it has already seen: `?since=<id>` returns only what is new.
// Cheap enough to poll — one indexed lookup, no joins into shares.db (the pack
// name travels in the notification's own `data` blob).

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const since = Number(getQuery(event).since) || 0
  const db = useAppDb()

  const rows = db
    .prepare(`
      SELECT n.id, n.kind, n.share_code, n.data, n.read, n.created,
             u.id AS actor_id, u.name AS actor_name, u.username AS actor_username, u.image AS actor_image
      FROM notification n
      LEFT JOIN user u ON u.id = n.actor_id
      WHERE n.user_id = ? AND n.id > ?
      ORDER BY n.id DESC LIMIT 50
    `)
    .all(me.id, since) as any[]

  const unread = (db.prepare('SELECT count(*) AS n FROM notification WHERE user_id = ? AND read = 0')
    .get(me.id) as { n: number }).n

  return {
    unread,
    notifications: rows.map(r => ({
      id: r.id,
      kind: r.kind,
      shareCode: r.share_code,
      data: r.data ? JSON.parse(r.data) : null,
      read: !!r.read,
      created: r.created,
      actor: r.actor_id
        ? { id: r.actor_id, name: r.actor_name, username: r.actor_username, image: r.actor_image }
        : null,
    })),
  }
})
