/** The shared namespace properties, for `codeUnits`; see `shared.ts`. */

import * as codeUnits from '../../codeUnits.js';
import { oracles } from '../corpus.js';
import { describeNamespace } from './shared.js';

describeNamespace({
  name: 'codeUnits',
  measure: oracles.codeUnits,
  length: codeUnits.length,
  slice: codeUnits.slice,
  truncate: codeUnits.truncate,
  boundaries: ['grapheme', 'codePoint'],
});
