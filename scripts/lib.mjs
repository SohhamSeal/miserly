// =============================================================================
// miserly — shared helpers for the Node-side scripts (generator + installers)
// =============================================================================
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the project root (parent of /scripts). */
export const ROOT = resolve(__dirname, "..");

export const paths = {
  root: ROOT,
  env: join(ROOT, ".env"),
  envExample: join(ROOT, ".env.example"),
  nodeModules: join(ROOT, "node_modules"),
  src: join(ROOT, "src"),
  integrations: join(ROOT, "src", "integrations"),
};

// ----------------------------------------------------------------------------
// .env handling — we only ever touch VITE_FEATURE_* keys, never anything else.
// ----------------------------------------------------------------------------

/** Parse a .env file into a plain object. Returns {} if it does not exist. */
export function readEnv(file = paths.env) {
  if (!existsSync(file)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Merge `updates` (e.g. { VITE_FEATURE_X: "true" }) into the .env file,
 * preserving any unrelated lines and comments the user may have added.
 */
export function updateEnv(updates, file = paths.env) {
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  const remaining = { ...updates };

  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key in remaining) {
      const value = remaining[key];
      delete remaining[key];
      return `${key}=${value}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(remaining)) {
    next.push(`${key}=${value}`);
  }

  // collapse trailing blank lines into a single newline
  let out = next.join("\n").replace(/\n+$/, "");
  writeFileSync(file, out + "\n", "utf8");
}

// ----------------------------------------------------------------------------
// Package detection
// ----------------------------------------------------------------------------

const require = createRequire(import.meta.url);

/** True if an npm package is resolvable from the project root. */
export function isPackageInstalled(pkg) {
  // Fast path: a directory under node_modules.
  if (existsSync(join(paths.nodeModules, ...pkg.split("/")))) return true;
  // Fallback: try to resolve its package.json (handles hoisting edge cases).
  try {
    require.resolve(`${pkg}/package.json`, { paths: [ROOT] });
    return true;
  } catch {
    return false;
  }
}

/** True if EVERY package for a feature is installed. */
export function featurePackagesInstalled(feature) {
  if (!feature.packages.length) return true;
  return feature.packages.every((p) => isPackageInstalled(p));
}

// ----------------------------------------------------------------------------
// Running npm
// ----------------------------------------------------------------------------

/**
 * Spawn a command, streaming each stdout/stderr chunk to `onData`.
 * Resolves with the exit code. Never rejects (so callers can report cleanly).
 */
export function runStreaming(command, args, onData, opts = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: process.platform === "win32", // npm.cmd on Windows needs a shell
      ...opts,
    });
    const emit = (chunk) => {
      try {
        onData?.(chunk.toString());
      } catch {
        /* ignore listener errors */
      }
    };
    child.stdout?.on("data", emit);
    child.stderr?.on("data", emit);
    child.on("error", (err) => {
      emit(`\n[error] ${err.message}\n`);
      resolvePromise(1);
    });
    child.on("close", (code) => resolvePromise(code ?? 0));
  });
}

/**
 * `npm install --no-save <pkgs...>` streaming output; resolves to exit code.
 *
 * --no-save is deliberate: optional heavy features live in node_modules ONLY,
 * so package.json / package-lock.json stay pristine (lean by default, nothing
 * to accidentally commit). The whole feature system detects packages by
 * presence, not by manifest entry. Trade-off: a fresh `npm ci` (or an
 * occasional pruning `npm install`) removes them — re-run `npm run setup`.
 */
export function npmInstall(packages, onData) {
  if (!packages.length) return Promise.resolve(0);
  return runStreaming("npm", ["install", "--no-save", ...packages], onData);
}

/** `npm uninstall --no-save <pkgs...>` — same manifest-pristine rule. */
export function npmUninstall(packages, onData) {
  if (!packages.length) return Promise.resolve(0);
  return runStreaming("npm", ["uninstall", "--no-save", ...packages], onData);
}

/** Ensure a directory exists. */
export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
