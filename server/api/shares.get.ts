// The "Share" tab's data: every pack this account has shared, who has it, and
// whether they are still on an older revision than the one that is up.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const now = Date.now()

  const rows = await q<any>(
    `SELECT code, instance_id, name, mc_version, loader, mods, revision, created, expires,
            downloads, size
     FROM shares WHERE owner_id = $1 AND expires > $2 AND uploaded = TRUE
     ORDER BY created DESC`,
    [me.id, now],
  )
  if (!rows.length) return { shares: [] }

  const recipients = await q<any>(
    `SELECT r.code, r.imported_revision, u.id, u.name, u.username, u.image
     FROM share_recipient r JOIN "user" u ON u.id = r.user_id
     WHERE r.code = ANY($1::text[])`,
    [rows.map(r => r.code)],
  )

  return {
    shares: rows.map(s => ({
      ...s,
      created: Number(s.created),
      expires: Number(s.expires),
      size: Number(s.size),
      // Renewing is only offered near the end — see share/[code]/extend.
      canExtend: Number(s.expires) - now <= EXTEND_WINDOW_MS,
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
