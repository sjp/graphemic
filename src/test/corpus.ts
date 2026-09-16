/**
 * Strings that break naive code, with their sizes in all four units.
 *
 * The counts are committed literals, deliberately. They were computed once with
 * the reference oracles below and written down, so that a future ICU or runtime
 * change that alters one of them fails a test instead of being silently
 * re-derived.
 *
 * Every fixture whose form is invisible in an editor - combining marks, ZWJ,
 * variation selectors, decomposed Hangul, zero-width and bidi characters, lone
 * surrogates - is written with `\u` escapes, never as a literal character.
 * Editors, formatters and plain copy-paste all NFC-normalise a decomposed
 * sequence without anyone noticing, which quietly turns the interesting fixture
 * into the boring one. That happened twice while assembling this file.
 */

// Test-only, so a Node import is fine here; nothing in the library itself
// reaches for a runtime global beyond `Intl`.
import { TextEncoder } from 'node:util';

export interface Fixture {
  readonly name: string;
  readonly s: string;
  readonly graphemes: number;
  readonly codePoints: number;
  readonly codeUnits: number;
  readonly utf8: number;
  /**
   * Terminal display columns.
   *
   * The one count with no oracle behind it: there is no `Intl` anything that
   * answers "how wide is this?", which is why the namespace exists. These are
   * derived by hand from the rules in `src/internal/width/measure.ts` and
   * checked against a real terminal where they were not obvious.
   */
  readonly columns: number;
}

export const corpus: readonly Fixture[] = [
  { name: 'empty', s: '', graphemes: 0, codePoints: 0, codeUnits: 0, utf8: 0, columns: 0 },
  { name: 'ascii', s: 'hello', graphemes: 5, codePoints: 5, codeUnits: 5, utf8: 5, columns: 5 },
  {
    // 'café £'
    name: 'latin-1',
    s: 'caf\u00E9 \u00A3',
    graphemes: 6,
    codePoints: 6,
    codeUnits: 6,
    utf8: 8,
    columns: 6,
  },
  {
    // 'u' + combining diaeresis
    name: 'u with combining diaeresis',
    s: 'u\u0308',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 2,
    utf8: 3,
    columns: 1,
  },
  {
    // the same character, precomposed
    name: 'precomposed u with diaeresis',
    s: '\u00FC',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 1,
    utf8: 2,
    columns: 1,
  },
  {
    name: 'waving hand',
    s: '\u{1F44B}',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 2,
    utf8: 4,
    columns: 2,
  },
  {
    // waving hand + medium skin tone modifier
    name: 'waving hand with skin tone',
    s: '\u{1F44B}\u{1F3FD}',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 4,
    utf8: 8,
    columns: 2,
  },
  {
    // man + ZWJ + baby bottle
    name: 'ZWJ man feeding baby',
    s: '\u{1F468}\u200D\u{1F37C}',
    graphemes: 1,
    codePoints: 3,
    codeUnits: 5,
    utf8: 11,
    columns: 2,
  },
  {
    // man + woman + girl + boy, joined by ZWJ
    name: 'ZWJ family of four',
    s: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
    graphemes: 1,
    codePoints: 7,
    codeUnits: 11,
    utf8: 25,
    columns: 2,
  },
  {
    // regional indicators A + U
    name: 'flag AU',
    s: '\u{1F1E6}\u{1F1FA}',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 4,
    utf8: 8,
    columns: 2,
  },
  {
    // AU followed by NZ: the segmenter must pair them up 2-and-2
    name: 'two flags',
    s: '\u{1F1E6}\u{1F1FA}\u{1F1F3}\u{1F1FF}',
    graphemes: 2,
    codePoints: 4,
    codeUnits: 8,
    utf8: 16,
    columns: 4,
  },
  {
    // digit one + variation selector-16 + combining enclosing keycap
    name: 'keycap digit one',
    s: '1\uFE0F\u20E3',
    graphemes: 1,
    codePoints: 3,
    codeUnits: 3,
    utf8: 7,
    columns: 2,
  },
  {
    // heavy black heart + variation selector-16
    name: 'heart with variation selector',
    s: '\u2764\uFE0F',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 2,
    utf8: 6,
    columns: 2,
  },
  {
    // ka + virama + ssa + vowel sign i
    name: 'Devanagari conjunct',
    s: '\u0915\u094D\u0937\u093F',
    graphemes: 1,
    codePoints: 4,
    codeUnits: 4,
    utf8: 12,
    columns: 1,
  },
  {
    // hieuh + a + nieun: one syllable spelled as three jamo
    name: 'Hangul jamo, decomposed',
    s: '\u1112\u1161\u11AB',
    graphemes: 1,
    codePoints: 3,
    codeUnits: 3,
    utf8: 9,
    columns: 2,
  },
  {
    // no no + mai tho + sara am
    name: 'Thai with tone mark',
    s: '\u0E19\u0E49\u0E33',
    graphemes: 1,
    codePoints: 3,
    codeUnits: 3,
    utf8: 9,
    columns: 1,
  },
  {
    // meem, hah, meem, dal with damma, fatha, fatha + shadda
    name: 'Arabic with tashkeel',
    s: '\u0645\u064F\u062D\u064E\u0645\u064E\u0651\u062F',
    graphemes: 4,
    codePoints: 8,
    codeUnits: 8,
    utf8: 16,
    columns: 4,
  },
  { name: 'CRLF', s: '\r\n', graphemes: 1, codePoints: 2, codeUnits: 2, utf8: 2, columns: 0 },
  { name: 'LF then CR', s: '\n\r', graphemes: 2, codePoints: 2, codeUnits: 2, utf8: 2, columns: 0 },
  {
    name: 'lone high surrogate',
    s: '\uD83D',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 1,
    utf8: 3,
    columns: 1,
  },
  {
    name: 'lone low surrogate',
    s: '\uDC4B',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 1,
    utf8: 3,
    columns: 1,
  },
  {
    // a low surrogate before a high one: never a pair
    name: 'reversed surrogate pair',
    s: '\uDC4B\uD83D',
    graphemes: 2,
    codePoints: 2,
    codeUnits: 2,
    utf8: 6,
    columns: 2,
  },
  {
    name: 'lone surrogate between letters',
    s: 'a\uD83Db',
    graphemes: 3,
    codePoints: 3,
    codeUnits: 3,
    utf8: 5,
    columns: 3,
  },
  {
    name: 'greeting with a wave',
    s: 'hello! \u{1F44B} nice to meet you',
    graphemes: 25,
    codePoints: 25,
    codeUnits: 26,
    utf8: 28,
    columns: 26,
  },
  {
    name: 'hi with a skin-toned wave',
    s: 'hi \u{1F44B}\u{1F3FD}',
    graphemes: 4,
    codePoints: 5,
    codeUnits: 7,
    utf8: 11,
    columns: 5,
  },
  {
    name: 'zero-width space',
    s: 'a\u200Bb',
    graphemes: 3,
    codePoints: 3,
    codeUnits: 3,
    utf8: 5,
    columns: 2,
  },
  {
    name: 'right-to-left mark',
    s: 'a\u200Fb',
    graphemes: 3,
    codePoints: 3,
    codeUnits: 3,
    utf8: 5,
    columns: 2,
  },
  {
    // 'Tokyo': the headline case for columns, and the one where every other
    // unit answers correctly and uselessly
    name: 'Tokyo in kanji',
    s: '\u6771\u4EAC',
    graphemes: 2,
    codePoints: 2,
    codeUnits: 2,
    utf8: 6,
    columns: 4,
  },
  {
    // the same kanji under a combining acute: still one character, still two
    // columns, because width is a property of the base
    name: 'kanji under a combining acute',
    s: '\u6771\u0301',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 2,
    utf8: 5,
    columns: 2,
  },
  {
    // fullwidth A (East_Asian_Width F, two columns) then halfwidth katakana A
    // (H, one) \u2014 the two forms a naive "is it CJK?" test gets backwards
    name: 'fullwidth and halfwidth forms',
    s: '\uFF21\uFF71',
    graphemes: 2,
    codePoints: 2,
    codeUnits: 2,
    utf8: 6,
    columns: 3,
  },
  {
    // the syllable the decomposed jamo above spell, as one code point
    name: 'Hangul syllable, precomposed',
    s: '\uD55C',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 1,
    utf8: 3,
    columns: 2,
  },
  {
    // box drawings light down and right, horizontal, down and left: all
    // East_Asian_Width A, so three columns by default and six under
    // `{ ambiguous: 2 }`
    name: 'box drawing',
    s: '\u250C\u2500\u2510',
    graphemes: 3,
    codePoints: 3,
    codeUnits: 3,
    utf8: 9,
    columns: 3,
  },
  {
    // a tab is zero columns, and the docs say to expand tabs before measuring
    name: 'tab between letters',
    s: 'a\tb',
    graphemes: 3,
    codePoints: 3,
    codeUnits: 3,
    utf8: 3,
    columns: 2,
  },
  {
    // pencil, whose Emoji_Presentation is No: one column as text
    name: 'bare pencil',
    s: '\u270F',
    graphemes: 1,
    codePoints: 1,
    codeUnits: 1,
    utf8: 3,
    columns: 1,
  },
  {
    // the same pencil asked for as an emoji with U+FE0F: two columns
    name: 'pencil with variation selector',
    s: '\u270F\uFE0F',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 2,
    utf8: 6,
    columns: 2,
  },
  {
    // Arabic number sign (a Prepend format character) then Arabic-Indic digit
    // one: one cluster whose base draws nothing and whose tail draws something,
    // which is why "is the base zero-width?" is not the question
    name: 'Arabic number sign with a digit',
    s: '\u0600\u0661',
    graphemes: 1,
    codePoints: 2,
    codeUnits: 2,
    utf8: 4,
    columns: 1,
  },
];

/**
 * Fixtures long enough to matter for cost rather than correctness.
 *
 * They are kept out of {@link corpus} deliberately: every namespace test and
 * every generated-input property runs the whole corpus, and a ten-thousand
 * character string in that list buys nothing a five character one does not
 * already prove, while slowing down the runs that do find bugs. Use these where
 * size itself is the point.
 */
export const longCorpus: readonly Fixture[] = [
  {
    name: 'ten thousand ASCII characters',
    s: 'x'.repeat(10_000),
    graphemes: 10_000,
    codePoints: 10_000,
    codeUnits: 10_000,
    utf8: 10_000,
    columns: 10_000,
  },
  {
    // two thousand skin-toned waving hands: 2 code points, 4 code units and
    // 8 bytes apiece
    name: 'two thousand skin-toned waves',
    s: '\u{1F44B}\u{1F3FD}'.repeat(2_000),
    graphemes: 2_000,
    codePoints: 4_000,
    codeUnits: 8_000,
    utf8: 16_000,
    columns: 4_000,
  },
];

/** The reference oracles the corpus counts were computed from. */
export const oracles = {
  graphemes: (s: string): number =>
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length,
  // oxlint-disable-next-line no-misused-spread -- code points are the reference this oracle counts
  codePoints: (s: string): number => [...s].length,
  codeUnits: (s: string): number => s.length,
  utf8: (s: string): number => new TextEncoder().encode(s).length,
} as const;
