# @sjpnz/graphemic

Grapheme-safe string operations: length, slice, truncate, split, pad and search
that never break a user-visible character.

Every operation is performed in a unit the caller names explicitly —
`graphemes`, `codePoints`, `codeUnits` or `utf8` — and, by default, only ever
cuts on a grapheme boundary.

```sh
npm install @sjpnz/graphemic
```

Requires Node ≥ 22, or any browser with `Intl.Segmenter`.

## Status

Under construction. The API is not yet published; this README will be filled in
as the library takes shape.

## Licence

MIT © Simon Potter
