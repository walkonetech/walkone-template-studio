// Writes a built-app suite's committed results-*.json in the repository's Prettier style, so `npm run format:check`
// stays clean on a fresh clone after any suite run (Phase 7B B5.1). The JSON values are unchanged; only whitespace and
// line wrapping follow .prettierrc. Synchronous on purpose: suites write their results at the very end and exit.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const prettierBin = require.resolve('prettier/bin/prettier.cjs', { paths: [root] })

/** Prettier-format JSON text exactly as `prettier --check` expects for `file` (uses the repo's .prettierrc). */
function formatResultsJson(text, file) {
  return execFileSync(process.execPath, [prettierBin, '--stdin-filepath', file], {
    cwd: root,
    input: text,
    encoding: 'utf8'
  })
}

/** Write `text` (already-serialized JSON) to research/editor-validation/<name>, formatted. */
function writeResults(name, text) {
  const file = path.join(__dirname, name)
  fs.writeFileSync(file, formatResultsJson(text, file))
}

module.exports = { formatResultsJson, writeResults }
