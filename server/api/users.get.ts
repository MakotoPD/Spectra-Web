// Type-ahead for "add a friend": who matches what is being typed.
//
// The point is not convenience but accuracy — a Minecraft name and a Spectra
// name are often different people's idea of "who you are", and sending a
// request into the dark is how you end up friends with a stranger.

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const query = String(getQuery(event).q ?? '')
  return { users: await searchUsers(query, me.id) }
})
