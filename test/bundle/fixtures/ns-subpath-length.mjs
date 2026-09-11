// The same call site as `ns-length`, with the namespace taken from the unit's
// own entry point rather than from the root. This is the spelling that shakes
// under every bundler measured.

import * as graphemes from '@sjpnz/graphemic/graphemes';

console.log(graphemes.length(process.argv[2]));
