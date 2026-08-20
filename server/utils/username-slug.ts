// Turning a display name into something better-auth's username plugin accepts.
//
// Split out from `username.ts` because it is the one part with no database
// underneath it: pure string work, so `test/username-check.mjs` can import and
// exercise the real function rather than a transcription of it.
//
// The rules are the plugin's, not ours: /^[a-zA-Z0-9_.]+$/ at 3–30 characters,
// lowercased before storing. A generated username that breaks them is worse
// than no username at all — the owner would be refused every time they tried to
// save their own profile.

export const MIN_LENGTH = 3
export const MAX_LENGTH = 30

// Letters that are not their base letter plus a mark, so NFKD leaves them
// whole and they would otherwise be replaced wholesale by an underscore. Most
// of a Polish or Scandinavian name survives decomposition; these do not.
const TRANSLITERATE: Record<string, string> = {
  ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ß: 'ss', æ: 'ae', Æ: 'ae',
}

/**
 * A display name reduced to a legal username.
 * "Michał Nowak" becomes `michal_nowak`, "  ..Bob.. " becomes `bob`.
 */
export function usernameBase(raw: string): string {
  const slug = [...raw.trim()]
    .map(ch => TRANSLITERATE[ch] ?? ch)
    .join('')
    // Decompose, then drop the marks: "é" becomes "e", "ą" becomes "a".
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/[._]{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, MAX_LENGTH)

  // A name written entirely outside the Latin alphabet ("МаксиМ", "たろう")
  // slugs down to nothing or to something too short. They still need an
  // account, so they get a generic base and let the numbering sort them out.
  return slug.length >= MIN_LENGTH ? slug : `player${slug}`.slice(0, MAX_LENGTH)
}

/** `base` with `suffix` appended, trimmed so the result still fits. */
export function withSuffix(base: string, suffix: string) {
  return base.slice(0, MAX_LENGTH - suffix.length) + suffix
}
