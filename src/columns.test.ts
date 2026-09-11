import { describe, expect, it } from 'vitest';

import { length, padEnd, padStart, slice, truncate } from './columns.js';

/** 'Tokyo' — two graphemes, two code units, and four columns. */
const TOKYO = '東京';
/** 'Kyoto', which is the last two characters of '東京都'. */
const KYOTO = '京都';
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}'; // one grapheme, two columns, four code units
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
const HI_WAVE = `hi ${WAVE_MEDIUM}`; // five columns, seven code units
const ELLIPSIS = '…';
const WIDE_AMBIGUOUS = { ambiguous: 2 } as const;

describe('length', () => {
  it.each([
    ['the empty string', '', 0],
    ['ASCII', 'hello', 5],
    ['kanji', TOKYO, 4],
    ['an emoji with a skin tone', WAVE_MEDIUM, 2],
    ['a four-person family', FAMILY, 2],
    ['a decomposed e with acute', 'e\u0301', 1],
    ['a flag', '\u{1F1E6}\u{1F1FA}', 2],
    ['mixed ASCII and emoji', HI_WAVE, 5],
    ['a combining mark on its own', '\u0301', 0],
    ['a tab', 'a\tb', 2],
  ])('measures %s', (_label, s, expected) => {
    expect(length(s)).toBe(expected);
  });

  it('is the sum of its graphemes', () => {
    expect(length(TOKYO + HI_WAVE)).toBe(length(TOKYO) + length(HI_WAVE));
  });

  it('counts East Asian ambiguous characters as one by default', () => {
    expect(length('┌─┐')).toBe(3);
  });

  it('counts them as two when asked', () => {
    expect(length('┌─┐', WIDE_AMBIGUOUS)).toBe(6);
  });

  it('leaves unambiguous characters alone either way', () => {
    expect(length(TOKYO, WIDE_AMBIGUOUS)).toBe(4);
    expect(length('hello', WIDE_AMBIGUOUS)).toBe(5);
  });

  it('is not the grapheme count, the code unit count or the byte count', () => {
    // The whole reason the namespace exists: every other unit is right about
    // something else.
    expect(length(TOKYO)).toBe(4);
    expect(TOKYO.length).toBe(2);
  });
});

describe('slice', () => {
  it('cuts on column offsets', () => {
    expect(slice('東京都', 0, 4)).toBe(TOKYO);
    expect(slice('東京都', 2)).toBe(KYOTO);
  });

  it('snaps inward rather than splitting a wide character', () => {
    expect(slice('東京都', 0, 5)).toBe(TOKYO);
    expect(slice(TOKYO, 0, 1)).toBe('');
    expect(slice(TOKYO, 1, 3)).toBe('');
  });

  it('slices ASCII natively', () => {
    expect(slice('hello', 1, 3)).toBe('el');
  });

  it('counts negative offsets back from the end', () => {
    expect(slice('東京都', -2)).toBe('都');
    expect(slice(HI_WAVE, -2)).toBe(WAVE_MEDIUM);
  });

  it('takes the whole string with no arguments', () => {
    expect(slice(HI_WAVE)).toBe(HI_WAVE);
  });

  it('coerces its offsets as String#slice does', () => {
    expect(slice(TOKYO, Number.NaN, 2)).toBe('東');
    expect(slice(TOKYO, 0, Number.POSITIVE_INFINITY)).toBe(TOKYO);
    expect(slice(TOKYO, 3, 1)).toBe('');
  });

  it('measures the range in the width the options ask for', () => {
    const box = '┌─┐';
    expect(slice(box, 0, 2)).toBe('┌─');
    expect(slice(box, 0, 2, WIDE_AMBIGUOUS)).toBe('┌');
  });
});

describe('truncate', () => {
  it.each([
    ['fits exactly', '東京都', 6, '東京都'],
    ['drops the character that does not fit', '東京都', 4, TOKYO],
    ['leaves a column it cannot fill', '東京都', 5, TOKYO],
    ['keeps nothing when nothing fits', TOKYO, 1, ''],
    ['keeps nothing at zero', HI_WAVE, 0, ''],
    ['keeps ASCII by code unit', 'hello', 3, 'hel'],
    ['drops a whole emoji', HI_WAVE, 4, 'hi '],
    ['keeps a whole emoji', HI_WAVE, 5, HI_WAVE],
  ])('%s', (_label, s, max, expected) => {
    expect(truncate(s, max)).toBe(expected);
  });

  it('returns the string itself when it already fits', () => {
    const s = '東京都';
    expect(truncate(s, 6)).toBe(s);
    expect(truncate(s, 99)).toBe(s);
  });

  it('charges the ellipsis against the budget in columns', () => {
    expect(truncate('東京都', 4, { ellipsis: ELLIPSIS })).toBe(`東${ELLIPSIS}`);
    // A wide ellipsis costs two of the columns it is charged against.
    expect(truncate('東京都', 4, { ellipsis: '。' })).toBe('東。');
  });

  it('never exceeds the budget, even when the ellipsis cannot fit', () => {
    expect(truncate('hello', 2, { ellipsis: '...' })).toBe('he');
    expect(truncate('hello', 1, { ellipsis: '。' })).toBe('h');
  });

  it('keeps the ellipsis alone when only it fits', () => {
    expect(truncate(TOKYO, 1, { ellipsis: ELLIPSIS })).toBe(ELLIPSIS);
  });

  it('adds no ellipsis when nothing was cut', () => {
    expect(truncate('hello', 5, { ellipsis: ELLIPSIS })).toBe('hello');
  });

  it('charges the ellipsis in the width the options ask for', () => {
    // U+2026 is East_Asian_Width A, so the marker costs one column by default
    // and two when the caller says ambiguous characters are wide. Getting that
    // wrong would put a result one column past the budget it was given.
    expect(truncate('hello', 2, { ellipsis: ELLIPSIS })).toBe(`h${ELLIPSIS}`);
    expect(truncate('hello', 2, { ...WIDE_AMBIGUOUS, ellipsis: ELLIPSIS })).toBe(ELLIPSIS);
  });

  it('measures the budget in the width the options ask for', () => {
    const box = '┌─┐';
    expect(truncate(box, 3)).toBe(box);
    expect(truncate(box, 3, WIDE_AMBIGUOUS)).toBe('┌');
  });

  it('rejects a budget that is not a non-negative integer', () => {
    expect(() => truncate(HI_WAVE, -1)).toThrow(RangeError);
    expect(() => truncate(HI_WAVE, 1.5)).toThrow(RangeError);
    expect(() => truncate(HI_WAVE, Number.NaN)).toThrow(RangeError);
    expect(() => truncate(HI_WAVE, '4' as unknown as number)).toThrow(TypeError);
  });
});

describe.each([
  ['padStart', padStart],
  ['padEnd', padEnd],
] as const)('%s', (name, pad) => {
  const leading = name === 'padStart';

  it('pads with spaces by default', () => {
    expect(pad('42', 5)).toBe(leading ? '   42' : '42   ');
  });

  it('counts the string it is padding in columns, not graphemes', () => {
    // The bug the namespace exists to fix: 東京 is two graphemes and four
    // columns, so it needs four spaces to reach eight and not six.
    expect(pad(TOKYO, 8)).toBe(leading ? `    ${TOKYO}` : `${TOKYO}    `);
    expect(length(pad(TOKYO, 8))).toBe(8);
  });

  it('lines a wide string up with a narrow one', () => {
    expect(length(pad(TOKYO, 10))).toBe(length(pad('Tokyo', 10)));
  });

  it('counts an emoji as two columns', () => {
    expect(pad(WAVE_MEDIUM, 4, '.')).toBe(leading ? `..${WAVE_MEDIUM}` : `${WAVE_MEDIUM}..`);
  });

  it('never exceeds the target with a wide fill', () => {
    // Three of them would be six columns, which is two past the target.
    const padded = pad('ab', 7, '東');
    expect(padded).toBe(leading ? `東東ab` : `ab東東`);
    expect(length(padded)).toBe(6);
  });

  it('hits the target exactly when the fill divides it', () => {
    expect(length(pad('ab', 8, '東'))).toBe(8);
  });

  it('cycles a multi-character fill and cuts it between whole characters', () => {
    expect(pad('ab', 7, 'xy')).toBe(leading ? 'xyxyxab' : 'abxyxyx');
  });

  it('cycles a fill of mixed widths', () => {
    expect(pad('ab', 7, '東x')).toBe(leading ? '東x東ab' : 'ab東x東');
    expect(length(pad('ab', 7, '東x'))).toBe(7);
  });

  it('takes a prefix of the fill rather than the parts of it that fit', () => {
    // One column left over. 東 does not fit it, and the `x` behind 東 is not
    // reached for: the padding is a prefix of the repeated fill, holes and all.
    expect(pad('ab', 6, '東x')).toBe(leading ? '東xab' : 'ab東x');
    expect(length(pad('ab', 6, '東x'))).toBe(5);
  });

  it('returns the string when it is already wide enough', () => {
    expect(pad(TOKYO, 4)).toBe(TOKYO);
    expect(pad(TOKYO, 1)).toBe(TOKYO);
    expect(pad('hello', 2)).toBe('hello');
  });

  it('returns the string when the fill draws nothing', () => {
    expect(pad(TOKYO, 10, '')).toBe(TOKYO);
    expect(pad(TOKYO, 10, '\u0301')).toBe(TOKYO);
    expect(pad('ab', 10, '')).toBe('ab');
  });

  it('measures both halves in the width the options ask for', () => {
    expect(pad('─', 4, '.')).toBe(leading ? '...─' : '─...');
    expect(pad('─', 4, '.', WIDE_AMBIGUOUS)).toBe(leading ? '..─' : '─..');
  });

  it('coerces its target as the native pad does', () => {
    expect(pad(TOKYO, Number.NaN)).toBe(TOKYO);
    expect(pad(TOKYO, 5.9, '.')).toBe(leading ? `.${TOKYO}` : `${TOKYO}.`);
  });

  it('rejects a fill that is not a string', () => {
    expect(() => pad(TOKYO, 5, 42 as unknown as string)).toThrow(TypeError);
    expect(() => pad('ab', 5, 42 as unknown as string)).toThrow(/fill must be a string/);
  });

  it('leaves the string itself intact', () => {
    const padded = pad(FAMILY, 8, '-');
    expect(leading ? padded.endsWith(FAMILY) : padded.startsWith(FAMILY)).toBe(true);
    expect(length(padded)).toBe(8);
  });
});

describe('a table of mixed text', () => {
  it('lines up every row to the same width', () => {
    const rows = ['Tokyo', TOKYO, `${WAVE_MEDIUM} hi`, FAMILY, 'école', '┌─┐'];
    const widths = rows.map((row) => length(padEnd(row, 12) + '|'));

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBe(13);
  });
});
