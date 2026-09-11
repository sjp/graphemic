// Inspects what `npm publish` would actually upload.
//
// Two things here are promises the library makes rather than incidental
// details, and both are easy to break without noticing:
//
//   1. No runtime dependencies. `Intl.Segmenter` is the dependency.
//   2. A tarball small enough that the Unicode data in it is still the few
//      kilobytes of width tables it is supposed to be. Both budgets are
//      deliberately far above the real sizes, so they fire on a change in kind
//      (a whole UCD property got vendored into `dist`) rather than on growth.
//
// The width tables are the only bulk data the package ships, and the only part
// of it whose size is a design decision rather than a consequence: they are
// delta-encoded strings, decoded lazily, and reachable from the `./columns`
// entry point alone. If that file starts measuring in tens of kilobytes,
// something has changed the encoding or widened what is extracted.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const UNPACKED_SIZE_BUDGET = 300_000;
const TABLES_PATH = 'dist/internal/width/tables.js';
const TABLES_SIZE_BUDGET = 8_000;

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const packed = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const [tarball] = JSON.parse(packed);

const failures = [];

const dependencies = Object.keys(manifest.dependencies ?? {});
if (dependencies.length > 0) {
  failures.push(`expected no runtime dependencies, found: ${dependencies.join(', ')}`);
}

if (tarball.unpackedSize > UNPACKED_SIZE_BUDGET) {
  failures.push(
    `unpacked size ${tarball.unpackedSize} bytes exceeds the ${UNPACKED_SIZE_BUDGET} byte budget`,
  );
}

const tables = tarball.files.find((file) => file.path === TABLES_PATH);
if (tables === undefined) {
  failures.push(`${TABLES_PATH} is not in the tarball; the columns entry point needs it`);
} else if (tables.size > TABLES_SIZE_BUDGET) {
  failures.push(
    `${TABLES_PATH} is ${tables.size} bytes, past the ${TABLES_SIZE_BUDGET} byte budget`,
  );
}

const widest = Math.max(...tarball.files.map((file) => file.path.length));
console.log(`${tarball.filename} — ${tarball.files.length} files, ${tarball.unpackedSize} bytes`);
for (const file of tarball.files) {
  console.log(`  ${file.path.padEnd(widest)}  ${String(file.size).padStart(7)}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`error: ${failure}`);
  }
  process.exit(1);
}
