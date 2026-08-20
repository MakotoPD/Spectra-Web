// Deletes one account for good, from the admin panel. The clean-up itself
// lives in `utils/account.ts`, shared with the bulk test-account purge so the
// two can never disagree about what an account leaves behind.

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing id' })

  const user = await one<{ id: string }>('SELECT id FROM "user" WHERE id = $1', [id])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'no such user' })

  await deleteAccount(id)
  return { ok: true }
})
