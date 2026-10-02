/** The shared namespace properties, for `utf8`; see `shared.ts`. */

import * as utf8 from '../../utf8.js';
import { oracles } from '../corpus.js';
import { describeNamespace } from './shared.js';

describeNamespace({
  name: 'utf8',
  measure: oracles.utf8,
  length: utf8.length,
  slice: utf8.slice,
  truncate: utf8.truncate,
  boundaries: ['grapheme', 'codePoint'],
});
