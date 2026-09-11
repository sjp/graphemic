/**
 * The strings every benchmark runs over.
 *
 * The shapes matter more than the sizes. ASCII input is where the fast paths
 * apply and where the package has to be close to native or nobody will use it in
 * a request path; emoji-heavy input is where the segmenter is unavoidable and the
 * numbers show what correctness actually costs; the megabyte pair is where an
 * O(n) setup shows up, and where a budget of ten graphemes must not read a
 * million code units.
 *
 * Every fixture whose form is invisible in an editor is written with `\u`
 * escapes, as in the test corpus: copy-paste and formatters normalise a
 * decomposed sequence without anyone noticing.
 */

const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // waving hand + medium skin tone
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}'; // one grapheme
const FLAG_NZ = '\u{1F1F3}\u{1F1FF}';
const E_ACUTE = 'e\u0301'; // "e" + combining acute

const ASCII_SENTENCE = 'The quick brown fox jumps over the lazy dog. ';
const MIXED_SENTENCE = `Caf${E_ACUTE} run \u{1F3C3}\u{1F3FD} at 6am, \u4E2D\u6587 notes, ${FLAG_NZ} flag. `;

const ONE_MEGABYTE = 1_000_000;

/** A string of at least `size` code units, built by repeating `unit`. */
function grow(unit: string, size: number): string {
  return unit.repeat(Math.ceil(size / unit.length));
}

export interface Sample {
  readonly name: string;
  readonly s: string;
}

export const samples: readonly Sample[] = [
  { name: 'short ASCII', s: 'hello world, nice to meet you' },
  { name: 'long ASCII', s: grow(ASCII_SENTENCE, 10_000) },
  { name: 'short emoji', s: `hi ${WAVE_MEDIUM} ${FAMILY} ${FLAG_NZ} ok` },
  { name: 'long mixed', s: grow(MIXED_SENTENCE, 10_000) },
  { name: 'a megabyte of ASCII', s: grow(ASCII_SENTENCE, ONE_MEGABYTE) },
  { name: 'a megabyte of mixed', s: grow(MIXED_SENTENCE, ONE_MEGABYTE) },
];

/** Samples with a comma in them, for the ones that measure splitting. */
export const commaSeparated: readonly Sample[] = [
  { name: 'short ASCII', s: 'alpha,bravo,charlie,delta,echo' },
  { name: 'long ASCII', s: grow('alpha,bravo,charlie,delta,echo,', 10_000) },
  { name: 'short emoji', s: `alpha,${WAVE_MEDIUM},${FAMILY},${FLAG_NZ}` },
  { name: 'long mixed', s: grow(`alpha,${WAVE_MEDIUM},caf${E_ACUTE},\u4E2D\u6587,`, 10_000) },
];
