// Browser half of better-auth. One shared client for the whole app — creating
// it per component would mean a session fetch per component.

import { createAuthClient } from 'better-auth/vue'
import { oneTimeTokenClient, twoFactorClient, usernameClient } from 'better-auth/client/plugins'

const client = createAuthClient({
  plugins: [usernameClient(), twoFactorClient(), oneTimeTokenClient()],
})

export const useAuthClient = () => client
/** Reactive `{ data, isPending }` — `data.user` is null when signed out. */
export const useAuthSession = () => client.useSession()

/** Fallback avatar: the first letter, on a colour derived from the name. */
export function initialsAvatar(name?: string | null) {
  const label = (name || '?').trim()
  let hash = 0
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  return { letter: label[0]!.toUpperCase(), hue: hash }
}
