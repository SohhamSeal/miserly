// -----------------------------------------------------------------------------
// Agent-integration helpers for the setup wizard (`npm run setup`).
//
// Pure-ish, TTY-free functions so they can be tested without driving the
// interactive prompts: proxy-config merging, resilient alias generation, and
// shell-rc block upserts.
// -----------------------------------------------------------------------------
import { execFileSync } from "node:child_process";
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

// PowerShell equivalents. Functions, not aliases — PowerShell aliases cannot
// set environment variables. try/finally restores the caller's env var even if
// the client is interrupted; the health probe and fallback mirror the POSIX
// launchers exactly. Valid in both Windows PowerShell 5.1 and PowerShell 7.
function psLauncher(name, envVar, proxyUrl, providerUrl, cmd) {
  return [
    `function ${name} {`,
    `  $prev = $env:${envVar}`,
    `  try { Invoke-RestMethod -Uri 'http://localhost:4141/miserly/health' -TimeoutSec 1 | Out-Null; $env:${envVar} = '${proxyUrl}' }`,
    `  catch { $env:${envVar} = '${providerUrl}' }`,
    `  try { ${cmd} @args } finally { $env:${envVar} = $prev }`,
    `}`,
  ].join("\n");
}

export const PS_ALIAS_DEFS = {
  claude: psLauncher("miserly-claude", "ANTHROPIC_BASE_URL", "http://localhost:4141", "https://api.anthropic.com", "claude"),
  codex: psLauncher("miserly-codex", "OPENAI_BASE_URL", "http://localhost:4141/v1", "https://api.openai.com/v1", "codex"),
  aider: psLauncher("miserly-aider", "OPENAI_BASE_URL", "http://localhost:4141/v1", "https://api.openai.com/v1", "aider"),
};

// "#" starts a comment in POSIX shells AND PowerShell, so the managed-block
// markers are identical everywhere and upsertAliasBlock stays shell-agnostic.
export const BEGIN = "# >>> miserly aliases >>> (managed by `npm run setup` — safe to delete)";
export const END = "# <<< miserly aliases <<<";

/** The alias block for the chosen clients ("claude" | "codex" | "aider"). */
export function buildAliasBlock(clients, platform = process.platform) {
  const defs = platform === "win32" ? PS_ALIAS_DEFS : ALIAS_DEFS;
  const lines = [BEGIN];
  if (clients.includes("claude")) lines.push(defs.claude);
  if (clients.includes("codex")) lines.push(defs.codex, defs.aider);
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

/** Best-guess shell rc / profile file; null when we shouldn't guess (e.g. fish). */
export function detectShellRc(platform = process.platform) {
  if (platform === "win32") {
    // Ask PowerShell where its profile lives — this survives OneDrive-redirected
    // Documents folders, which a hardcoded path would miss. pwsh (PowerShell 7)
    // and Windows PowerShell 5.1 keep separate profiles; prefer whichever the
    // user has, trying pwsh first.
    for (const shell of ["pwsh", "powershell.exe"]) {
      try {
        const out = execFileSync(shell, ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE"], {
          encoding: "utf8",
          timeout: 10_000,
        }).trim();
        if (out) return out;
      } catch {
        /* shell not installed — try the next one */
      }
    }
    return join(homedir(), "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  }
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return join(homedir(), ".zshrc");
  if (shell.includes("bash")) return join(homedir(), ".bashrc");
  return null;
}

/** Apply the alias block to a shell rc / profile file on disk. */
export function writeAliases(clients, rcPath, platform = process.platform) {
  // The PowerShell profile's parent dir often doesn't exist yet; harmless on POSIX.
  mkdirSync(dirname(rcPath), { recursive: true });
  const current = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
  writeFileSync(rcPath, upsertAliasBlock(current, buildAliasBlock(clients, platform)));
}

/**
 * Remove the managed alias block from rc content; returns null when no block
 * is present (callers skip the write). Used by the uninstaller.
 */
export function removeAliasBlock(content) {
  const begin = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (begin === -1 || end === -1 || end <= begin) return null;
  const before = content.slice(0, begin).replace(/\n+$/, "\n");
  const after = content.slice(end + END.length).replace(/^\n+/, "");
  return before + after;
}
