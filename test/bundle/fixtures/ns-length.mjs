// The style the README leads with: a namespace from the root entry point.
//
// Every fixture reads its input from `process.argv[2]` and prints the result,
// so nothing here can be dropped as unused and each bundle can be run.

import { graphemes } from '@sjpnz/graphemic';

console.log(graphemes.length(process.argv[2]));
