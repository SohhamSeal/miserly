// -----------------------------------------------------------------------------
// Agent-integration helpers for the setup wizard (`npm run setup`).
//
// Pure-ish, TTY-free functions so they can be tested without driving the
// interactive prompts: proxy-config merging, resilient alias generation, and
// shell-rc block upserts.
// -----------------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PROXY_CONFIG_PATH =
  process.env.MISERLY_CONFIG_PATH ?? join(homedir(), ".miserly", "config.json");

/**
 * Merge a patch into the proxy's persistent config without clobbering keys the
 * user already set (e.g. via the Integrations panel or curl).
 */
export function mergeProxyConfig(patch, configPath = PROXY_CONFIG_PATH) {
  let existing = {};
  try {
    if (existsSync(configPath)) existing = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    existing = {}; // unreadable → start fresh; the proxy validates on load anyway
  }
  const merged = { ...existing, ...patch };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

// Resilient launchers: prefer the proxy when it's up, fall back to the real
// provider when it isn't — so a wired client NEVER breaks because the proxy
// happens to be down. (Port 4141 is the default; if you run the proxy on
// another port, edit the alias after setup.)
const HEALTH = "curl -fsS -m 1 http://localhost:4141/miserly/health >/dev/null 2>&1";

export const ALIAS_DEFS = {
  claude: `alias miserly-claude='ANTHROPIC_BASE_URL=$(${HEALTH} && echo http://localhost:4141 || echo https://api.anthropic.com) claude'`,
  codex: `alias miserly-codex='OPENAI_BASE_URL=$(${HEALTH} && echo http://localhost:4141/v1 || echo https://api.openai.com/v1) codex'`,
  aider: `alias miserly-aider='OPENAI_BASE_URL=$(${HEALTH} && echo http://localhost:4141/v1 || echo https://api.openai.com/v1) aider'`,
};

const BEGIN = "# >>> miserly aliases >>> (managed by `npm run setup` — safe to delete)";
const END = "# <<< miserly aliases <<<";

/** The alias block for the chosen clients ("claude" | "codex" | "aider"). */
export function buildAliasBlock(clients) {
  const lines = [BEGIN];
  if (clients.includes("claude")) lines.push(ALIAS_DEFS.claude);
  if (clients.includes("codex")) lines.push(ALIAS_DEFS.codex, ALIAS_DEFS.aider);
  lines.push(END);
  return lines.join("\n");
}

/**
 * Insert or replace the managed alias block in shell-rc content. Re-running
 * setup updates the existing block in place instead of appending duplicates.
 */
export function upsertAliasBlock(content, block) {
  const begin = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (begin !== -1 && end !== -1 && end > begin) {
    return content.slice(0, begin) + block + content.slice(end + END.length);
  }
  const sep = content.length === 0 || content.endsWith("\n") ? "\n" : "\n\n";
  return content + sep + block + "\n";
}

/** Best-guess shell rc file; null when we shouldn't guess (e.g. fish). */
export function detectShellRc() {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return join(homedir(), ".zshrc");
  if (shell.includes("bash")) return join(homedir(), ".bashrc");
  return null;
}

/** Apply the alias block to a shell rc file on disk. */
export function writeAliases(clients, rcPath) {
  const current = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
  writeFileSync(rcPath, upsertAliasBlock(current, buildAliasBlock(clients)));
}
