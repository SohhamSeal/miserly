// =============================================================================
// miserly — install a single feature (packages + env flag + regenerate)
// =============================================================================
//
// Usage: node scripts/install-feature.mjs <featureKey>
//
// Used both standalone and by the in-app "Install" button (the dev-server
// middleware in scripts/vite-plugin-installer.mjs shells out to this script and
// streams its output to the browser).
// -----------------------------------------------------------------------------
import { getFeature } from "./features.config.mjs";
import { npmInstall, updateEnv } from "./lib.mjs";
import { generate } from "./generate.mjs";

const key = process.argv[2];
const feature = getFeature(key);

if (!feature) {
  console.error(`Unknown feature: "${key}".`);
  process.exit(1);
}

console.log(`miserly: enabling "${feature.label}"…\n`);

if (feature.packages.length) {
  console.log(`Installing: ${feature.packages.join(", ")}`);
  const code = await npmInstall(feature.packages, (chunk) => process.stdout.write(chunk));
  if (code !== 0) {
    console.error(`\nnpm install failed (exit ${code}).`);
    process.exit(code);
  }
}

// Turn the flag on by default and regenerate the adapters/metadata.
updateEnv({ [feature.envVar]: "true" });
generate({ log: (m) => console.log(m) });

console.log(`\n✓ "${feature.label}" is ready.`);
