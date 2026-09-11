// A single named function from a subpath: the smallest a caller can ask for,
// and the baseline the other grapheme-length fixtures are compared against.

import { length } from '@sjpnz/graphemic/graphemes';

console.log(length(process.argv[2]));
