// What the sign-in page needs to render itself: which social buttons are
// actually wired up, and the public Turnstile key (empty = captcha off).
export default defineEventHandler(() => ({
  providers: enabledProviders(),
  turnstileSiteKey: turnstileSiteKey(),
}))
