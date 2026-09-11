# @sjpnz/graphemic

[![CI](https://github.com/sjp/graphemic/actions/workflows/ci.yml/badge.svg)](https://github.com/sjp/graphemic/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sjpnz/graphemic)](https://www.npmjs.com/package/@sjpnz/graphemic)

Grapheme-safe string operations: length, slice, truncate, split, pad and search
that never break a user-visible character.

Every operation names its unit — `graphemes`, `codePoints`, `codeUnits` or
`utf8` — so the question "which one did you mean?" is answered at the call site
instead of being inherited from whatever `.length` happens to count. Whichever
unit you measure in, the cut lands between whole characters.

```ts
import { codeUnits, graphemes } from '@sjpnz/graphemic';

'hello! 👋'.slice(0, 8); // 'hello! \uD83D' — half a waving hand, rendered as �
codeUnits.truncate('hello! 👋', 8); // 'hello! ' — still eight units, no broken character

'hi 👋🏽'.length; // 7
graphemes.length('hi 👋🏽'); // 4 — what a person counts
```

Zero dependencies, ESM-only, fully typed. `Intl.Segmenter` does the
segmentation; this package decides where the cut goes.

## Install

```sh
npm install @sjpnz/graphemic
```

Requires Node ≥ 22, or any browser with `Intl.Segmenter`. The package is
ESM-only: `import` works, `require` does not.

## Two import styles

Namespaces read well in application code:

```ts
import { graphemes, utf8 } from '@sjpnz/graphemic';

graphemes.truncate('hello! 👋 nice to meet you', 8, { ellipsis: '…' }); // 'hello! …'
utf8.truncate('hello! 👋 nice to meet you', 11); // 'hello! 👋' — the wave is four of those bytes
```

Subpaths give you plain functions, one entry point per unit:

```ts
import { truncate } from '@sjpnz/graphemic/graphemes';
import { truncate as truncateBytes } from '@sjpnz/graphemic/utf8';

truncate('hello! 👋 nice to meet you', 8); // 'hello! 👋'
truncateBytes('hello! 👋 nice to meet you', 11); // 'hello! 👋'
```

Both are backed by the same functions — there is one implementation of each —
and the subpath style tree-shakes under every bundler: a caller who only
measures strings ships neither the slicing machinery nor the search matcher,
which is around 0.6 KB gzipped against the 2.6 KB the whole library costs. The
entry points are `@sjpnz/graphemic/graphemes`, `/code-points`, `/code-units`
and `/utf8`.

The root entry point shakes too under Rollup, rolldown and webpack, which
rewrite `graphemes.length` into a reference to the function itself. **esbuild is
the exception**: a namespace that reaches it through a re-export becomes an
object of getters its analysis cannot see through, so
`import { graphemes } from '@sjpnz/graphemic'` keeps the whole namespace — about
2.0 KB gzipped rather than 0.6 KB. Vite is unaffected, because its production
builds go through Rollup. If esbuild or tsup bundles your application and those
bytes matter, take the namespace from the unit's own entry point instead: it
shakes everywhere and reads the same at the call site.

```ts
import * as graphemes from '@sjpnz/graphemic/graphemes';

graphemes.length('hi 👋🏽'); // 4
```

One caveat applies whichever entry point you use, and to every library that
ships namespaces: bundlers can only drop what they can see is unused.
`graphemes.truncate(s, 8)` is a static member access and shakes;
`graphemes[name](s, 8)`, `{ ...graphemes }` and passing `graphemes` around as a
value all retain the whole namespace. Use the named-function style if you need
to do any of that.

## Which unit do you mean?

| You are limited by…                                                                                      | Use          | Example                                           |
| -------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| What a person sees — UI, usernames, previews, anything with a design that says "40 characters"           | `graphemes`  | `graphemes.truncate(bio, 160, { ellipsis: '…' })` |
| UTF-16 code units — `nvarchar(N)` in SQL Server, a Java or C# `String` across an interface, most JS APIs | `codeUnits`  | `codeUnits.truncate(title, 100)`                  |
| UTF-8 bytes — `varchar(N)` in MySQL/Postgres/SQLite, HTTP headers, filenames, byte-capped payloads       | `utf8`       | `utf8.truncate(name, 255)`                        |
| Unicode code points — character counts on social platforms, `char_length()` in Postgres                  | `codePoints` | `codePoints.length(post) <= 280`                  |

If nobody imposed a limit on you, the unit you want is `graphemes`.

One character, four answers — the skin-toned waving hand `👋🏽`:

```text
grapheme      👋🏽                          graphemes.length  → 1
code points   U+1F44B U+1F3FD              codePoints.length → 2
code units    D83D DC4B D83C DFFD          codeUnits.length  → 4
UTF-8 bytes   F0 9F 91 8B F0 9F 8F BD      utf8.length       → 8
```

Nothing about that is exotic. It is the ordinary shape of text once it leaves
ASCII:

| String                                              | `.length` says | graphemes | code points | code units | UTF-8 bytes |
| --------------------------------------------------- | -------------- | --------- | ----------- | ---------- | ----------- |
| `'u\u0308'` — a `u` with a combining diaeresis, `ü` | 2              | 1         | 2           | 2          | 3           |
| `'👨\u200D🍼'` — a man feeding a baby               | 5              | 1         | 3           | 5          | 11          |
| `'🇦🇺'` — the flag of Australia                      | 4              | 1         | 2           | 4          | 8           |

```ts
graphemes.length('u\u0308'); // 1
codePoints.length('👨\u200D🍼'); // 3 — man, joiner, baby bottle
codeUnits.length('🇦🇺'); // 4
utf8.length('👨\u200D🍼'); // 11
```

## Boundary snapping

Measuring in code units does not mean cutting between them. Every namespace
counts in its own unit and, by default, only ever cuts on a **grapheme**
boundary — the range snaps _inward_, so the result is every whole character
that fits entirely inside the budget:

```ts
'hello! 👋 nice'.slice(0, 8); // 'hello! \uD83D' — the native cut lands inside the wave
codeUnits.truncate('hello! 👋 nice', 8); // 'hello! ' — seven units; the wave needs two
codeUnits.truncate('hello! 👋 nice', 9); // 'hello! 👋' — now it fits
```

The result may therefore be a unit or two under the budget. It is never over
it, and never half a character.

Pass `{ boundary: 'codePoint' }` to `slice` or `truncate` in the `codePoints`,
`codeUnits` and `utf8` namespaces to snap to code points instead. That still
never splits a surrogate pair, but it will cut a character apart at its joints —
dropping a skin-tone modifier, a combining mark, or half a flag:

```ts
codePoints.truncate('hi 👋🏽', 4); // 'hi ' — the wave keeps its skin tone or goes
codePoints.truncate('hi 👋🏽', 4, { boundary: 'codePoint' }); // 'hi 👋' — a differently coloured hand
```

Reach for it when a downstream system counts code points and will reject
anything over the line, and you would rather lose a modifier than a character.
Otherwise: almost never. The `graphemes` namespace has no `boundary` option at
all, because measuring in graphemes and cutting anywhere else is a
contradiction.

## API

Every function takes the string first and never mutates anything. Functions
that need to segment throw `SegmenterUnavailableError` on a runtime without
`Intl.Segmenter`; the ones that only count code points or bytes never throw.

### `graphemes`

The full set — for anything a person reads, this is the namespace you want.

| Signature                          |                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `length(s)`                        | How many characters, as a person would count them                       |
| `iterate(s)`                       | Lazily yields each character; segments only as far as you ask           |
| `toArray(s)`                       | Every character, as an array; `toArray(s).join('')` is `s`              |
| `at(s, index)`                     | The character at a grapheme index, or `undefined`; negatives count back |
| `slice(s, start?, end?)`           | `String#slice` with grapheme indices                                    |
| `truncate(s, max, options?)`       | At most `max` characters, optionally with an `ellipsis`                 |
| `split(s, separator, limit?)`      | `String#split`, but the separator must line up with whole characters    |
| `chunk(s, size)`                   | Consecutive pieces of `size` characters; rejoining reproduces `s`       |
| `reverse(s)`                       | Reversed character by character, leaving emoji and marks intact         |
| `padStart(s, targetLength, fill?)` | Pad to a width counted in characters, with a fill that is never cut     |
| `padEnd(s, targetLength, fill?)`   | The same, on the other end                                              |
| `indexOf(s, search, fromIndex?)`   | The grapheme index of the first whole-character match, or `-1`          |
| `includes(s, search, fromIndex?)`  | Whether such a match exists                                             |

```ts
graphemes.length('hi 👋🏽'); // 4
graphemes.iterate('hi 👋🏽').next().value; // 'h' — the rest is not segmented yet
graphemes.toArray('hi 👋🏽'); // ['h', 'i', ' ', '👋🏽']
graphemes.at('hi 👋🏽', -1); // '👋🏽'
graphemes.slice('hello! 👋 nice to meet you', 0, 8); // 'hello! 👋'
graphemes.truncate('hello! 👋 nice to meet you', 8, { ellipsis: '…' }); // 'hello! …'
graphemes.split('a,b,👋🏽', ','); // ['a', 'b', '👋🏽']
graphemes.chunk('hi 👋🏽!', 2); // ['hi', ' 👋🏽', '!']
graphemes.reverse('ab🇦🇺'); // '🇦🇺ba'
graphemes.padStart('👋🏽', 3, '.'); // '..👋🏽' — native padding adds nothing here
graphemes.padEnd('ab', 5, '👋🏽'); // 'ab👋🏽👋🏽👋🏽' — native padding cuts the fill in half
graphemes.indexOf('hi 👋🏽!', '!'); // 4 — native says 6
graphemes.includes('hi 👋🏽', '👋'); // false — half a character is not there
```

### `codePoints`

Counting in code points, cutting on characters.

| Signature                          |                                                         |
| ---------------------------------- | ------------------------------------------------------- |
| `length(s)`                        | How many code points; never throws                      |
| `iterate(s)`                       | What `for…of` over a string already yields, named       |
| `toArray(s)`                       | The equivalent of `Array.from(s)`                       |
| `at(s, index)`                     | The code point at an index, as a string, or `undefined` |
| `slice(s, start?, end?, options?)` | `String#slice` with code-point offsets                  |
| `truncate(s, max, options?)`       | At most `max` code points                               |

```ts
codePoints.length('hi 👋🏽'); // 5
codePoints.iterate('a👋').next().value; // 'a'
codePoints.toArray('hi 👋🏽'); // ['h', 'i', ' ', '👋', '🏽']
codePoints.at('hi 👋🏽', -1); // '🏽' — the modifier on its own
codePoints.slice('hi 👋🏽', 0, 4); // 'hi '
codePoints.truncate('hi 👋🏽', 4, { ellipsis: '…' }); // 'hi …'
```

### `codeUnits`

For budgets denominated in UTF-16 code units, whether or not anyone chose them.

| Signature                          |                                                      |
| ---------------------------------- | ---------------------------------------------------- |
| `length(s)`                        | Identical to `s.length`, with the unit said out loud |
| `slice(s, start?, end?, options?)` | `String#slice` with the cut snapped to a boundary    |
| `truncate(s, max, options?)`       | At most `max` code units, guaranteed                 |

```ts
codeUnits.length('hi 👋🏽'); // 7
codeUnits.slice('hello! 👋 nice', 0, 8); // 'hello! '
codeUnits.truncate('hello! 👋 nice to meet you', 9); // 'hello! 👋'
```

There is deliberately no `iterate`, `toArray` or `at` here, and none in `utf8`
either. Walking a string one code unit at a time is the habit this package
exists to break; use `graphemes` to visit characters.

### `utf8`

For byte budgets — the unit most storage and transport limits are really in.

| Signature                          |                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `length(s)`                        | Bytes when encoded as UTF-8; no `TextEncoder`, no allocation, never throws |
| `slice(s, start?, end?, options?)` | `String#slice` with byte offsets                                           |
| `truncate(s, max, options?)`       | At most `max` bytes, guaranteed                                            |

```ts
utf8.length('a£€👋'); // 10 — 1 + 2 + 3 + 4 bytes
utf8.slice('a👋b', 0, 5); // 'a👋'
utf8.truncate('hi 👋🏽', 7); // 'hi ' — the wave is four bytes and its modifier four more
```

### Also exported

`SegmenterUnavailableError`, thrown on first use when the runtime has no
`Intl.Segmenter`; `VERSION`; and the types `Boundary`, `BoundaryOptions` and
`TruncateOptions`.

```ts
import { SegmenterUnavailableError, VERSION } from '@sjpnz/graphemic';

try {
  graphemes.length('hi 👋🏽');
} catch (error) {
  // `error instanceof SegmenterUnavailableError` on a runtime without Intl.Segmenter
}

VERSION.split('.').length; // 3
```

## Behaviour worth knowing

**Truncation returns the same string when nothing was cut.** `truncate(s, max) === s`
is how you ask "did this fit?", and an ellipsis is only ever added when
something was actually removed.

```ts
const bio = 'short enough';
graphemes.truncate(bio, 100) === bio; // true
graphemes.truncate(bio, 100, { ellipsis: '…' }); // 'short enough' — no marker, nothing was cut
```

**The ellipsis is charged against the budget, in the namespace's own unit.** In
`graphemes` a `'…'` costs one and `'...'` costs three; in `utf8` that same `'…'`
costs three bytes. If the marker cannot fit `max` at all, the bare truncation
comes back without it — the budget is never exceeded and nothing throws.

```ts
graphemes.truncate('hello there', 2, { ellipsis: '...' }); // 'he' — no room for the dots
utf8.truncate('hello there', 4, { ellipsis: '…' }); // 'h…' — three of those four bytes are the marker
```

**Search matches whole characters, and does not normalise.** Both ends of a
match must line up with the segmentation of the string, which rules out the
whole family of "found a character inside another character" bugs. Matching is
otherwise exact: a precomposed character does not match its decomposed
spelling, because normalising would change the string — and with it the byte
and code-unit counts the other namespaces report. Normalise both sides first if
that is what you want.

```ts
graphemes.includes('re\u0301sume\u0301', 'e'); // false — native says true
graphemes.includes('re\u0301sume\u0301'.normalize('NFC'), '\u00E9'); // true
graphemes.indexOf('e\u0301x', 'e'); // -1 — the accented e is not an e
```

**Ill-formed input passes through unchanged.** A lone surrogate — the thing
naive slicing leaves behind — is treated as its own one-unit character, exactly
as `Intl.Segmenter` treats it. Nothing here repairs it or throws on it. Note
that `utf8.length` counts it as 3 bytes: that is what an encoder writes for it,
having substituted U+FFFD, and a byte budget has to be told the truth about what
will land on disk.

```ts
graphemes.length('a\uD83Dz'); // 3 — the lone surrogate is a character of its own
graphemes.slice('a\uD83Dz', 0, 2); // 'a\uD83D' — passed through, never repaired
utf8.length('\uD83D'); // 3 — the size of the replacement an encoder writes
```

**Numeric arguments follow `String.prototype` where there is a native method to
follow, and are strict where there is not.** `slice`, `at`, `padStart`,
`padEnd`, `indexOf` and `split`'s `limit` coerce exactly as their native
counterparts do — fractions truncate, `NaN` becomes 0, negatives count back
from the end. The APIs with no native counterpart, `truncate` and `chunk`,
reject anything that is not a non-negative (or, for `chunk`, positive) safe
integer, because a silently coerced budget is a budget nobody checked.

```ts
graphemes.slice('hi 👋🏽', 1.9); // 'i 👋🏽' — a fraction truncates
graphemes.at('hi 👋🏽', NaN); // 'h' — NaN becomes 0

try {
  graphemes.chunk('abc', 0);
} catch (error) {
  error.name; // 'RangeError'
}
```

**Padding counts the fill in characters too**, so a multi-character fill is
never cut through the middle and a character that will not fit is left out
entirely. One caveat is Unicode's rather than this library's: graphemes join
across a seam, so a fill beginning with a combining mark attaches to the
character before it, and two pieces of `n` and `m` characters can total
`n + m - 1`. Pad with things that stand alone — spaces, digits, box drawing,
most punctuation — and the arithmetic holds.

```ts
graphemes.padEnd('ab', 4, 'x👨\u200D🍼'); // 'abx👨\u200D🍼'
graphemes.padEnd('ab', 3, 'x👨\u200D🍼'); // 'abx' — the emoji did not fit, so it is not there
```

**Reversing is a display operation.** It reverses characters rather than
rendering text backwards: bidirectional text will not read right, and reversing
prose is rarely meaningful in any script. It is for labels and puzzles.

## Runtime support

| Runtime        | Requirement                                          |
| -------------- | ---------------------------------------------------- |
| Node.js        | ≥ 22. CI runs 22, 24 and 26                          |
| Deno, Bun      | Any version with `Intl.Segmenter`; not covered by CI |
| Chrome, Edge   | ≥ 87                                                 |
| Safari         | ≥ 14.1                                               |
| Firefox        | ≥ 125                                                |
| Anything older | `SegmenterUnavailableError` on first use             |

There is no polyfill and no silent fallback to code points, because a
code-point fallback would split emoji and combining marks — the exact bug this
package exists to prevent. Failing loudly is the only honest option.

Segmentation comes from the runtime's own ICU data, so the Unicode version is
the runtime's, not this package's: a character introduced after your runtime's
Unicode version may segment as several. Every CI run prints the versions it
used; the Node 26.7 that produced the benchmark numbers below ships ICU 78.3 and
Unicode 17.0. The repository also carries the Unicode Consortium's own grapheme
break test, run against whatever runtime you point it at:

```sh
UNICODE_CONFORMANCE=1 npm test
```

## Performance

Full numbers, with the machine that produced them, are in
[`bench/RESULTS.md`](bench/RESULTS.md). Two things carry most of the weight:

**Strings that need no segmenting do not get any.** ASCII without a carriage
return has one character per code unit, so every native offset is already a
boundary and the native method is used directly after a single scan. Measuring
a megabyte of ASCII in graphemes is 540 µs; segmenting the same megabyte is
79 ms.

**Segmentation stops at the budget.** Truncating that megabyte to ten
characters is 132 ns, because the walk ends one code unit past the tenth and
never reads the other 999,989 — the cost is the budget, not the string.

Where it still costs: `indexOf` has to account for everything before a match to
report a grapheme index, so it scans the whole string even when the match is
early. And the cheapest operations sit a small multiple away from their native
forms rather than within the 2× that would be nice — nothing can prove a cut is
safe without looking at the text.

## Why not…?

**…a `SafeString` class?** A fluent wrapper doubles the API surface and invites
the `.length` ambiguity all over again — is `SafeString#length` graphemes? — and
every string-taking API on the far side needs a `.toString()`. Naming the unit
at the call site was the point.

**…a locale option?** Grapheme segmentation is locale-independent under UAX #29;
the tailorings that exist are for word and sentence boundaries. One segmenter is
created lazily and cached, and there is no locale parameter to get wrong.

**…a polyfill?** See above: the failure mode of a fallback is silent corruption,
which is worse than an error naming the runtimes that work.

**…`codePoints.reverse`, or search in `utf8`?** Reversing or separating code
points reorders combining marks and tears ZWJ sequences apart by construction,
and a byte offset into text is not a position anyone means. There is no safe
version of those to offer, so they are not offered — `graphemes` has them.

## Further reading

- [Most string operations aren't safe](https://sjp.co.nz/posts/most-string-operations-arent-safe) — the argument this package implements
- [UAX #29: Unicode Text Segmentation](https://www.unicode.org/reports/tr29/) — where grapheme cluster boundaries are defined
- [`Intl.Segmenter` on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) — the platform API underneath
- [`StringInfo`](https://learn.microsoft.com/en-us/dotnet/api/system.globalization.stringinfo) — the same idea in .NET, for anyone arriving from C#

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Licence

MIT © Simon Potter
