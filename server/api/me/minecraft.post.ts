// Links the player's Minecraft profile to their Spectra account, so friends can
// find each other by the name they actually use in game.
//
// The launcher sends the Minecraft access token it already holds — it is the
// only client that can get one, having gone through the Xbox chain with an
// approved client id. The name then comes from Mojang rather than from the
// client: a patched launcher claiming to be "Notch" gets nowhere, because this
// asks the game's own API who that token belongs to.
//
// The token is used once and thrown away. It is a key to somebody's game
// account and has no business being stored here.

const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

export default defineEventHandler(async (event) => {
  const me = await requireUser(event)
  const { token } = await readBody<{ token?: string }>(event) ?? {}
  if (!token || typeof token !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'missing token' })
  }

  let profile: { id?: string, name?: string }
  try {
    profile = await $fetch<{ id: string, name: string }>(PROFILE_URL, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch {
    // Expired token, or an account that does not own the game.
    throw createError({ statusCode: 401, statusMessage: 'Minecraft did not accept that session' })
  }
  if (!profile?.id || !profile?.name) {
    throw createError({ statusCode: 502, statusMessage: 'Minecraft returned no profile' })
  }

  const taken = await one<{ id: string }>(
    'SELECT id FROM "user" WHERE "mcUuid" = $1 AND id <> $2', [profile.id, me.id])
  if (taken) {
    throw createError({ statusCode: 409, statusMessage: 'that Minecraft profile is on another account' })
  }

  // Names change; this runs on every launcher start, so the row follows along.
  await exec('UPDATE "user" SET "mcUuid" = $1, "mcUsername" = $2 WHERE id = $3',
    [profile.id, profile.name, me.id])

  return { uuid: profile.id, username: profile.name }
})
