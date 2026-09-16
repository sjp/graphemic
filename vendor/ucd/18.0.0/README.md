# Unicode Character Database 18.0.0

Verbatim copies of three UCD data files, downloaded on 16 September 2026 from:

- <https://www.unicode.org/Public/18.0.0/ucd/EastAsianWidth.txt>
- <https://www.unicode.org/Public/18.0.0/ucd/extracted/DerivedGeneralCategory.txt>
- <https://www.unicode.org/Public/18.0.0/ucd/emoji/emoji-data.txt>

They are the input to `scripts/generate-width-tables.mjs`, which emits
`src/internal/width/tables.ts`. They are committed rather than fetched at build
time so that the generated tables depend on a version someone chose rather than
on the day the build ran, and so that a clean checkout can regenerate and verify
them with no network.

None of this directory is published: `files` in `package.json` is `dist` and the
changelog. See CONTRIBUTING.md for how to move to a newer UCD.

18.0.0 is the current UCD release. It is one version ahead of the Unicode 17.0
that Node 26's ICU implements, so these tables know about code points the
runtime's own `Intl.Segmenter` does not yet; the two will always drift one way
or the other, and `src/columns.ts` says what happens when they do.

## Licence

These files are © Unicode, Inc. and distributed under the Unicode License v3.
Each one carries the copyright notice in its header, which is retained here
unaltered. See <https://www.unicode.org/license.txt>.
