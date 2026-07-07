// -----------------------------------------------------------------------------
// miserly uninstaller — `npm run uninstall` (add `-- --dry-run` to preview).
//
// miserly keeps almost everything inside this project folder, so a complete
// removal is mostly "delete the folder". This script cleans up the few things
// that live OUTSIDE it (or are easy to forget), then prints the final manual
// steps. It deliberately never deletes the project folder itself — a script
// should not rm -rf the repo it is running from.
//
// What it does:
//   1. Reminds you to UN-WIRE any clients pointed at the proxy (do this first —
//      a client wired to a dead proxy cannot reach the model provider at all).
//   2. Uninstalls the heavy optional packages (gpt-tokenizer, pdfjs-dist,
//      mammoth) if present, so node_modules shrinks even if you keep the repo.
//   3. Removes the proxy's machine-global config (~/.miserly).
//   4. Prints what to do by hand: stop processes, delete the folder, clear the
//      studio's browser storage.
// -----------------------------------------------------------------------------
import { existsSync, readFileSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { FEATURES } from "./features.config.mjs";
import { featurePackagesInstalled, npmUninstall } from "./lib.mjs";
import { BEGIN, detectShellRc, removeAliasBlock } from "./integrations.mjs";

const IS_WIN = process.platform === "win32";

const DRY = process.argv.includes("--dry-run");
const CONFIG_PATH =
  process.env.MISERLY_CONFIG_PATH ?? join(homedir(), ".miserly", "config.json");

const log = (msg) => console.log(msg);
const act = (msg) => console.log(`${DRY ? "[dry-run] would" : "→"} ${msg}`);

log(`\n🪙 miserly uninstall${DRY ? " (dry run — nothing will be changed)" : ""}\n`);

// 1. Un-wiring reminder — the one thing that breaks OTHER tools if forgotten.
log(`1. Un-wire your clients FIRST (skip any you never wired):
   • Claude Code — stop launching it with ANTHROPIC_BASE_URL=http://localhost:41xx
     (check your shell launchers/profile, and the "env" block of ${join(homedir(), ".claude", "settings.json")})
   • Codex / Aider — remove the OPENAI_BASE_URL override
   • Cursor — Settings → Models → clear "Override OpenAI Base URL"
   A client still pointed at the proxy after removal cannot reach its provider.\n`);

// 2. Heavy optional packages.
const heavy = FEATURES.filter((f) => f.packages.length > 0 && featurePackagesInstalled(f));
if (heavy.length === 0) {
  log("2. Heavy optional packages: none installed — nothing to remove.\n");
} else {
  const pkgs = heavy.flatMap((f) => f.packages);
  act(`npm uninstall ${pkgs.join(" ")}`);
  if (!DRY) {
    const code = await npmUninstall(pkgs, (line) => process.stdout.write(line));
    log(code === 0 ? "   ✓ removed\n" : "   ✗ npm uninstall failed — remove them manually\n");
  } else {
    log("");
  }
}

// 3. The managed launcher block that `npm run setup` may have written.
{
  const candidates = new Set([join(homedir(), ".zshrc"), join(homedir(), ".bashrc")]);
  if (IS_WIN) {
    const profile = detectShellRc();
    if (profile) candidates.add(profile);
  }
  let found = false;
  for (const rc of candidates) {
    try {
      if (!existsSync(rc)) continue;
      const content = readFileSync(rc, "utf8");
      if (!content.includes(BEGIN)) continue;
      found = true;
      act(`remove the miserly launcher block from ${rc}`);
      if (!DRY) {
        const cleaned = removeAliasBlock(content);
        if (cleaned !== null) writeFileSync(rc, cleaned);
        log("   \u2713 removed");
      }
    } catch {
      log(`   \u2717 could not update ${rc} \u2014 remove the miserly launcher block manually`);
    }
  }
  if (!found) log("3. Shell launchers: no managed miserly block found \u2014 nothing to remove.");
  log("");
}

// 4. Machine-global proxy config.
if (existsSync(CONFIG_PATH)) {
  act(`delete ${CONFIG_PATH}`);
  if (!DRY) {
    rmSync(CONFIG_PATH);
    const dir = dirname(CONFIG_PATH);
    try {
      if (readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true });
        log(`   ✓ removed (and the now-empty ${dir})`);
      } else {
        log("   ✓ removed");
      }
    } catch {
      log("   ✓ removed");
    }
  }
  log("");
} else {
  log(`4. Proxy config: ${CONFIG_PATH} not found — nothing to remove.\n`);
}

// 5. The manual tail.
log(`5. Finish by hand:
   • Stop anything still running:  ${
     IS_WIN
       ? "close the proxy/dev terminals (or: netstat -ano | findstr :4141 \u2192 taskkill /PID <pid> /F)"
       : 'pkill -f "scripts/proxy.mjs" \u00b7 stop npm run dev'
   }
   • Delete this project folder:   ${
     IS_WIN ? `Remove-Item -Recurse -Force '${process.cwd()}'` : `rm -rf ${process.cwd()}`
   }
   • Browser leftovers (optional): the studio stores settings in localStorage and
     run history in sessionStorage for its origin — clear site data for
     http://localhost:5173 in your browser to remove them.

Nothing else is installed anywhere on your system — miserly has no global npm
packages, daemons, or launch agents.${DRY ? "\n\nRun without --dry-run to apply steps 2–3." : ""}
`);
