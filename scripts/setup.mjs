// =============================================================================
// miserly — interactive setup / installer
// =============================================================================
//
//   npm run setup
//
// Prompts which features to enable, installs ONLY the packages needed for the
// heavy ones you pick, writes your choices to `.env`, and regenerates the
// feature glue. Lean by default: heavy features (big downloads) start OFF.
// -----------------------------------------------------------------------------
import * as p from "@clack/prompts";
import { FEATURES, HEAVY_FEATURES } from "./features.config.mjs";
import {
  featurePackagesInstalled,
  npmInstall,
  npmUninstall,
  readEnv,
  updateEnv,
} from "./lib.mjs";
import { generate } from "./generate.mjs";

function truthy(value, fallback) {
  if (value == null || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

async function main() {
  console.clear();
  p.intro("⚖  miserly — setup");

  p.note(
    [
      "miserly runs lean by default. The core studio works with no big",
      "downloads. Heavy features are opt-in and pull extra npm packages:",
      "",
      ...HEAVY_FEATURES.map((f) => `  • ${f.label}  (${f.sizeLabel})`),
    ].join("\n"),
    "What this does",
  );

  // Pre-select based on the current .env (so re-running preserves choices),
  // falling back to each feature's default.
  const env = readEnv();
  const initialValues = FEATURES.filter((f) =>
    truthy(env[f.envVar], f.default),
  ).map((f) => f.key);

  const selected = await p.multiselect({
    message: "Select the features you want enabled:",
    options: FEATURES.map((f) => ({
      value: f.key,
      label: f.sizeLabel ? `${f.label}  (${f.sizeLabel})` : f.label,
      hint: f.description,
    })),
    initialValues,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel("Setup cancelled — nothing changed.");
    process.exit(0);
  }

  const chosen = new Set(selected);

  // Work out package installs / removals for heavy features only.
  const toInstall = [];
  const toUninstall = [];
  for (const f of HEAVY_FEATURES) {
    const installed = featurePackagesInstalled(f);
    if (chosen.has(f.key) && !installed) toInstall.push(...f.packages);
    if (!chosen.has(f.key) && installed) toUninstall.push(...f.packages);
  }

  if (toUninstall.length) {
    const s = p.spinner();
    s.start(`Removing unused packages: ${toUninstall.join(", ")}`);
    const code = await npmUninstall(toUninstall, () => {});
    s.stop(code === 0 ? "Removed unused packages" : "Could not remove some packages (continuing)");
  }

  if (toInstall.length) {
    const s = p.spinner();
    s.start(`Installing: ${toInstall.join(", ")} — this can take a moment`);
    const code = await npmInstall(toInstall, () => {});
    if (code !== 0) {
      s.stop("Install failed");
      p.cancel(`npm install failed (exit ${code}). Try running it manually:\n  npm install ${toInstall.join(" ")}`);
      process.exit(code);
    }
    s.stop("Packages installed");
  }

  // Persist every feature's on/off state to .env, then regenerate.
  const envUpdates = {};
  for (const f of FEATURES) envUpdates[f.envVar] = chosen.has(f.key) ? "true" : "false";
  updateEnv(envUpdates);
  generate();

  const enabledLabels = FEATURES.filter((f) => chosen.has(f.key)).map((f) => f.label);
  p.note(enabledLabels.join("\n") || "(only the always-on core)", "Enabled features");
  p.outro("All set! Start the studio with:  npm run dev");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
