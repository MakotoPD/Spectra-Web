// Wipes the throwaway accounts left behind by testing.
//
// `example.com` is reserved by RFC 2606 precisely so that it can never belong
// to anyone, which is what makes deleting by domain safe here and would make
// the same button reckless for any other one.
//
// The match is a suffix on `@example.com`, not a substring: `bob@example.com`
// goes, `bob@example.com.someone-elses-domain.net` stays. Sibling reserved
// domains (example.net, example.org) are deliberately left alone — this button
// does what its label says and nothing more.
//
// Lives at /api/admin/test-accounts rather than under /users so it can never be
// confused with the `[id]` route that deletes a single account.

const TEST_DOMAIN = '@example.com'

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const targets = await q<{ id: string, email: string }>(
    'SELECT id, email FROM "user" WHERE lower(email) LIKE $1',
    [`%${TEST_DOMAIN}`],
  )

  const failed: string[] = []
  for (const target of targets) {
    // One bad account must not strand the rest — the whole point of the button
    // is that it finishes the job.
    try {
      await deleteAccount(target.id)
    } catch (e) {
      console.error('[admin] could not delete', target.email, e)
      failed.push(target.email)
    }
  }

  return { deleted: targets.length - failed.length, failed }
})
