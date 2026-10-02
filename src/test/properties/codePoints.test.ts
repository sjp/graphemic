/** The shared namespace properties, for `codePoints`; see `shared.ts`. */

import * as codePoints from '../../codePoints.js';
import { oracles } from '../corpus.js';
import { describeNamespace } from './shared.js';

describeNamespace({
  name: 'codePoints',
  measure: oracles.codePoints,
  length: codePoints.length,
  slice: codePoints.slice,
  truncate: codePoints.truncate,
  boundaries: ['grapheme', 'codePoint'],
});
