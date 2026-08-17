// Everything the friends panel needs in one round-trip: accepted friends plus
// the requests waiting in either direction.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const [friends, pending, mine] = await Promise.all([
    friendsOf(me.id),
    pendingFor(me.id),
    one<{ presence: string | null }>('SELECT presence FROM "user" WHERE id = $1', [me.id]),
  ])
  return { friends, ...pending, presence: mine?.presence ?? 'visible' }
})
