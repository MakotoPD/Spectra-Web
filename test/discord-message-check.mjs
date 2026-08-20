// Guards the rules that decide whether Discord accepts a message. Run it with
// `pnpm check:discord` — it imports one module and talks to nothing.
//
// Every case below is a rule from the API reference that, if broken, comes back
// as a 400 whose body is a nested map of field paths. The point of the
// validator is that the panel can say which field is wrong instead; the point of
// this file is that the validator keeps being right about which rules exist.
//
// `createError` is h3's, auto-imported inside Nitro and absent out here, so it
// is stubbed before the module loads. It is only ever called to throw.
globalThis.createError = ({ statusMessage }) => Object.assign(new Error(statusMessage), { statusMessage })

const { cleanEmbeds, cleanComponents, unhandledCustomIds } =
  await import('../server/utils/discord-message.ts')

const failures = []

function ok(label, fn) {
  try {
    fn()
  } catch (e) {
    failures.push(`${label}: threw "${e.message}"`)
  }
}

function rejects(label, fn) {
  try {
    fn()
    failures.push(`${label}: was accepted, expected a rejection`)
  } catch { /* the rejection is the pass */ }
}

function equal(label, actual, expected) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) failures.push(`${label}: got ${a}, expected ${b}`)
}

// --- embeds ----------------------------------------------------------------

equal('an untouched builder produces nothing',
  cleanEmbeds([{ color: '#5865f2', title: '', description: '', fields: [] }]), [])

equal('hex colour becomes an integer',
  cleanEmbeds([{ title: 'x', color: '#5865f2' }])[0].color, 0x5865f2)

equal('a flat image url is wrapped the way the API wants it',
  cleanEmbeds([{ title: 'x', image: 'https://example.com/a.png' }])[0].image,
  { url: 'https://example.com/a.png' })

equal('half-written fields are dropped, not sent',
  cleanEmbeds([{ title: 'x', fields: [{ name: 'a', value: '' }, { name: 'b', value: 'c' }] }])[0].fields,
  [{ name: 'b', value: 'c', inline: false }])

rejects('a title over 256 characters', () => cleanEmbeds([{ title: 'x'.repeat(257) }]))
rejects('a description over 4096', () => cleanEmbeds([{ description: 'x'.repeat(4097) }]))
rejects('more than 25 fields', () =>
  cleanEmbeds([{ title: 'x', fields: Array.from({ length: 26 }, () => ({ name: 'a', value: 'b' })) }]))
rejects('more than 10 embeds', () =>
  cleanEmbeds(Array.from({ length: 11 }, () => ({ title: 'x' }))))
rejects('an image url that is not a URL', () =>
  cleanEmbeds([{ title: 'x', image: 'not-a-url' }]))

// The limit people meet last: each embed fits, the message does not.
ok('three embeds just inside the 6000 budget', () =>
  cleanEmbeds(Array.from({ length: 3 }, () => ({ description: 'x'.repeat(1999) }))))
rejects('the same three, one character over', () =>
  cleanEmbeds(Array.from({ length: 3 }, () => ({ description: 'x'.repeat(2001) }))))

// --- components ------------------------------------------------------------

equal('an empty row is dropped rather than refused', cleanComponents([{ type: 1, components: [] }]), [])

const link = cleanComponents([{
  type: 1,
  components: [{ type: 2, style: 5, label: 'Docs', url: 'https://example.com', custom_id: 'leftover' }],
}])
// The two are mutually exclusive in the API, and a stale custom_id is exactly
// what switching a button from Primary to Link leaves behind.
equal('a link button keeps its url', link[0].components[0].url, 'https://example.com')
equal('a link button sheds any custom id', link[0].components[0].custom_id, undefined)

rejects('a link button with no url', () =>
  cleanComponents([{ type: 1, components: [{ type: 2, style: 5, label: 'x' }] }]))
rejects('a normal button with no custom id', () =>
  cleanComponents([{ type: 1, components: [{ type: 2, style: 1, label: 'x' }] }]))
rejects('a button with neither label nor emoji', () =>
  cleanComponents([{ type: 1, components: [{ type: 2, style: 1, custom_id: 'a' }] }]))
rejects('a label over 80 characters', () =>
  cleanComponents([{ type: 1, components: [{ type: 2, style: 1, custom_id: 'a', label: 'x'.repeat(81) }] }]))

rejects('six buttons in one row', () =>
  cleanComponents([{
    type: 1,
    components: Array.from({ length: 6 }, (_, i) => ({ type: 2, style: 1, label: 'b', custom_id: `b${i}` })),
  }]))

rejects('six rows', () =>
  cleanComponents(Array.from({ length: 6 }, () => ({
    type: 1, components: [{ type: 2, style: 1, label: 'b', custom_id: 'b' }],
  }))))

// A select fills its row — not a limit that can be worked around.
rejects('a dropdown sharing a row with a button', () =>
  cleanComponents([{
    type: 1,
    components: [
      { type: 3, custom_id: 'menu', options: [{ label: 'a', value: 'a' }] },
      { type: 2, style: 1, label: 'b', custom_id: 'b' },
    ],
  }]))
rejects('a dropdown with no options', () =>
  cleanComponents([{ type: 1, components: [{ type: 3, custom_id: 'menu', options: [] }] }]))
ok('a role dropdown needs no options', () =>
  cleanComponents([{ type: 1, components: [{ type: 6, custom_id: 'roles' }] }]))

// --- emoji on buttons ------------------------------------------------------
// Two different things share the `emoji` field, and the id is what tells them
// apart. Dropping it turns a server emoji into a lookup for a unicode character
// named "spectra_logo", which renders as nothing.

const custom = cleanComponents([{
  type: 1,
  components: [{
    type: 2, style: 1, label: 'Go', custom_id: 'a',
    emoji: { id: '123456789012345678', name: 'spectra', animated: true },
  }],
}])[0].components[0].emoji
equal('a server emoji keeps id, name and animated',
  custom, { id: '123456789012345678', name: 'spectra', animated: true })

equal('a unicode emoji stays a bare name',
  cleanComponents([{
    type: 1,
    components: [{ type: 2, style: 1, label: 'Go', custom_id: 'a', emoji: { name: '🎫' } }],
  }])[0].components[0].emoji,
  { name: '🎫' })

equal('a still emoji does not claim to be animated',
  cleanComponents([{
    type: 1,
    components: [{ type: 2, style: 1, label: 'Go', custom_id: 'a', emoji: { id: '1', name: 'x' } }],
  }])[0].components[0].emoji,
  { id: '1', name: 'x' })

// An emoji is enough on its own — Discord renders an icon-only button.
ok('a button with an emoji and no label', () =>
  cleanComponents([{
    type: 1, components: [{ type: 2, style: 1, custom_id: 'a', emoji: { name: '🎫' } }],
  }]))

// --- the warning -----------------------------------------------------------

const rows = cleanComponents([{
  type: 1,
  components: [
    { type: 2, style: 1, label: 'Open', custom_id: 'open_ticket' },
    { type: 2, style: 1, label: 'Other', custom_id: 'not_wired_up' },
    { type: 2, style: 5, label: 'Site', url: 'https://example.com' },
  ],
}])
// Link buttons need no handler at all, so they must never be flagged.
equal('only ids nothing listens for are flagged',
  unhandledCustomIds(rows), ['not_wired_up'])

if (failures.length) {
  console.error('server/utils/discord-message.ts\n' + failures.map(f => `  ✗ ${f}`).join('\n'))
  process.exit(1)
}

console.log('✓ embed limits, button style rules and row layout all hold')
