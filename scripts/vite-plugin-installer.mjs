// =============================================================================
// miserly — dev-only Vite plugin that powers the in-app "Install" button
// =============================================================================
//
// Adds a single endpoint to the dev server:
//   POST /__miserly/api/install   body: { "feature": "<key>" }
//
// It shells out to scripts/install-feature.mjs and streams the combined npm
// output back to the browser line-by-line, then writes a final sentinel line:
//   __MISERLY_DONE__{"ok":true,"code":0}
//
// On success the dev server restarts so Vite re-optimizes the newly installed
// dependency and reloads the updated .env. This plugin is `apply: "serve"`, so
// it does nothing in a production build (where there is no server to install
// packages anyway — the UI falls back to showing the CLI command).
// -----------------------------------------------------------------------------
import { spawn } from "node:child_process";
import { FEATURE_KEYS } from "./features.config.mjs";
import { ROOT } from "./lib.mjs";

const ENDPOINT = "/__miserly/api/install";

export function miserlyInstaller() {
  return {
    name: "miserly-installer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res, next) => {
        if (req.method !== "POST") return next();

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          let feature = null;
          try {
            feature = JSON.parse(body || "{}").feature ?? null;
          } catch {
            feature = null;
          }

          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.setHeader("cache-control", "no-cache");

          if (!feature || !FEATURE_KEYS.includes(feature)) {
            res.statusCode = 400;
            res.end(`__MISERLY_DONE__${JSON.stringify({ ok: false, error: "Unknown feature" })}\n`);
            return;
          }

          res.statusCode = 200;
          const child = spawn("node", ["scripts/install-feature.mjs", feature], {
            cwd: ROOT,
            shell: process.platform === "win32",
          });

          const write = (chunk) => {
            try {
              res.write(chunk);
            } catch {
              /* client may have disconnected */
            }
          };
          child.stdout.on("data", write);
          child.stderr.on("data", write);

          child.on("close", (code) => {
            const ok = code === 0;
            write(`\n__MISERLY_DONE__${JSON.stringify({ ok, code })}\n`);
            res.end();
            if (ok) {
              server.config.logger.info(
                `miserly: installed "${feature}" — restarting dev server…`,
              );
              setTimeout(() => server.restart(), 400);
            }
          });

          child.on("error", (err) => {
            write(`\n[error] ${err.message}\n__MISERLY_DONE__${JSON.stringify({ ok: false })}\n`);
            res.end();
          });
        });
      });
    },
  };
}
