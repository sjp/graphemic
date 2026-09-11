// One function from a different unit, and one that reaches further into the
// internals than `length` does: the budget engine and the ellipsis helper.

import { truncate } from '@sjpnz/graphemic/utf8';

console.log(JSON.stringify(truncate(process.argv[2], 8)));
