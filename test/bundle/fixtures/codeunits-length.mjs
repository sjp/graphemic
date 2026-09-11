// `codeUnits.length` is `s.length`. It needs no segmenter, and a bundle that
// mentions `Intl.Segmenter` at all has pulled in machinery this call cannot use.

import { length } from '@sjpnz/graphemic/code-units';

console.log(length(process.argv[2]));
