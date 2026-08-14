// Everything the friends panel needs in one round-trip: accepted friends plus
// the requests waiting in either direction.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const db = useAppDb()
  return { friends: friendsOf(db, me.id), ...pendingFor(db, me.id) }
})
