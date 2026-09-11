# Benchmark results

Operations per second, higher is better, from `npm run bench`. Recorded by hand
rather than checked by CI: a shared runner is far too noisy to fail a build on,
and the numbers below are only worth anything alongside the machine that produced
them.

Re-record them when an optimisation lands or a Node major changes, and say which
machine did it. A row that moves by a factor is a finding; a row that moves by a
fifth is the room next door.

## Where these came from

|          |                                                                     |
| -------- | ------------------------------------------------------------------- |
| Date     | 11 September 2026                                                   |
| Machine  | arm64 devcontainer (Apple silicon under OrbStack), 8 cores, 11.7 GB |
| Node     | v26.7.0, V8 14.6, ICU 78.3, Unicode 17.0                            |
| Measured | `dist/`, the built output; 50 ms warmup, 200 ms per task            |

## How to read them

Each table is one operation over the six input shapes in `bench/inputs.ts`. The
first column is this package; the rest are the alternatives a caller would
otherwise reach for, and they are not all equivalent — `[...s]` yields code
points rather than characters, reversing code units mangles every emoji it
touches, and `String#slice` cuts wherever the offset falls. They are there for
scale, not as substitutes.

Two caveats worth knowing before drawing conclusions from a ratio:

- **The harness costs something.** Vitest routes every cross-module read through
  a getter, which adds roughly 40 ns per internal call. A plain-Node timing loop
  over the same build puts `graphemes.length` on short ASCII at 37M ops/s and
  `graphemes.padEnd` at 12.8M, against 9.12M and 3.96M here. The native baselines
  are local calls and pay none of it, so on short input the ratios below flatter
  them. Scaling behaviour and the non-ASCII rows are unaffected.
- **`String#slice` does not copy.** V8 hands back a view onto the original
  string, so the `String#slice` column is close to free and no implementation
  that has to look at the text can approach it.

## Results

### graphemes.split on a comma

| input       | `graphemes.split` | `String#split` | per call  |
| ----------- | ----------------- | -------------- | --------- |
| short ASCII | 6.47M             | 23.77M         | 154 ns    |
| long ASCII  | 29.17k            | 33.97k         | 34.28 µs  |
| short emoji | 337.26k           | 8.00M          | 2.97 µs   |
| long mixed  | 1.45k             | 27.26k         | 691.03 µs |

### graphemes.indexOf

| input               | `graphemes.indexOf` | `String#indexOf` | per call  |
| ------------------- | ------------------- | ---------------- | --------- |
| short ASCII         | 6.61M               | 24.13M           | 151 ns    |
| long ASCII          | 180.72k             | 24.54M           | 5.53 µs   |
| short emoji         | 348.80k             | 23.86M           | 2.87 µs   |
| long mixed          | 1.65k               | 3.36M            | 604.36 µs |
| a megabyte of ASCII | 1.86k               | 24.87M           | 536.25 µs |
| a megabyte of mixed | 14                  | 34.75k           | 73.5 ms   |

### graphemes.toArray

| input               | `graphemes.toArray` | `spread the string` | per call  |
| ------------------- | ------------------- | ------------------- | --------- |
| short ASCII         | 7.98M               | 7.75M               | 125 ns    |
| long ASCII          | 100.25k             | 23.05k              | 9.97 µs   |
| short emoji         | 628.13k             | 6.99M               | 1.59 µs   |
| long mixed          | 2.01k               | 20.51k              | 497.77 µs |
| a megabyte of ASCII | 772                 | 210                 | 1.3 ms    |
| a megabyte of mixed | 17                  | 188                 | 59.4 ms   |

### graphemes.reverse

| input               | `graphemes.reverse` | `reverse the code units` | per call  |
| ------------------- | ------------------- | ------------------------ | --------- |
| short ASCII         | 2.55M               | 3.22M                    | 392 ns    |
| long ASCII          | 11.14k              | 12.02k                   | 89.80 µs  |
| short emoji         | 559.45k             | 1.76M                    | 1.79 µs   |
| long mixed          | 1.67k               | 6.87k                    | 600.18 µs |
| a megabyte of ASCII | 104                 | 108                      | 9.6 ms    |
| a megabyte of mixed | 14                  | 63                       | 71.8 ms   |

### graphemes.chunk into 40

| input               | `graphemes.chunk` | per call  |
| ------------------- | ----------------- | --------- |
| short ASCII         | 6.04M             | 165 ns    |
| long ASCII          | 122.14k           | 8.19 µs   |
| short emoji         | 721.80k           | 1.39 µs   |
| long mixed          | 2.85k             | 351.12 µs |
| a megabyte of ASCII | 1.25k             | 803.05 µs |
| a megabyte of mixed | 27                | 37.1 ms   |

### graphemes.padEnd to 60

| input       | `graphemes.padEnd` | `String#padEnd` | per call |
| ----------- | ------------------ | --------------- | -------- |
| short ASCII | 3.96M              | 18.34M          | 253 ns   |
| short emoji | 375.60k            | 20.90M          | 2.66 µs  |

### graphemes.truncate to 10

| input               | `graphemes.truncate` | `slice the segment array` | per call  |
| ------------------- | -------------------- | ------------------------- | --------- |
| short ASCII         | 8.47M                | 467.36k                   | 118 ns    |
| long ASCII          | 7.53M                | 2.19k                     | 133 ns    |
| short emoji         | 641.83k              | 690.23k                   | 1.56 µs   |
| long mixed          | 185.94k              | 2.42k                     | 5.38 µs   |
| a megabyte of ASCII | 7.55M                | 12                        | 132 ns    |
| a megabyte of mixed | 3.20k                | 14                        | 312.67 µs |

### graphemes.truncate to 280 with an ellipsis

| input               | `graphemes.truncate` | `segment twice by hand` | per call  |
| ------------------- | -------------------- | ----------------------- | --------- |
| short ASCII         | 20.52M               | 460.61k                 | 49 ns     |
| long ASCII          | 1.73M                | 1.86k                   | 577 ns    |
| short emoji         | 19.32M               | 730.93k                 | 52 ns     |
| long mixed          | 24.29k               | 2.23k                   | 41.18 µs  |
| a megabyte of ASCII | 1.73M                | 12                      | 578 ns    |
| a megabyte of mixed | 1.71k                | 14                      | 584.62 µs |

### codeUnits.truncate to 100

| input               | `codeUnits.truncate` | `String#slice` | `accumulate whole graphemes` | per call  |
| ------------------- | -------------------- | -------------- | ---------------------------- | --------- |
| short ASCII         | 21.89M               | 27.06M         | 563.05k                      | 46 ns     |
| long ASCII          | 3.31M                | 25.46M         | 96.14k                       | 302 ns    |
| short emoji         | 21.17M               | 25.29M         | 830.46k                      | 47 ns     |
| long mixed          | 131.02k              | 27.42M         | 172.45k                      | 7.63 µs   |
| a megabyte of ASCII | 3.36M                | 24.92M         | 2.81k                        | 297 ns    |
| a megabyte of mixed | 8.57k                | 24.47M         | 721                          | 116.74 µs |

### utf8.truncate to 100 bytes

| input               | `utf8.truncate` | `utf8.truncate on code points` | per call  |
| ------------------- | --------------- | ------------------------------ | --------- |
| short ASCII         | 21.94M          | 20.69M                         | 46 ns     |
| long ASCII          | 3.14M           | 3.52M                          | 318 ns    |
| short emoji         | 21.08M          | 19.75M                         | 47 ns     |
| long mixed          | 89.35k          | 457.60k                        | 11.19 µs  |
| a megabyte of ASCII | 3.16M           | 3.24M                          | 317 ns    |
| a megabyte of mixed | 3.44k           | 457.59k                        | 290.74 µs |

### graphemes.length

| input               | `graphemes.length` | `spread the segments` | per call  |
| ------------------- | ------------------ | --------------------- | --------- |
| short ASCII         | 9.12M              | 456.27k               | 110 ns    |
| long ASCII          | 171.63k            | 1.96k                 | 5.83 µs   |
| short emoji         | 568.22k            | 760.59k               | 1.76 µs   |
| long mixed          | 2.25k              | 2.13k                 | 443.69 µs |
| a megabyte of ASCII | 1.85k              | 13                    | 539.82 µs |
| a megabyte of mixed | 22                 | 14                    | 44.9 ms   |

### codePoints.length

| input               | `codePoints.length` | `Array.from` | `charCodeAt scan` | `for-of iteration` | per call |
| ------------------- | ------------------- | ------------ | ----------------- | ------------------ | -------- |
| short ASCII         | 17.96M              | 7.41M        | 22.52M            | 10.25M             | 56 ns    |
| long ASCII          | 16.91M              | 22.68k       | 52.68k            | 23.32k             | 59 ns    |
| short emoji         | 6.49M               | 6.77M        | 14.67M            | 6.80M              | 154 ns   |
| long mixed          | 49.33k              | 20.14k       | 50.19k            | 19.10k             | 20.27 µs |
| a megabyte of ASCII | 18.30M              | 218          | 535               | 233                | 55 ns    |
| a megabyte of mixed | 487                 | 188          | 504               | 183                | 2.1 ms   |

### utf8.length

| input               | `utf8.length` | `Buffer.byteLength` | `TextEncoder` | `charCodeAt scan` | per call  |
| ------------------- | ------------- | ------------------- | ------------- | ----------------- | --------- |
| short ASCII         | 15.15M        | 20.81M              | 5.69M         | 22.71M            | 66 ns     |
| long ASCII          | 358.98k       | 2.56M               | 1.14M         | 61.81k            | 2.79 µs   |
| short emoji         | 6.17M         | 19.85M              | 4.07M         | 12.46M            | 162 ns    |
| long mixed          | 50.13k        | 924.96k             | 166.12k       | 48.51k            | 19.95 µs  |
| a megabyte of ASCII | 3.52k         | 28.14k              | 32.30k        | 515               | 283.99 µs |
| a megabyte of mixed | 500           | 10.14k              | 1.78k         | 501               | 2.0 ms    |

## What the numbers say

**The ASCII fast path is the difference between "usable in a request path" and
"rejected on performance grounds".** Measuring a megabyte of ASCII in graphemes
is 540 µs against 79 ms for segmenting it — 150 times — and every one of those
540 µs is the single scan that proves the string needs no segmenting. Truncating
that same megabyte to ten graphemes is 132 ns, because the scan stops one code
unit past the budget: it never reads the other 999,989.

**Early termination alone would not have been enough.** `Intl.Segmenter` charges
an O(n) setup before it yields a single segment — 0.3 ms for a megabyte, whatever
the budget — which is why `utf8.truncate` to 100 bytes costs 291 µs on a megabyte
of mixed text but 2 µs when the caller opts into code-point boundaries and no
segmenter is built at all. Stopping early bounds the walk, not the setup; only
not segmenting avoids both.

**Counting code points and bytes without the segmenter pays twice over.** A
`charCodeAt` scan beats `for…of` by 2.2× to 2.8× on every shape, which settles
the question of whether to keep it, and the surrogate and ASCII guards in front
of it turn the common cases into `s.length`: 55 ns for a megabyte, because V8 can
reject a two-byte character class against a one-byte string without scanning it.
Note that `Buffer.byteLength` still wins on large non-ASCII input by an order of
magnitude — it is C++ over the raw bytes — and it is the right answer for anyone
who already has Node and does not mind allocating. This package counts the same
number without a `TextEncoder` and without assuming a runtime.

**Truncating with an ellipsis is now the cheapest thing in the package**, at
49 ns on short ASCII against 2.2 µs for the two-pass version by hand, because
the marker is charged against the budget arithmetically instead of by segmenting
the string a second time.

### Where it still costs

- **Search scans the whole string even when the match is early.** `indexOf` on a
  megabyte of ASCII is 536 µs against 40 ns for `String#indexOf`, because a
  grapheme index is only meaningful if everything before the match has been
  accounted for. There is no bounded version of that check; a caller who wants
  the code-unit answer should use `String#indexOf` and knowingly accept what it
  reports.
- **Short calls carry a constant.** `padEnd` on short ASCII is 253 ns against
  55 ns for `String#padEnd`, and most of that gap is the harness: outside it the
  same pair is 78 ns against 45 ns. A floor remains either way, and it is one scan
  of the string and of the fill — nothing can establish that a cut is safe without
  looking at the text — so the operations whose native form is a single memcpy sit
  a small multiple away rather than inside the 2× the plan hoped for.
- **Two rows are slower than doing it by hand.** Measuring short emoji-heavy text
  in graphemes is 1.3× the cost of spreading the segments, and
  `codeUnits.truncate` on long mixed text is 1.3× the cost of accumulating
  segments into a string. Both are the price of laziness: the generators that let
  a budget stop early allocate per segment, which the eager versions do not. It
  is the right trade — the eager version is 1,200× slower on a megabyte of ASCII,
  where it segments the whole string to keep a hundred code units — but it is a
  real cost on small non-ASCII input.

### Against the plan

| Target                                       | Result                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `graphemes.truncate(1 MB, 10)` under 1 ms    | 132 ns on ASCII, 313 µs on mixed                                  |
| Early termination is O(budget), not O(n)     | Confirmed: 132 ns whether the string is 10 kB or 1 MB             |
| A manual surrogate-aware loop beats `for…of` | Confirmed, 2.2–2.8× on every shape; kept                          |
| ASCII within ~2× of the native equivalent    | Not met for the cheapest operations, and not reachable: see above |
