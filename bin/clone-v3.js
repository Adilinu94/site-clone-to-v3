#!/usr/bin/env node
/**
 * npm-bin shim. After `npm run build`, this file calls into dist/cli/clone-v3.js.
 * In dev mode (tsx), bin/clone-v3.js is not used — `npm run dev` invokes tsx directly.
 */
import('../dist/cli/clone-v3.js').catch((err) => {
  console.error('Failed to load clone-v3. Did you run `npm run build`?');
  console.error(err);
  process.exit(1);
});
