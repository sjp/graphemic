// Every public export, which makes this the upper bound: no caller can ship
// more of the package than this, whatever they import.

import {
  codePoints,
  codeUnits,
  graphemes,
  SegmenterUnavailableError,
  utf8,
  VERSION,
} from '@sjpnz/graphemic';

const s = process.argv[2];

console.log(
  JSON.stringify([
    VERSION,
    // The instance field rather than `SegmenterUnavailableError.name`: a
    // minifier renames the class, so the constructor's own name is not stable
    // output to compare against.
    new SegmenterUnavailableError().name,
    graphemes.length(s),
    [...graphemes.iterate(s)],
    graphemes.toArray(s),
    graphemes.at(s, 0),
    graphemes.slice(s, 1),
    graphemes.truncate(s, 2),
    graphemes.split(s, 'i'),
    graphemes.chunk(s, 2),
    graphemes.reverse(s),
    graphemes.padStart(s, 5, '.'),
    graphemes.padEnd(s, 5, '.'),
    graphemes.indexOf(s, 'i'),
    graphemes.includes(s, 'i'),
    codePoints.length(s),
    [...codePoints.iterate(s)],
    codePoints.toArray(s),
    codePoints.at(s, 0),
    codePoints.slice(s, 1),
    codePoints.truncate(s, 2),
    codeUnits.length(s),
    codeUnits.slice(s, 1),
    codeUnits.truncate(s, 2),
    utf8.length(s),
    utf8.slice(s, 1),
    utf8.truncate(s, 2),
  ]),
);
