// `.node-version` is the one source for the Node version (#778): CI reads it
// through setup-node's `node-version-file`. Two places cannot read a file and
// repeat the value, so this fails `pnpm check` when either drifts from it:
// `engines.node` in package.json and the `base` EAS build profile, which every
// other profile extends.
import { readFileSync } from 'node:fs';

const expected = readFileSync('.node-version', 'utf8').trim();
const pinned = {
  'package.json engines.node': JSON.parse(readFileSync('package.json', 'utf8')).engines?.node,
  'app/eas.json build.base.node': JSON.parse(readFileSync('app/eas.json', 'utf8')).build?.base
    ?.node,
};

const drift = Object.entries(pinned).filter(([, value]) => value !== expected);
for (const [where, value] of drift) {
  console.error(`${where} is ${JSON.stringify(value)}; .node-version says ${expected}`);
}
if (drift.length > 0) process.exit(1);
