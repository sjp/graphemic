/**
 * What a caller actually ships.
 *
 * The package's claim is that bundle size grows with the functions used rather
 * than with the size of the library, and that claim cannot be checked by
 * reading the source: it depends on how a bundler treats a module namespace, on
 * the `exports` map resolving to the right file, and on no module doing work at
 * import time. So this suite bundles small programs the way a consumer would
 * and looks at the output.
 *
 * Three things make the measurement honest:
 *
 * - The fixtures import `@sjpnz/graphemic` **by name**, resolved through the
 *   package's own `exports` map — the same resolution a consumer gets, not a
 *   path into `src/`. What is being bundled is the built `dist/`, so this suite
 *   needs `npm run build` first and is not part of `npm test`.
 * - Both bundlers are measured after minifying with esbuild, so the byte
 *   numbers compare what each bundler *retained* rather than how it minifies.
 * - Every bundle is executed by `node`, because a bundle that is small because
 *   something needed went missing is not a win.
 *
 * Rollup is the strictest shaker and esbuild is the most widely deployed one;
 * webpack is not run, but its ESM semantics match Rollup's here. Vite is
 * covered by proxy: its production builds go through Rollup.
 *
 * **The known gap**: esbuild does not shake a namespace that reaches it through
 * a re-export (`export * as graphemes` in the root entry). It materialises the
 * namespace as an object of getters, which its analysis cannot see through, so
 * `graphemes.length` retains all of `graphemes`. Rollup and rolldown rewrite the
 * member access and drop the rest. That is what the `ns-length` budgets record,
 * and `retains the whole namespace under esbuild` is a canary: when esbuild
 * fixes it, that test fails and the README paragraph about it can go.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build, transform } from 'esbuild';
import { rollup } from 'rollup';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

type Bundler = 'esbuild' | 'rollup';

const BUNDLERS: readonly Bundler[] = ['esbuild', 'rollup'];

/** The input every fixture is run with: two ASCII letters, a space, one emoji. */
const INPUT = 'hi \u{1F44B}\u{1F3FD}';

interface Fixture {
  /** File name under `fixtures/`, without extension, and the key in `budgets.json`. */
  readonly name: string;
  /** What running the bundle with {@link INPUT} must print. */
  readonly prints: string;
}

const FIXTURES: readonly Fixture[] = [
  { name: 'codeunits-length', prints: '7' },
  { name: 'sub-length', prints: '4' },
  { name: 'ns-subpath-length', prints: '4' },
  { name: 'ns-length', prints: '4' },
  { name: 'sub-utf8-truncate', prints: '"hi "' },
  {
    name: 'ns-everything',
    prints:
      '["0.0.0","SegmenterUnavailableError",4,["h","i"," ","\u{1F44B}\u{1F3FD}"],' +
      '["h","i"," ","\u{1F44B}\u{1F3FD}"],"h","i \u{1F44B}\u{1F3FD}","hi",' +
      '["h"," \u{1F44B}\u{1F3FD}"],["hi"," \u{1F44B}\u{1F3FD}"],"\u{1F44B}\u{1F3FD} ih",' +
      '".hi \u{1F44B}\u{1F3FD}","hi \u{1F44B}\u{1F3FD}.",1,true,5,' +
      '["h","i"," ","\u{1F44B}","\u{1F3FD}"],["h","i"," ","\u{1F44B}","\u{1F3FD}"],"h",' +
      '"i \u{1F44B}\u{1F3FD}","hi",7,"i \u{1F44B}\u{1F3FD}","hi",11,"i \u{1F44B}\u{1F3FD}","hi"]',
  },
];

/**
 * Functions a caller who only measures strings must not be paying for. Every
 * one of them is reachable from the `graphemes` namespace but not from
 * `graphemes.length`, and half of them carry the machinery this library is
 * biggest for: the search matcher, the ellipsis budget, the range engine.
 */
const REMOVABLE = [
  'at',
  'chunk',
  'findMatches',
  'includes',
  'indexOf',
  'iterate',
  'padEnd',
  'padStart',
  'padding',
  'reverse',
  'slice',
  'sliceRange',
  'split',
  'toArray',
  'truncate',
  'truncateTo',
];

/**
 * Fixtures that ask for one grapheme function by two different spellings. They
 * must retain exactly the same set under every bundler: if the namespace
 * spelling ever costs more than the named-import one, that is the regression.
 */
const EQUIVALENT = ['sub-length', 'ns-subpath-length'];

const budgets: Record<string, Record<Bundler, number>> = JSON.parse(
  readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'),
);

interface Bundle {
  /** Bundled, unminified, comments removed — what the marker assertions read. */
  readonly code: string;
  /** Size of the minified bundle after gzip, which is what a user downloads. */
  readonly gzipped: number;
  /** Path to the minified bundle on disk, runnable with `node`. */
  readonly path: string;
}

const bundled = new Map<string, Bundle>();
let workspace: string;

const PACKAGE = /^@sjpnz\/graphemic/;

/**
 * Resolve the package by name through its own `exports` map.
 *
 * Node resolves a package's own name from inside it, so this is the consumer's
 * resolution — subpath conditions and all — rather than a path this test picked.
 */
function resolvePackage(specifier: string): string {
  return fileURLToPath(import.meta.resolve(specifier));
}

async function bundleWithEsbuild(entry: string, minify: boolean): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
    minify,
    plugins: [
      {
        name: 'graphemic',
        setup(builder) {
          builder.onResolve({ filter: PACKAGE }, (args) => ({ path: resolvePackage(args.path) }));
        },
      },
    ],
  });
  const output = result.outputFiles?.[0];
  if (output === undefined) throw new Error(`esbuild produced no output for ${entry}`);
  return output.text;
}

async function bundleWithRollup(entry: string, minify: boolean): Promise<string> {
  const warnings: string[] = [];
  const rolled = await rollup({
    input: entry,
    plugins: [
      {
        name: 'graphemic',
        resolveId: (source) => (PACKAGE.test(source) ? resolvePackage(source) : null),
      },
    ],
    onwarn: (warning) => warnings.push(`${warning.code}: ${warning.message}`),
  });
  const { output } = await rolled.generate({ format: 'esm' });
  // A warning here is usually "this import could not be resolved" — which would
  // leave the package external and make every size below meaningless.
  if (warnings.length > 0) throw new Error(`rollup warned for ${entry}: ${warnings.join('; ')}`);
  const [chunk] = output;
  return minify ? (await transform(chunk.code, { minify: true, format: 'esm' })).code : chunk.code;
}

function bundler(name: Bundler): (entry: string, minify: boolean) => Promise<string> {
  return name === 'esbuild' ? bundleWithEsbuild : bundleWithRollup;
}

/**
 * Top-level function and arrow bindings that survived, which is a readable
 * stand-in for "what is in this bundle". Bundlers rename on collision
 * (`length2`, `length$1`), and that is left alone: the sets being compared come
 * from the same bundler, so they collide the same way.
 */
function retainedNames(code: string): string[] {
  const declarations = [...code.matchAll(/function\s*\*?\s*([A-Za-z0-9_$]+)/g)];
  const arrows = [...code.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*\([^)]*\)\s*=>/g)];
  return [...declarations, ...arrows].map((match) => match[1] ?? '').toSorted();
}

function bundle(fixture: string, name: Bundler): Bundle {
  const found = bundled.get(`${fixture}:${name}`);
  if (found === undefined) throw new Error(`${fixture} was not bundled with ${name}`);
  return found;
}

/** Bundles one fixture with one bundler, twice: to read, and to measure. */
async function bundleFixture(fixture: string, name: Bundler): Promise<Bundle> {
  const entry = fileURLToPath(new URL(`./fixtures/${fixture}.mjs`, import.meta.url));
  const run = bundler(name);
  const [readable, minified] = await Promise.all([
    // Comments are stripped rather than left in place because the sources
    // discuss `reverse` and `padStart` in prose, and a marker assertion a doc
    // comment can fail is worse than no assertion at all.
    run(entry, false).then((code) => transform(code, { minifyWhitespace: true })),
    run(entry, true),
  ]);
  const path = join(workspace, `${fixture}.${name}.mjs`);
  writeFileSync(path, minified);
  return { code: readable.code, gzipped: gzipSync(minified).length, path };
}

beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'graphemic-bundle-'));
  const all = FIXTURES.flatMap(({ name: fixture }) =>
    BUNDLERS.map(
      async (name) => [`${fixture}:${name}`, await bundleFixture(fixture, name)] as const,
    ),
  );
  for (const [key, result] of await Promise.all(all)) bundled.set(key, result);
}, 120_000);

afterAll(() => {
  rmSync(workspace, { force: true, recursive: true });
});

describe.each(BUNDLERS)('%s', (name) => {
  describe.each(FIXTURES)('$name', ({ name: fixture, prints }) => {
    test('is within its byte budget', () => {
      const budget = budgets[fixture]?.[name];
      if (budget === undefined) throw new Error(`no budget recorded for ${fixture} under ${name}`);
      // The label carries the measurement, which is the part worth having when
      // this fails: a budget is either raised to it or the growth is explained.
      expect(bundle(fixture, name).gzipped, `${fixture} minified + gzipped`).toBeLessThanOrEqual(
        budget,
      );
    });

    test('runs', () => {
      const output = execFileSync(process.execPath, [bundle(fixture, name).path, INPUT], {
        encoding: 'utf8',
      });
      expect(output.trimEnd()).toBe(prints);
    });
  });

  test.each(EQUIVALENT)('%s ships only the function it asked for', (fixture) => {
    const { code } = bundle(fixture, name);
    for (const gone of REMOVABLE) {
      expect(retainedNames(code), `${gone} survived in ${fixture}`).not.toContain(gone);
    }
  });

  test('the namespace and named spellings of one function are the same bundle', () => {
    const named = retainedNames(bundle('sub-length', name).code);
    expect(retainedNames(bundle('ns-subpath-length', name).code)).toStrictEqual(named);
  });

  test('measuring in code units needs no segmenter', () => {
    const { code } = bundle('codeunits-length', name);
    expect(code).not.toContain('Intl.Segmenter');
    expect(retainedNames(code)).toStrictEqual(['length']);
  });
});

describe('the root namespace entry point', () => {
  test('shakes to the same bundle as a named import under rollup', () => {
    const root = retainedNames(bundle('ns-length', 'rollup').code);
    expect(root).toStrictEqual(retainedNames(bundle('sub-length', 'rollup').code));
  });

  // The canary described at the top of this file. It asserts the defect, so it
  // fails when esbuild learns to see through a re-exported namespace — at which
  // point the `ns-length` esbuild budget drops to the `sub-length` one and the
  // README stops having to warn anyone.
  test('retains the whole namespace under esbuild', () => {
    const root = retainedNames(bundle('ns-length', 'esbuild').code);
    expect(root).toContain('padStart');
    expect(root).toContain('findMatches');
  });
});
