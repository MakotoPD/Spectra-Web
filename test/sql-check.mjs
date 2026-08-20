// Guards the one rule that keeps SQL injection out of this codebase: values
// reach Postgres as `$1, $2, …` parameters, never as text spliced into the
// statement. Run it with `pnpm check:sql` — it reads files, talks to nothing.
//
// Every SQL string is scanned for `${…}`. A handful of interpolations are
// legitimate (a column list that is a constant, generated placeholder tuples),
// so a line may opt out with a trailing `sql-safe:` comment saying why. Anything
// else fails the check.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'server'

// Anchored to the start of a line, because that is how SQL is written here and
// because prose is not: an error message reading "update the launcher" is not a
// statement, and an unanchored keyword list says it is.
const KEYWORDS = new RegExp(String.raw`^[\s(]*(`
  + [
    String.raw`SELECT\s`, String.raw`INSERT\s+INTO\s`, String.raw`UPDATE\s+["\w]`,
    String.raw`DELETE\s+FROM\s`, String.raw`CREATE\s+(TABLE|INDEX|UNIQUE)`,
    String.raw`ALTER\s+TABLE\s`, String.raw`WITH\s+\w+\s+AS`,
    // fragments, which is how a half-built statement would arrive
    String.raw`WHERE\s`, String.raw`VALUES\s*\(`, String.raw`ORDER\s+BY\s`, String.raw`SET\s+["\w]+\s*=`,
  ].join('|')
  + ')', 'im')

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (e.name.endsWith('.ts')) yield p
  }
}

/** Template literals in `src`, as { body, line } — nesting and all. */
function templates(src) {
  const out = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '`') continue
    let depth = 0
    let j = i + 1
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '\\') { j++; continue }
      if (c === '{' && src[j - 1] === '$') depth++
      else if (c === '}' && depth) depth--
      else if (c === '`' && !depth) break
    }
    out.push({ body: src.slice(i + 1, j), line: src.slice(0, i).split('\n').length })
    i = j
  }
  return out
}

/** The `${…}` expressions in a template body, at its top level. */
function interpolations(body) {
  const out = []
  for (let i = 0; i < body.length - 1; i++) {
    if (body[i] !== '$' || body[i + 1] !== '{') continue
    let depth = 1
    let j = i + 2
    for (; j < body.length && depth; j++) {
      if (body[j] === '{') depth++
      else if (body[j] === '}') depth--
    }
    out.push(body.slice(i + 2, j - 1).trim())
    i = j
  }
  return out
}

const problems = []

for (const file of files(ROOT)) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')

  for (const { body, line } of templates(src)) {
    if (!KEYWORDS.test(body)) continue
    const found = interpolations(body)
    if (!found.length) continue

    // The opt-out sits above the call, which is a line or three above the
    // backtick — `q<Row>(` and its type argument come in between.
    const near = lines.slice(Math.max(0, line - 4), line).join('\n')
    if (near.includes('sql-safe:')) continue

    for (const expr of new Set(found)) {
      problems.push(`${file}:${line} — \${${expr}} inside SQL`)
    }
  }
}

if (problems.length) {
  console.error('SQL built by string interpolation:\n')
  for (const p of problems) console.error('  ' + p)
  console.error('\nPass the value as a $n parameter. If the fragment is a constant\n'
    + 'and cannot carry user input, mark the line: // sql-safe: <why>')
  process.exit(1)
}

console.log('✓ every SQL value goes through $n parameters')
