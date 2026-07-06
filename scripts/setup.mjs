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
import {
  PROXY_CONFIG_PATH,
  buildAliasBlock,
  detectShellRc,
  mergeProxyConfig,
  writeAliases,
} from "./integrations.mjs";

const GOALS = [
  { value: "balanced", label: "Balanced", hint: "sensible default — quality-first" },
  { value: "max_compression", label: "Maximum compression", hint: "squeeze hardest" },
  { value: "highest_quality", label: "Highest quality", hint: "gentlest touch" },
  { value: "lowest_cost", label: "Lowest cost", hint: "optimize for the bill" },
  { value: "fastest", label: "Fastest", hint: "fewest stages" },
];

/** The "where do you want miserly?" step — proxy wiring for coding agents. */
async function integrationsStep() {
  const clients = await p.multiselect({
    message:
      "Wire a coding agent through the miserly proxy? (optional — the studio always works on its own)",
    options: [
      { value: "claude", label: "Claude Code", hint: "ANTHROPIC_BASE_URL → local proxy" },
      { value: "codex", label: "Codex / Aider", hint: "OPENAI_BASE_URL → local proxy" },
      { value: "cursor", label: "Cursor (your own API key)", hint: "managed Cursor models can't be proxied" },
    ],
    required: false,
  });
  if (p.isCancel(clients) || clients.length === 0) return { clients: [] };

  const goal = await p.select({
    message: "Default compression goal for the proxy:",
    options: GOALS,
    initialValue: "balanced",
  });
  if (p.isCancel(goal)) return { clients: [] };

  // Persist proxy defaults without clobbering anything the user already set.
  mergeProxyConfig({ enabled: true, goal });
  p.note(
    [
      `Saved to ${PROXY_CONFIG_PATH}`,
      "Change any time: studio → Settings → Integrations (live, no restarts),",
      "or  curl -X PUT localhost:4141/miserly/config -d '{\"enabled\":false}'",
    ].join("\n"),
    "Proxy defaults",
  );

  // Resilient aliases for the CLI clients: prefer the proxy when it's up,
  // fall back to the real provider when it isn't — a wired client never breaks.
  const aliasClients = clients.filter((c) => c === "claude" || c === "codex");
  if (aliasClients.length > 0) {
    const rc = detectShellRc();
    let wrote = false;
    if (rc) {
      const add = await p.confirm({
        message: `Add resilient launcher aliases to ${rc}? (miserly-claude${
          aliasClients.includes("codex") ? ", miserly-codex, miserly-aider" : ""
        } — they use the proxy when it's running, the real API when it isn't)`,
        initialValue: true,
      });
      if (!p.isCancel(add) && add) {
        writeAliases(aliasClients, rc);
        wrote = true;
        p.note(`Added. Open a new terminal (or run: source ${rc}) to use them.`, "Aliases installed");
      }
    }
    if (!wrote) {
      p.note(
        buildAliasBlock(aliasClients) +
          "\n\n# …or one-off, without aliases:\n" +
          (clients.includes("claude")
            ? "ANTHROPIC_BASE_URL=http://localhost:4141 claude\n"
            : "") +
          (clients.includes("codex") ? "OPENAI_BASE_URL=http://localhost:4141/v1 codex" : ""),
        "Copy into your shell profile",
      );
    }
  }

  if (clients.includes("cursor")) {
    p.note(
      [
        "Cursor can only be proxied with YOUR OWN API key (its managed models",
        "route through Cursor's servers and cannot be redirected):",
        "",
        "  1. Cursor → Settings → Models",
        "  2. Enter your OpenAI API key",
        "  3. Enable “Override OpenAI Base URL” →  http://localhost:4141/v1",
        "  4. Verify with a big file read — the proxy terminal logs the savings",
      ].join("\n"),
      "Cursor (BYO key)",
    );
  }

  return { clients };
}

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

  const { clients } = await integrationsStep();

  p.outro(
    clients.length > 0
      ? "All set!  Studio:  npm run dev   ·   Proxy:  npm run proxy  (keep it running)"
      : "All set! Start the studio with:  npm run dev",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
