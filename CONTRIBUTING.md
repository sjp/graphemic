# Contributing

Thanks for looking. This is a small package with a narrow remit — string
operations that name their unit and never cut through a character — and the
notes below are the things that are easy to get wrong in it rather than a
general guide to writing pull requests.

## Getting set up

Node ≥ 22 and npm. There are no other prerequisites and no runtime
dependencies.

```sh
npm ci
npm run check
```

`npm run check` is what CI runs: typecheck, lint, format check, tests. Run it
before opening a pull request and there should be no surprises.

| Command                 |                                                         |
| ----------------------- | ------------------------------------------------------- |
| `npm test`              | The suite, once                                         |
| `npm run test:watch`    | The suite, on every save                                |
| `npm run test:coverage` | With coverage; the thresholds are 100% and are enforced |
| `npm run typecheck`     | `tsc --noEmit` over everything                          |
| `npm run lint`          | oxlint                                                  |
| `npm run format`        | oxfmt, in place (`format:check` to only ask)            |
| `npm run build`         | `dist/`, ESM with declarations and source maps          |
| `npm run test:bundle`   | Builds, then bundles the package as a caller would      |
| `npm run bench`         | Benchmarks against the built output — see below         |

Tests are colocated: `src/graphemes.ts` is tested by `src/graphemes.test.ts`.
The cross-cutting suites live in `src/test/`, and `src/properties.test.ts`
holds the invariants that have to hold for every string.

## The rule the engine is built on

Everything in `src/internal/engine.ts` reports **code-unit offsets into the
original string**, and the caller does a single `s.slice(start, end)`. Nothing
builds a result by appending segments.

That is not a style preference. Concatenating grapheme by grapheme allocates an
intermediate string per character, which turns a linear walk into a quadratic
one on long input, and it makes it easy to return something that is not a
substring of the input at all. If a change here leaves you wanting to
accumulate a string, return the offsets and let the caller slice.

Two related invariants, both tested:

- **Ranges snap inward.** A range expressed in code units or bytes rarely lands
  on a character boundary, so the result is the whole segments _fully
  contained_ in it. Smaller than asked for is allowed; larger is a bug, and so
  is half a character.
- **The walk is lazy.** Truncating a megabyte to five characters segments five
  characters. Anything that measures the whole string before consulting the
  budget will show up as a benchmark regression of several orders of magnitude,
  not a few percent.

## What a caller ships

Two of the README's claims are about bundles rather than about behaviour: every
entry point tree-shakes, so size grows with the functions used and not with the
library, and importing the package does nothing until something is called.
Neither can be checked by reading the source, so `npm run test:bundle` checks
them against the built output. It is not part of `npm test` because it needs a
`dist/` to bundle.

Three rules for any module under `src/`, because `"sideEffects": false` in
package.json is a promise every bundler takes on trust:

- **Nothing runs at import time.** Allowed at the top level: declarations, and
  bindings to something inert — a literal, a regular expression, an arrow
  function, a `let` left undefined. Not a call, not `Object.freeze`, not
  `new Intl.Segmenter`. The segmenter is built on first use and cached, which is
  what lets `codeUnits.length` reach a caller with no segmenter in the bundle at
  all. `.github/scripts/check-side-effects.mjs` parses `dist/` and enforces
  this; an unavoidable call needs a `/* @__PURE__ */` annotation, the same
  escape hatch bundlers honour.
- **Import internals per function, never through a barrel.** A module that
  imports everything its functions between them might need hands the bundler one
  indivisible unit.
- **Prefer one more small helper to one more branch.** The ellipsis handling is
  its own function so that `slice` does not carry it.

`test/bundle/` bundles the programs in `fixtures/` — the two import styles from
the README, a namespace taken from a subpath, one named function, the one entry
point with Unicode tables behind it, and the entire public surface as an upper
bound — with esbuild and with Rollup, resolving
`@sjpnz/graphemic` by name through the package's own `exports` map so that the
map is part of what is being tested. Each bundle is then checked three ways:
functions nobody asked for are gone, the size is within budget, and running it
with `node` still prints the right answer.

`budgets.json` holds those budgets in minified, gzipped bytes, per fixture and
per bundler. They are recorded measurements with a little headroom rather than
targets anyone chose, and a failure means "a common import got bigger — was that
intended?". If it was, update the number in the same change, and if it was not,
the retained-name assertions usually name the function that came along for the
ride.

One budget is several times its siblings. esbuild cannot shake a namespace that
reaches it through a re-export — it becomes an object of getters — so the
`import { graphemes } from '@sjpnz/graphemic'` fixture retains all thirteen
grapheme functions under esbuild, and a test asserts that it does. That test is a
canary rather than an endorsement: when esbuild learns to see through it, the
assertion fails, the budget drops, and the README's warning about it can go.

## The width tables

`columns` is the only namespace with bulk data behind it, and the only one that
is a subpath and nothing else. Both facts are one decision: esbuild retains a
whole namespace that reaches it through a re-export, so `export * as columns`
from `src/index.ts` would put several kilobytes of Unicode tables in the bundle
of everyone who imported `graphemes.length`. `src/index.test.ts` asserts the
root entry point does not export it, and the bundle suite asserts that no
bundle without `@sjpnz/graphemic/columns` in it contains any of the table data.
Do not re-export it, even for symmetry.

The data flows one way:

```text
vendor/ucd/17.0.0/*.txt          committed, never fetched at build time
  → scripts/generate-width-tables.mjs
    → src/internal/width/tables.ts   committed, generated, do not edit
      → src/internal/width/ranges.ts decodes lazily, searches by binary search
        → src/internal/width/measure.ts  one grapheme → 0, 1 or 2 columns
```

Four properties are extracted — General_Category Mn/Me/Cf, East_Asian_Width
W/F, East_Asian_Width A, and Emoji_Presentation — each as a run of code point
ranges, delta-encoded into a string and decoded on first use into a
`Uint32Array` of edges. The whole lot is about 4 KB of source and 1.6 KB
gzipped in a bundle, with a per-file budget in
`.github/scripts/check-package.mjs` that fires if it ever stops being that.

To move to a newer UCD:

1. Download `EastAsianWidth.txt`, `extracted/DerivedGeneralCategory.txt` and
   `emoji/emoji-data.txt` into `vendor/ucd/<version>/`.
2. Change `UCD_VERSION` in `scripts/generate-width-tables.mjs`.
3. Run `npm run generate:tables` and commit the result.
4. Run `npm test`. `src/internal/width/tables.test.ts` regenerates the file and
   asserts no diff, so a stale table fails; the corpus fixtures carry a
   `columns` count each, so a width that changed fails by name.

The tables are committed rather than built so that a table change arrives in a
diff a reviewer reads, and so that a clean checkout needs no code generation to
test or publish.

The pinned version and the runtime's will drift — `Intl.Segmenter` follows
ICU's, not this — and that is documented rather than chased. A code point the
tables have never heard of measures 1, which is what a terminal whose font has
never heard of it will draw anyway.

## Adding a corpus fixture

`src/test/corpus.ts` is the shared list of strings that break naive code. Every
fixture carries its size in all five units, and those counts are **committed
literals** — computed once with the oracles at the bottom of that file and
written down, so that a future ICU or runtime change fails a test instead of
being silently re-derived.

To add one:

1. Give it a `name` nobody else has, and a comment above it saying what the
   string is in words. The tests report by name, and a failure reading
   `'กำ'` helps nobody.
2. Write the string with `\u` escapes if its form is invisible in an editor —
   combining marks, ZWJ, variation selectors, decomposed Hangul, zero-width and
   bidi characters, lone surrogates. Editors, formatters and plain copy-paste
   all NFC-normalise a decomposed sequence without anyone noticing, which turns
   the interesting fixture into the boring one. It has happened more than once
   in this file.
3. Fill in `graphemes`, `codePoints`, `codeUnits` and `utf8` by hand. If you
   are unsure, compute them once with `oracles` in a scratch script and paste
   the results — but do not make the test compute them, which is the whole
   point.
4. Fill in `columns` by hand too, and read it twice. It is the one count with
   no oracle behind it — there is no `Intl` anything that answers "how wide is
   this?", which is why the namespace exists — so the only thing holding it to
   anything is you and the rules in `src/internal/width/measure.ts`. Check it
   against a real terminal if it is not obvious.
5. Run `npm test`. `src/test/corpus.test.ts` checks the claimed counts against
   the oracles, so a typo fails immediately.

A fixture earns its place by breaking something a simpler string does not: a
new joining behaviour, a different byte width, an ill-formed sequence. Another
emoji that behaves like the three emoji already there is just more test time.

The Unicode Consortium's own grapheme break test is available too, against
whatever runtime you point it at. It needs the network, so it is opt-in:

```sh
UNICODE_CONFORMANCE=1 npm test
```

Property tests take `PROPERTY_RUNS` for the number of generated cases per
property — 500 locally, 5000 in CI. Raise it when you are hunting something
rare.

## The README is executed

Every `ts` fenced block in `README.md` is run by `src/readme.test.ts`, and
every line of the form

```text
expression; // expected value — optional prose after an em dash
```

is checked against what the library actually returns. So:

- A statement with a trailing comment must state a literal the comment can be
  compared against. Anything illustrative rather than runnable belongs in a
  `text` block or in prose.
- `import` lines are checked against the real entry points and then dropped;
  the four namespaces are always in scope.
- A new public function needs an example in the README, in a sample, or the
  coverage test fails.

## Benchmarks

`npm run bench` builds the package and measures `dist/`, not the sources. The
numbers in `bench/RESULTS.md` are recorded by hand rather than checked by CI: a
shared runner is far too noisy to fail a build on, and a number is only worth
anything next to the machine that produced it.

If you change something that could plausibly move them, re-record the affected
tables and say which machine and Node version did it. A row that moves by a
factor is a finding; a row that moves by a fifth is the room next door.

## Releasing

Releases are cut by hand; a pushed `v*` tag is the only thing that publishes.

```sh
# 1. Move the Unreleased section of CHANGELOG.md to x.y.z, dated today, and
#    add the two link definitions at the foot of the file. Commit it.
npm version x.y.z   # 2. bumps package.json, syncs VERSION, commits, tags
git push --follow-tags
```

Step 2 is the whole ceremony. `npm version` runs the `version` script, which
rewrites the `VERSION` constant in `src/index.ts` from package.json and stages
it, so the constant, the manifest and the tag are one commit and cannot drift.
`.github/scripts/check-version.mjs` checks all three agree — in CI on every
commit, and again in the publish workflow against the tag it is running for,
where a mismatch stops the release. npm versions are immutable, so that check
exists because there is no fixing it afterwards.

`.github/workflows/publish.yml` then re-runs everything CI runs against the
tagged tree and publishes with `--provenance`. No npm token exists: publishing
uses npm trusted publishing, which exchanges the workflow's OIDC identity for a
short-lived credential and signs the attestation linking the tarball to this
repository and commit. Nothing to store, nothing to leak, nothing to rotate.

Before the first release of a package, once:

1. Publish `0.1.0` from a logged-in local CLI (`npm publish --access public`).
   Trusted publishing can only be configured on a package that already exists,
   so this one tarball carries no provenance.
2. On npmjs.com → the package → Settings → Trusted publishers, add this
   repository and `publish.yml`.
3. Every release after that goes through the workflow. Confirm the provenance
   badge on the npm page of the first one that does.
4. Optionally give the `npm` environment a required reviewer in the repository
   settings, which holds a pushed tag until someone approves the publish.

`npm publish --dry-run` prints the tarball without uploading it, and
`.github/scripts/check-package.mjs` does the same with the assertions attached.

Version numbers say what they usually say, with one local rule: while the
package is `0.x` a breaking change bumps the minor, and `1.0.0` waits until the
namespaces and option names have survived a real project. A string segmenting
differently under a newer runtime is not a release — that is the runtime's
Unicode version changing, not this library's behaviour.

## Scope

The API is deliberately not symmetrical. `reverse`, `split`, `chunk`, `pad*`
and search live only on `graphemes`, because reordering or separating code
points tears combining marks and ZWJ sequences apart by construction, and
indexing text by byte offset is the habit the package exists to break. A pull
request adding `codePoints.reverse` will be turned down on those grounds rather
than on quality.

Several other things — word and sentence boundaries, RegExp separators for
`split`, a locale option, width-aware operations, a polyfill for runtimes with
no `Intl.Segmenter` — were considered for v1 and deliberately left out, each
because it is a larger question than it looks. If you are proposing one of
them, start by saying what has changed.

## Style

oxfmt decides formatting; do not argue with it, and do not hand-format around
it. Comments are for the reasoning that the code cannot state — why a fast path
is safe, what a boundary rule protects against — and the codebase leans on them
heavily. Public functions carry JSDoc with at least one `@example`, because
`declarationMap` means those tooltips are the documentation most users will
ever read.
