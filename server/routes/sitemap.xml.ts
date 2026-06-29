// sitemap.xml — small static landing page with localized variants.
// EN lives at /, PL at /pl (prefix_except_default). Each URL lists its
// hreflang alternates so search engines pair the language versions.
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')

  // [path, hreflang] for every indexable, localized page.
  const locales: Array<[string, string]> = [
    ['/', 'en-US'],
    ['/pl', 'pl-PL']
  ]
  const lastmod = new Date().toISOString().slice(0, 10)

  const alternates = locales
    .map(([path, lang]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${siteUrl}${path}" />`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/" />`)
    .join('\n')

  const urls = locales
    .map(([path]) => `  <url>
    <loc>${siteUrl}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === '/' ? '1.0' : '0.9'}</priority>
${alternates}
  </url>`)
    .join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`
})
