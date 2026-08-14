// The "Share" tab's data: every pack this account has shared, who has it, and
// whether they are still on an older revision than the one that is up.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const rows = useShareDb()
    .prepare(`SELECT code, instance_id, name, mc_version, loader, mods, revision, created, expires, downloads
              FROM shares WHERE owner_id = ? AND expires > ? ORDER BY created DESC`)
    .all(me.id, Date.now()) as any[]
  if (!rows.length) return { shares: [] }

  const db = useAppDb()
  const recipients = db.prepare(`
    SELECT r.code, r.imported_revision, u.id, u.name, u.username, u.image
    FROM share_recipient r JOIN user u ON u.id = r.user_id
    WHERE r.code IN (${rows.map(() => '?').join(',')})
  `).all(...rows.map(r => r.code)) as any[]

  return {
    shares: rows.map(s => ({
      ...s,
      recipients: recipients
        .filter(r => r.code === s.code)
        .map(r => ({
          user: { id: r.id, name: r.name, username: r.username, image: r.image },
          importedRevision: r.imported_revision,
          outdated: (r.imported_revision ?? 0) < s.revision,
        })),
    })),
  }
})
