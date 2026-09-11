// The width tables, and the only fixture that should contain them.
//
// `columns` is the one namespace with bulk data behind it, which is why it is
// reachable from its own subpath and from nowhere else. This fixture is what a
// caller who actually wants it ships; `ns-everything` is what a caller who
// imports the whole root entry point ships, and the suite asserts that none of
// this appears there.

import { length } from '@sjpnz/graphemic/columns';

console.log(length(process.argv[2]));
