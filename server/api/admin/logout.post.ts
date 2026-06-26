export default defineEventHandler((event) => {
  deleteCookie(event, 'spectra_admin', { path: '/' })
  return { ok: true }
})
