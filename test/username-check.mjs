// Guards the shape of a generated username. Run it with `pnpm check:username`
// — it imports one pure function and talks to nothing.
//
// The rule it protects: better-auth's username plugin validates against
// /^[a-zA-Z0-9_.]+$/ at 3–30 characters. A generated username that fails that
// is worse than none at all — the account silently gets one it cannot use, and
// its owner is refused every time they try to save their own profile.
//
// Imported straight from the TypeScript source: Node strips the types, and
// `username-slug.ts` deliberately has no imports of its own so this needs no
// bundler to stand up.
import { MAX_LENGTH, MIN_LENGTH, usernameBase, withSuffix } from '../server/utils/username-slug.ts'

const cases = [
  ['Michał Nowak', 'michal_nowak'],
  ['Zoë Müller', 'zoe_muller'],
  ['  ..Bob.. ', 'bob'],
  ['UPPER Case', 'upper_case'],
  ['ok.name_1', 'ok.name_1'],
  ['Ørsted Æther', 'orsted_aether'],
  // Too short, or nothing survives the Latin filter — these still need an
  // account, so they fall back to a generic base rather than to an empty string.
  ['a', 'playera'],
  ['', 'player'],
  ['МаксиМ', 'player'],
  ['たろう', 'player'],
  // Long names are cut to fit, not rejected.
  ['x'.repeat(60), 'x'.repeat(MAX_LENGTH)],
]

const failures = []

for (const [input, expected] of cases) {
  const actual = usernameBase(input)
  if (actual !== expected) {
    failures.push(`${JSON.stringify(input)} → ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

// The invariant that actually matters, checked against every case rather than
// only where someone wrote an expectation by hand — including the numbered
// variants, which is where a name already at the length limit could overflow.
for (const [input] of cases) {
  for (const candidate of [usernameBase(input), withSuffix(usernameBase(input), '21')]) {
    if (!/^[a-z0-9_.]+$/.test(candidate)) {
      failures.push(`${JSON.stringify(input)} → ${candidate} has characters the plugin rejects`)
    }
    if (candidate.length < MIN_LENGTH || candidate.length > MAX_LENGTH) {
      failures.push(`${JSON.stringify(input)} → ${candidate} is ${candidate.length} characters`)
    }
  }
}

if (failures.length) {
  console.error('server/utils/username-slug.ts\n' + failures.map(f => `  ✗ ${f}`).join('\n'))
  process.exit(1)
}

console.log(`✓ ${cases.length} names slug to a shape better-auth accepts`)
