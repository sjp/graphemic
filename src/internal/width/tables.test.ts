/**
 * The committed tables are still what the vendored UCD says.
 *
 * Generated data can be produced at build time or committed, and this package
 * commits it: a table change is then something a reviewer sees in a diff rather
 * than something a build does silently, and a clean checkout needs no code
 * generation to test or publish. The cost of that choice is exactly one risk —
 * that the committed file and the generator drift apart — so this runs the
 * generator and compares.
 *
 * It shells out rather than importing the script, because running it the way a
 * contributor runs it is the thing worth checking, and because the generator is
 * plain JavaScript with nothing for a type to say about it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { UCD_VERSION } from './tables.js';

const GENERATOR = fileURLToPath(
  new URL('../../../scripts/generate-width-tables.mjs', import.meta.url),
);
const TABLES = fileURLToPath(new URL('./tables.ts', import.meta.url));

describe('the generated width tables', () => {
  it('are byte for byte what the generator produces', () => {
    const regenerated = execFileSync(process.execPath, [GENERATOR, '--stdout'], {
      encoding: 'utf8',
    });

    // A failure here is either "the vendored UCD changed and the tables were
    // not regenerated" or "the generator changed and the tables were not
    // regenerated". Both are fixed by `npm run generate:tables`, and both are
    // meant to be reviewed rather than applied.
    expect(readFileSync(TABLES, 'utf8')).toBe(regenerated);
  });

  it('name the UCD version they came from', () => {
    expect(readFileSync(GENERATOR, 'utf8')).toContain(`const UCD_VERSION = '${UCD_VERSION}'`);
  });
});
