#!/usr/bin/env node
// Turns the vendored Unicode Character Database into `src/internal/width/tables.ts`.
//
// Run it with no arguments to rewrite that file, or with `--stdout` to print
// what it would write. `src/internal/width/tables.test.ts` uses the second form
// to assert the committed file is still what the data says, which is the point
// of committing it: a table change arrives in a diff a reviewer reads rather
// than in a build step nobody sees.
//
// The input is `vendor/ucd/<version>/`, committed alongside this script and
// never fetched here. A generator that downloads its own input is a generator
// whose output depends on the day it ran.
//
// Four properties are extracted, and they are exactly the four the width rules
// in `src/internal/width/measure.ts` ask about:
//
//   ZERO_WIDTH          General_Category is Mn, Me or Cf — combining marks,
//                       enclosing marks, and the format characters, which
//                       covers the variation selectors and the ZWJ.
//   WIDE                East_Asian_Width is W or F.
//   AMBIGUOUS           East_Asian_Width is A, which `{ ambiguous: 2 }` widens.
//   EMOJI_PRESENTATION  Emoji_Presentation is Yes: drawn as an emoji, and so
//                       two columns, without being asked with U+FE0F.
//
// All three UCD files share one format — `range ; value # comment`, where a
// range is `XXXX` or `XXXX..YYYY` — so one parser reads all of them.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The pinned UCD version.
 *
 * `Intl.Segmenter` follows the runtime's Unicode version instead, and the two
 * will drift. That is documented rather than chased — see the namespace doc
 * comment on `src/columns.ts` — but picking the version Node's current ICU
 * implements keeps the gap as small as it can be on the day of the pin.
 */
const UCD_VERSION = '17.0.0';

const VENDOR = new URL(`../vendor/ucd/${UCD_VERSION}/`, import.meta.url);
const OUTPUT = new URL('../src/internal/width/tables.ts', import.meta.url);

/** The base-64 digits of the encoding below, in value order. */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Set on a digit that is not the last of its number. */
const CONTINUE = 0b10_0000;
/** The five value bits of a digit. */
const MASK = 0b01_1111;

/**
 * Reads a UCD file, returning every range whose property value is `wanted`.
 *
 * Lines are `XXXX ; Value # comment` or `XXXX..YYYY ; Value # comment`. A
 * comment or an empty line carries nothing.
 */
function rangesWhere(file, wanted) {
  const text = readFileSync(new URL(file, VENDOR), 'utf8');
  const found = [];

  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0]?.trim();
    if (line === undefined || line === '') continue;

    const [codes, value] = line.split(';').map((field) => field.trim());
    if (codes === undefined || value === undefined || !wanted.has(value)) continue;

    const [from, to] = codes.split('..');
    const start = Number.parseInt(from, 16);
    found.push([start, to === undefined ? start : Number.parseInt(to, 16)]);
  }

  return found;
}

/**
 * Sorts ranges and glues together any that touch or overlap.
 *
 * The UCD lists a property in code point order already, but it lists it in the
 * granularity its own comments want — `0020 ; Na` and `0021..0023 ; Na` are two
 * lines and one range. Merging is what makes the table small, and it is what
 * makes the encoded gaps below non-zero.
 */
function merge(ranges) {
  const sorted = ranges.toSorted((a, b) => a[0] - b[0]);
  const merged = [];

  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
      continue;
    }
    merged.push([start, end]);
  }

  return merged;
}

/**
 * One non-negative integer as base-64 digits, least significant first, with the
 * continuation bit set on every digit but the last.
 *
 * The same variable-length encoding source maps use, minus their sign bit:
 * nothing here is ever negative. A value under 32 is one character, which is
 * what most of the gaps and nearly all of the lengths are.
 */
function encodeNumber(value) {
  let out = '';
  let rest = value;
  do {
    const digit = rest & MASK;
    rest >>>= 5;
    out += DIGITS[rest > 0 ? digit | CONTINUE : digit];
  } while (rest > 0);
  return out;
}

/**
 * Ranges as one string: for each, the gap from the end of the previous one and
 * then its own length, both delta-encoded.
 *
 * Deltas rather than absolute code points because a gap and a length are small
 * numbers where a code point is a large one — one digit instead of four for
 * most ranges — and because the decoder can then walk the string once and build
 * the array without ever sorting or comparing anything.
 */
function encode(ranges) {
  let out = '';
  let previousEnd = -1;

  for (const [start, end] of ranges) {
    out += encodeNumber(start - previousEnd - 1);
    out += encodeNumber(end - start);
    previousEnd = end;
  }

  return out;
}

/** Escapes a table for a single-quoted TypeScript string literal. */
function quote(encoded) {
  return `'${encoded.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * Wraps a long literal so the generated file is readable at 100 columns, as
 * concatenated chunks. A single 3000-character line is a diff nobody can read.
 *
 * The layout is the one `oxfmt` would produce — trailing `+`, one indent — so
 * that formatting the generated file is a no-op and `tables.test.ts` can
 * compare it to the generator's output byte for byte.
 */
function wrap(encoded, indent) {
  const width = 100 - indent.length - 4;
  const chunks = [];
  for (let i = 0; i < encoded.length; i += width) chunks.push(encoded.slice(i, i + width));
  return chunks.map(quote).join(` +\n${indent}`);
}

const TABLES = [
  {
    name: 'ZERO_WIDTH',
    doc: [
      'Code points that occupy no column of their own: General_Category Mn',
      '(non-spacing mark), Me (enclosing mark) or Cf (format), the last of which',
      'covers the variation selectors, the ZWJ and the bidi controls.',
    ],
    ranges: () => rangesWhere('DerivedGeneralCategory.txt', new Set(['Mn', 'Me', 'Cf'])),
  },
  {
    name: 'WIDE',
    doc: [
      'East_Asian_Width W (wide) or F (fullwidth): two columns in every terminal',
      'that draws them at all.',
    ],
    ranges: () => rangesWhere('EastAsianWidth.txt', new Set(['W', 'F'])),
  },
  {
    name: 'AMBIGUOUS',
    doc: [
      'East_Asian_Width A: one column by default, two under `{ ambiguous: 2 }`.',
      'Box drawing, Greek, Cyrillic and a great deal of punctuation live here,',
      'which is why the default is the narrow one.',
    ],
    ranges: () => rangesWhere('EastAsianWidth.txt', new Set(['A'])),
  },
  {
    name: 'EMOJI_PRESENTATION',
    doc: [
      'Emoji_Presentation Yes: drawn as an emoji, and so two columns, without',
      'U+FE0F being asked for. The text-default emoji — a dagger, a pencil — are',
      'deliberately absent; they are two columns only when a U+FE0F follows.',
    ],
    ranges: () => rangesWhere('emoji-data.txt', new Set(['Emoji_Presentation'])),
  },
];

const HEADER = `/**
 * Unicode width tables, generated from a pinned UCD. Do not edit.
 *
 * Regenerate with \`npm run generate:tables\`, which reads
 * \`vendor/ucd/${UCD_VERSION}/\` — committed alongside the generator, never
 * fetched at build time. \`tables.test.ts\` regenerates it and asserts no diff,
 * so a table change is something a reviewer sees rather than something a build
 * does.
 *
 * Each table is a run of code point ranges encoded as a string: for every
 * range, the gap from the end of the previous one and then its own length, each
 * written as base-64 digits, least significant first, with bit 0x20 set on
 * every digit but the last. \`decode\` in \`./ranges.js\` turns one into the
 * typed array it is searched in, on first use and once.
 *
 * A string rather than an array literal because it is a fifth of the source
 * size and, unlike an array of several thousand numbers, costs the JavaScript
 * engine nothing to parse until something asks for it.
 */

/** The UCD release these tables were generated from. */
export const UCD_VERSION = '${UCD_VERSION}';
`;

function generate() {
  const parts = [HEADER];

  for (const { name, doc, ranges } of TABLES) {
    const merged = merge(ranges());
    const encoded = encode(merged);
    const comment = doc.map((line) => ` * ${line}`).join('\n');
    parts.push(
      `\n/**\n${comment}\n *\n * ${merged.length} ranges.\n */\nexport const ${name} =\n  ${wrap(
        encoded,
        '  ',
      )};\n`,
    );
  }

  return parts.join('');
}

const source = generate();

if (process.argv.includes('--stdout')) {
  process.stdout.write(source);
} else {
  writeFileSync(OUTPUT, source);
  const path = fileURLToPath(OUTPUT);
  console.log(`${path} — ${source.length} bytes from UCD ${UCD_VERSION}`);
}
