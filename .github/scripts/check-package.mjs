// Inspects what `npm publish` would actually upload.
//
// Two things here are promises the library makes rather than incidental
// details, and both are easy to break without noticing:
//
//   1. No runtime dependencies. `Intl.Segmenter` is the dependency.
//   2. A tarball small enough that it cannot be carrying Unicode tables.
//      The budget is deliberately far above the real size, so it fires on a
//      change in kind (something large got pulled in) rather than on growth.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const UNPACKED_SIZE_BUDGET = 50_000;

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
