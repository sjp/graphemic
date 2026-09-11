/**
 * The README, executed.
 *
 * Every `ts` fenced block in README.md is run here, and every line of the form
 *
 *     expression; // expected value — optional prose after an em dash
 *
 * is checked against what the library actually returns. Documentation that
 * claims a number is documentation that can be wrong, and a README is the one
 * file nobody re-reads after changing a boundary rule; this makes the claims
 * fail a test run instead of a reader.
 *
 * The samples are not copies of code that lives somewhere else — they are the
 * code, read from the file the reader reads. A block's `import` lines are
 * checked against the real entry points and then dropped: the bindings are
 * supplied here, so a sample can be written the way a caller would write it.
 *
 * The cost of that is a small parser, and a rule for anyone editing the README:
 * a `ts` block is executable, so a statement with a trailing `//` comment must
 * state a literal the comment can be compared against. Anything illustrative
 * rather than runnable belongs in a `text` block or in prose.
 */

import { readFileSync } from 'node:fs';
import { inspect, isDeepStrictEqual } from 'node:util';

import { describe, expect, it } from 'vitest';

import * as codePoints from './codePoints.js';
import * as codeUnits from './codeUnits.js';
import * as columns from './columns.js';
import * as graphemes from './graphemes.js';
import * as index from './index.js';
import * as utf8 from './utf8.js';

const README_PATH = new URL('../README.md', import.meta.url);
const readme = readFileSync(README_PATH, 'utf8');

/** The entry points a sample is allowed to import from, and what they hold. */
const ENTRY_POINTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  '@sjpnz/graphemic': index,
  '@sjpnz/graphemic/graphemes': graphemes,
  '@sjpnz/graphemic/code-points': codePoints,
  '@sjpnz/graphemic/code-units': codeUnits,
  '@sjpnz/graphemic/utf8': utf8,
  '@sjpnz/graphemic/columns': columns,
};

/** In scope for every sample, so short examples need no preamble. */
const AMBIENT: Readonly<Record<string, unknown>> = {
  graphemes,
  codePoints,
  codeUnits,
  utf8,
  columns,
  SegmenterUnavailableError: index.SegmenterUnavailableError,
  VERSION: index.VERSION,
};

interface Block {
  /** Line number in README.md of the block's first line of code. */
  readonly line: number;
  readonly code: readonly string[];
}

/** Every ```ts block, with the line number its contents start on. */
function tsBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.trim() !== '```ts') continue;

    const start = i + 1;
    let end = start;
    while (end < lines.length && lines[end]?.trim() !== '```') end += 1;

    blocks.push({ line: start + 1, code: lines.slice(start, end) });
    i = end;
  }

  return blocks;
}

const IMPORT = /^import\s+\{(?<names>[^}]+)\}\s+from\s+'(?<from>[^']+)';$/;
/** `import * as graphemes from '@sjpnz/graphemic/graphemes'` — a whole namespace. */
const NAMESPACE_IMPORT = /^import\s+\*\s+as\s+(?<alias>\w+)\s+from\s+'(?<from>[^']+)';$/;
/** A statement with a trailing comment: the code, then what it should produce. */
const CHECKED = /^(?<indent>\s*)(?<expression>\S.*?);\s*\/\/\s*(?<expected>.+)$/;
/** Anything that is not an expression, so its trailing comment is just a comment. */
const STATEMENT = /^(const|let|var|function|class|return|if|else|for|while|switch|try|catch)\b/;
/** Prose may follow the expected value after an em dash. */
const PROSE = ' — ';

/** Evaluates a literal from a comment, or `undefined` if it is not one. */
function literal(source: string): { readonly value: unknown } | undefined {
  try {
    // The alternative to evaluating the comment is writing a parser for every
    // literal a sample might state, which would then need its own tests.
    return { value: new Function(`return (${source});`)() as unknown };
  } catch {
    return undefined;
  }
}

interface Prepared {
  readonly body: string;
  readonly names: readonly string[];
  readonly values: readonly unknown[];
  readonly failures: readonly string[];
}

/**
 * Turns a block into a function body: imports validated and removed, checked
 * lines rewritten as calls to `check`.
 */
function prepare(block: Block): Prepared {
  const failures: string[] = [];
  const scope = new Map<string, unknown>(Object.entries(AMBIENT));
  const body: string[] = ["'use strict';"];

  block.code.forEach((line, offset) => {
    const lineNumber = block.line + offset;
    const where = `README.md:${lineNumber}`;

    const namespace = NAMESPACE_IMPORT.exec(line);
    if (namespace?.groups) {
      const module = ENTRY_POINTS[namespace.groups['from'] ?? ''];
      if (module === undefined) {
        failures.push(`${where}: '${namespace.groups['from']}' is not an entry point`);
        return;
      }
      scope.set(namespace.groups['alias'] ?? '', module);
      body.push('');
      return;
    }

    const imported = IMPORT.exec(line);
    if (imported?.groups) {
      const module = ENTRY_POINTS[imported.groups['from'] ?? ''];
      if (module === undefined) {
        failures.push(`${where}: '${imported.groups['from']}' is not an entry point`);
        return;
      }
      for (const specifier of (imported.groups['names'] ?? '').split(',')) {
        const [name, alias] = specifier.trim().split(/\s+as\s+/);
        if (name === undefined || name === '') continue;
        if (!(name in module)) {
          failures.push(`${where}: '${imported.groups['from']}' does not export ${name}`);
          continue;
        }
        scope.set(alias ?? name, module[name]);
      }
      // Imports are hoisted bindings, not statements; the sample runs without them.
      body.push('');
      return;
    }

    const checked = CHECKED.exec(line);
    const expression = checked?.groups?.['expression'] ?? '';
    if (!checked?.groups || STATEMENT.test(expression)) {
      body.push(line);
      return;
    }

    const comment = checked.groups['expected'] ?? '';
    const source = comment.split(PROSE)[0]?.trim() ?? '';
    if (literal(source) === undefined) {
      failures.push(
        `${where}: '${source}' is not a literal. Executable samples must state a value, ` +
          'or drop the trailing semicolon and let the comment be prose.',
      );
      body.push('');
      return;
    }

    body.push(`${checked.groups['indent']}check(${lineNumber}, (${expression}), (${source}));`);
  });

  return {
    body: body.join('\n'),
    names: [...scope.keys()],
    values: [...scope.values()],
    failures,
  };
}

/** Runs one block, returning everything that did not hold. */
function run(block: Block): string[] {
  const prepared = prepare(block);
  const failures = [...prepared.failures];

  const check = (line: number, actual: unknown, expected: unknown): void => {
    if (isDeepStrictEqual(actual, expected)) return;
    failures.push(`README.md:${line}: says ${inspect(expected)}, got ${inspect(actual)}`);
  };

  // The README is the source under test, so it is compiled and run as source.
  const sample = new Function(...prepared.names, 'check', prepared.body) as (
    ...args: unknown[]
  ) => void;
  sample(...prepared.values, check);

  return failures;
}

const blocks = tsBlocks(readme);

describe('README samples', () => {
  it('has blocks to run', () => {
    expect(blocks.length).toBeGreaterThan(10);
  });

  for (const block of blocks) {
    it(`holds at README.md:${block.line}`, () => {
      expect(run(block)).toEqual([]);
    });
  }
});

describe('README coverage', () => {
  const samples = blocks.flatMap((block) => block.code).join('\n');

  const namespaces = {
    graphemes,
    codePoints,
    codeUnits,
    utf8,
    columns,
  } as const;

  for (const [namespace, module] of Object.entries(namespaces)) {
    it(`shows every ${namespace} function in a sample`, () => {
      const missing = Object.keys(module).filter(
        (name) => !samples.includes(`${namespace}.${name}(`),
      );

      expect(missing).toEqual([]);
    });
  }

  it('shows the rest of the public surface', () => {
    const rest = Object.keys(index).filter((name) => !(name in namespaces));
    const missing = rest.filter((name) => !samples.includes(name));

    expect(missing).toEqual([]);
  });

  it('documents the boundary option and both entry-point styles', () => {
    expect(readme).toContain("{ boundary: 'codePoint' }");
    expect(readme).toContain("from '@sjpnz/graphemic'");
    expect(readme).toContain("from '@sjpnz/graphemic/graphemes'");
  });

  it('documents that columns is reachable only from its own subpath', () => {
    expect(readme).toContain("from '@sjpnz/graphemic/columns'");
    // If this ever appears, the root entry point grew a namespace it must not
    // have, or the README is telling people it did.
    expect(readme).not.toContain("columns } from '@sjpnz/graphemic'");
  });
});
