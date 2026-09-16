// Rejects work done at import time anywhere in `dist/`.
//
// `"sideEffects": false` in package.json is a promise to every bundler that
// importing a module from this package and using none of it can be compiled
// away. A bundler takes that promise at its word — it does not verify it — so a
// single top-level call would mean either a dropped effect in someone's
// application or, if the bundler is being careful, a module that can never be
// shaken out.
//
// Nothing in the sources is supposed to run before a function is called: the
// segmenter is built lazily on first use and cached, and everything else is a
// declaration. This checks that what was built still looks like that.
//
// What may appear at the top level of a module: imports and exports, function
// and class declarations, and bindings to something inert — a literal, a
// template with no substitutions, a regular expression, an arrow or function
// expression, `undefined`, a negated number. What may not: a bare statement, a
// call, `new`, an assignment, a tagged template, `await`. A call that is known
// to be free of effects can be annotated `/* @__PURE__ */`, which is the same
// escape hatch bundlers honour.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));

const DECLARATIONS = new Set([
  'ClassDeclaration',
  'EmptyStatement',
  'ExportAllDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'FunctionDeclaration',
  'ImportDeclaration',
  'VariableDeclaration',
]);

// Evaluating any of these is how a module reaches outside itself.
const EFFECTS = new Set([
  'AssignmentExpression',
  'AwaitExpression',
  'CallExpression',
  'NewExpression',
  'TaggedTemplateExpression',
  'UpdateExpression',
  'YieldExpression',
]);

// A body that is not run until something calls it, so what it contains is the
// caller's problem rather than the importer's.
const DEFERRED = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

/** Files to check: every module that ends up in the published `dist/`. */
function modules(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...modules(path));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  // oxlint-disable-next-line require-array-sort-compare -- default lexicographic order is correct for paths
  return found.toSorted();
}

/**
 * Walk the parts of a node that are evaluated when the module is imported.
 *
 * Function bodies are skipped, and so are the values of instance fields, which
 * run per construction. A static field or block does run on import, so those are
 * walked like anything else.
 */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type !== 'string') return;
  if (DEFERRED.has(node.type)) return;
  if (node.type === 'PropertyDefinition' && node.static !== true) {
    walk(node.key, visit);
    return;
  }
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'type' && key !== 'loc' && key !== 'range') walk(value, visit);
  }
}

const files = modules(DIST);
const failures = [];

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const pure = [];
  const program = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    onComment: (block, text, start, end) => {
      if (block && text.trim() === '@__PURE__') pure.push(end);
    },
  });
  const name = relative(DIST, path);
  // Annotated means the comment ends immediately before the call, with nothing
  // but whitespace between them — a comment that happens to sit further down the
  // file annotates nothing.
  const annotated = (node) =>
    pure.some((end) => end <= node.start && source.slice(end, node.start).trim() === '');

  for (const statement of program.body) {
    if (!DECLARATIONS.has(statement.type)) {
      failures.push(`${name}:${statement.loc.start.line} ${statement.type} runs on import`);
      continue;
    }
    walk(statement, (node) => {
      if (!EFFECTS.has(node.type)) return;
      if ((node.type === 'CallExpression' || node.type === 'NewExpression') && annotated(node)) {
        return;
      }
      failures.push(`${name}:${node.loc.start.line} ${node.type} runs on import`);
    });
  }
}

if (failures.length > 0) {
  console.error('error: dist is declared side-effect free, but:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`${files.length} modules, no work at import time`);
