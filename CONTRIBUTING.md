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

## Adding a corpus fixture

`src/test/corpus.ts` is the shared list of strings that break naive code. Every
fixture carries its size in all four units, and those counts are **committed
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
4. Run `npm test`. `src/test/corpus.test.ts` checks the claimed counts against
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

## Scope

The API is deliberately not symmetrical. `reverse`, `split`, `chunk`, `pad*`
and search live only on `graphemes`, because reordering or separating code
points tears combining marks and ZWJ sequences apart by construction, and
indexing text by byte offset is the habit the package exists to break. A pull
request adding `codePoints.reverse` will be turned down on those grounds rather
than on quality.

`issues/016-future-ideas.md` records what was considered and deliberately left
out of v1, with the reasoning. If you are proposing something from that list,
start by saying what has changed.

## Style

oxfmt decides formatting; do not argue with it, and do not hand-format around
it. Comments are for the reasoning that the code cannot state — why a fast path
is safe, what a boundary rule protects against — and the codebase leans on them
heavily. Public functions carry JSDoc with at least one `@example`, because
`declarationMap` means those tooltips are the documentation most users will
ever read.
